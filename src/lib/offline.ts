/**
 * Opt-in, device-local storage. Callers must pass only the farmer-safe snapshot
 * subset: never sessions, CSRF tokens, CRM contacts, or health/person records.
 * Scope must come from the authenticated organization/user, not form input.
 */
export interface OfflineSnapshot<T> {
  scope: string;
  data: T;
  savedAt: string;
}

export interface MutationInput {
  path: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  version?: number;
  idempotencyKey: string;
}

export interface QueuedMutation extends MutationInput {
  scope: string;
  sequence: number;
  status: "pending" | "conflict" | "failed";
  attempts: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string | null;
  lastError?: string;
  /** Only transient/network failures may retry unchanged after the automatic limit. */
  retryable?: boolean;
}

export interface MutationResponse {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json?: () => Promise<unknown>;
}

export type MutationSender = (
  mutation: QueuedMutation,
  signal: AbortSignal,
) => Promise<MutationResponse>;

export interface FlushResult {
  status: "complete" | "backoff" | "conflict" | "failed" | "offline" | "busy";
  sent: number;
  remaining: number;
  blockedBy?: QueuedMutation;
}

interface ScopeMetadata {
  scope: string;
  lastSync: string | null;
  sequence: number;
}

const DATABASE = "agribridge-offline";
const DATABASE_VERSION = 1;
const MAX_ATTEMPTS = 8;
const inFlight = new Map<string, Promise<FlushResult>>();
const controllers = new Map<string, AbortController>();
let databasePromise: Promise<IDBDatabase> | undefined;

function checkScope(scope: string): void {
  if (
    typeof scope !== "string" ||
    scope.length > 320 ||
    !/^[^:\s]+:[^:\s]+$/.test(scope)
  ) {
    throw new Error(
      "Offline storage needs an authenticated organization:user scope.",
    );
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Offline storage is unavailable in this browser."));
      return;
    }
    let blocked = false;
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("snapshots", { keyPath: "scope" });
      const mutations = db.createObjectStore("mutations", {
        keyPath: ["scope", "idempotencyKey"],
      });
      mutations.createIndex("scope", "scope", { unique: false });
      db.createObjectStore("metadata", { keyPath: "scope" });
    };
    request.onblocked = () => {
      blocked = true;
      reject(
        new Error("Close other Agribridge tabs to update offline storage."),
      );
    };
    request.onerror = () =>
      reject(
        request.error ?? new Error("Offline storage could not be opened."),
      );
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => {
        request.result.close();
        databasePromise = undefined;
      };
      resolve(request.result);
    };
  });
  databasePromise.catch(() => {
    databasePromise = undefined;
  });
  return databasePromise;
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ?? new Error("Offline data could not be saved."),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new Error("Offline storage transaction was cancelled."),
      );
  });
}

function requested<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Offline data could not be read."));
  });
}

export async function loadSnapshot<T>(
  scope: string,
): Promise<OfflineSnapshot<T> | null> {
  checkScope(scope);
  const db = await openDatabase();
  return (
    (await requested(
      db.transaction("snapshots").objectStore("snapshots").get(scope),
    )) ?? null
  );
}

export async function saveSnapshot<T>(
  scope: string,
  data: T,
  savedAt = new Date().toISOString(),
): Promise<void> {
  checkScope(scope);
  if (!Number.isFinite(Date.parse(savedAt)))
    throw new Error("Saved workspace timestamp is invalid.");
  const db = await openDatabase();
  const transaction = db.transaction(["snapshots", "metadata"], "readwrite");
  const completion = finished(transaction);
  transaction.objectStore("snapshots").put({ scope, data, savedAt });
  const metadata = transaction.objectStore("metadata");
  const request = metadata.get(scope);
  request.onsuccess = () =>
    metadata.put({
      scope,
      sequence: request.result?.sequence ?? 0,
      lastSync: savedAt,
    });
  await completion;
}

const fieldsByType: Record<string, ReadonlySet<string>> = {
  farms: new Set([
    "name",
    "district",
    "latitude",
    "longitude",
    "areaAcres",
    "crop",
    "plantedAt",
    "ownerName",
    "stage",
    "version",
  ]),
  tasks: new Set([
    "farmId",
    "title",
    "dueDate",
    "category",
    "status",
    "version",
  ]),
  progress: new Set(["answerIndex", "lessonVersion"]),
};

/** Never silently change a payload: its idempotency key may already exist on the server. */
export function validateOfflineMutation(input: MutationInput): void {
  const match = /^\/api\/(farms|tasks|progress)(?:\/([a-zA-Z0-9_-]+))?$/.exec(
    input.path,
  );
  if (!match || !["POST", "PUT", "PATCH"].includes(input.method)) {
    throw new Error("This action cannot be saved for offline delivery.");
  }
  if (!input.idempotencyKey || input.idempotencyKey.length > 128) {
    throw new Error(
      "Offline actions need a supported method and a unique idempotency key.",
    );
  }
  if (
    !input.body ||
    typeof input.body !== "object" ||
    Array.isArray(input.body)
  )
    throw new Error("This change cannot be saved offline.");
  const body = input.body as Record<string, unknown>;
  if (
    "notes" in body ||
    Object.keys(body).some((key) => !fieldsByType[match[1]].has(key))
  ) {
    throw new Error(
      "Private notes and unsupported fields cannot be saved offline. Keep this form open, reconnect, and refresh before submitting it again.",
    );
  }
  if (match[1] === "tasks" && body.category === "follow_up")
    throw new Error("Support follow-ups must be saved while connected.");
  if (JSON.stringify(body).length > 16000)
    throw new Error("This change is too large to save offline.");
  if (
    input.version !== undefined &&
    (!Number.isSafeInteger(input.version) || input.version < 0)
  ) {
    throw new Error(
      "The saved record version is invalid. Refresh this record before editing it.",
    );
  }
}

export function blocksRecordMutation(
  queued: Pick<MutationInput, "path" | "method">,
  incoming: Pick<MutationInput, "path" | "method">,
): boolean {
  return (
    queued.path === incoming.path &&
    incoming.method !== "POST" &&
    /^\/api\/(farms|tasks|progress)\/.+/.test(incoming.path)
  );
}

export async function enqueueMutation(
  scope: string,
  input: MutationInput,
): Promise<QueuedMutation> {
  checkScope(scope);
  validateOfflineMutation(input);
  const db = await openDatabase();
  const transaction = db.transaction(["mutations", "metadata"], "readwrite");
  const completion = finished(transaction);
  const store = transaction.objectStore("mutations");
  let mutation: QueuedMutation | undefined;
  let validationError: Error | undefined;
  const existing = store.get([scope, input.idempotencyKey]);
  existing.onsuccess = () => {
    if (existing.result) {
      mutation = existing.result;
      if (
        mutation!.path !== input.path ||
        mutation!.method !== input.method ||
        mutation!.version !== input.version ||
        JSON.stringify(mutation!.body) !== JSON.stringify(input.body)
      ) {
        validationError = new Error(
          "This action key is already in use. Save the new action with a new key.",
        );
        transaction.abort();
      }
      return;
    }
    // This check shares the write transaction: two tabs cannot enqueue divergent
    // edits based on the same unacknowledged record version.
    const pending = store.index("scope").getAll(scope);
    pending.onsuccess = () => {
      if (
        (pending.result as QueuedMutation[]).some((item) =>
          blocksRecordMutation(item, input),
        )
      ) {
        validationError = new Error(
          "This record already has a saved change. Sync or review it in Connection & settings before editing again.",
        );
        transaction.abort();
        return;
      }
      const metadata = transaction.objectStore("metadata");
      const metaRequest = metadata.get(scope);
      metaRequest.onsuccess = () => {
        const meta: ScopeMetadata = metaRequest.result ?? {
          scope,
          sequence: 0,
          lastSync: null,
        };
        const now = new Date().toISOString();
        mutation = {
          ...input,
          scope,
          sequence: meta.sequence + 1,
          status: "pending",
          attempts: 0,
          createdAt: now,
          updatedAt: now,
          nextAttemptAt: null,
        };
        store.add(mutation);
        metadata.put({ ...meta, sequence: mutation.sequence });
      };
    };
  };
  try {
    await completion;
  } catch (error) {
    throw validationError ?? error;
  }
  return mutation!;
}

export async function getQueue(scope: string): Promise<QueuedMutation[]> {
  checkScope(scope);
  const db = await openDatabase();
  const result: QueuedMutation[] = await requested(
    db
      .transaction("mutations")
      .objectStore("mutations")
      .index("scope")
      .getAll(scope),
  );
  return result.sort((a, b) => a.sequence - b.sequence);
}

export async function getLastSync(scope: string): Promise<string | null> {
  checkScope(scope);
  const db = await openDatabase();
  const result: ScopeMetadata | undefined = await requested(
    db.transaction("metadata").objectStore("metadata").get(scope),
  );
  return result?.lastSync ?? null;
}

/** Explicit discard only; callers should explain that this removes an unsent change. */
export async function removeMutation(
  scope: string,
  idempotencyKey: string,
): Promise<void> {
  checkScope(scope);
  if (inFlight.has(scope))
    throw new Error(
      "A sync is still running. Wait for its result before removing a saved change.",
    );
  const db = await openDatabase();
  const transaction = db.transaction("mutations", "readwrite");
  const completion = finished(transaction);
  transaction.objectStore("mutations").delete([scope, idempotencyKey]);
  await completion;
}

export function retryUnchanged(mutation: QueuedMutation): QueuedMutation {
  if (mutation.status !== "failed" || !mutation.retryable)
    throw new Error(
      "This change needs review, not a blind retry. Refresh and compare the saved fields before replacing it.",
    );
  validateOfflineMutation(mutation);
  return {
    ...mutation,
    status: "pending",
    attempts: 0,
    nextAttemptAt: null,
    lastError: undefined,
    retryable: undefined,
    updatedAt: new Date().toISOString(),
  };
}

/** Explicitly resume a transient failure without changing its key, payload or FIFO position. */
export async function retryMutation(
  scope: string,
  idempotencyKey: string,
): Promise<void> {
  checkScope(scope);
  if (inFlight.has(scope))
    throw new Error("A sync is still running. Try again when it finishes.");
  const db = await openDatabase();
  const transaction = db.transaction("mutations", "readwrite");
  const completion = finished(transaction);
  const store = transaction.objectStore("mutations");
  const request = store.get([scope, idempotencyKey]);
  let failure: Error | undefined;
  request.onsuccess = () => {
    try {
      if (!request.result)
        throw new Error("This saved change is no longer in the queue.");
      store.put(retryUnchanged(request.result));
    } catch (error) {
      failure = error as Error;
      transaction.abort();
    }
  };
  try {
    await completion;
  } catch (error) {
    throw failure ?? error;
  }
}

/** Human-readable recovery fields. Never show stored private notes, owners or coordinates. */
export function mutationPreview(
  mutation: MutationInput,
): Array<[string, string]> {
  const labels: Record<string, string> = {
    name: "Farm",
    district: "District",
    areaAcres: "Acres",
    crop: "Crop",
    plantedAt: "Planted",
    stage: "Stage",
    title: "Task",
    dueDate: "Due",
    category: "Category",
    status: "Status",
    answerIndex: "Answer option",
    lessonVersion: "Guide edition",
  };
  const body = mutation.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.entries(body)
    .filter(
      ([key, value]) =>
        labels[key] && ["string", "number", "boolean"].includes(typeof value),
    )
    .map(([key, value]) => [
      labels[key],
      String(
        key === "answerIndex" && typeof value === "number" ? value + 1 : value,
      ).slice(0, 200),
    ]);
}

export function pauseSync(scope: string): void {
  controllers.get(scope)?.abort();
}

export async function clearScope(scope: string): Promise<void> {
  checkScope(scope);
  controllers.get(scope)?.abort();
  const db = await openDatabase();
  const transaction = db.transaction(
    ["snapshots", "mutations", "metadata"],
    "readwrite",
  );
  const completion = finished(transaction);
  transaction.objectStore("snapshots").delete(scope);
  transaction.objectStore("metadata").delete(scope);
  const mutations = transaction.objectStore("mutations");
  const request = mutations.index("scope").getAllKeys(scope);
  request.onsuccess = () =>
    request.result.forEach((key) => mutations.delete(key));
  await completion;
}

/** Retryable response classification is shared with tests and status presentation. */
export function deliveryOutcome(
  status: number,
): "success" | "conflict" | "retry" | "failed" {
  if (status >= 200 && status < 300) return "success";
  if (status === 409) return "conflict";
  if (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    status === 0
  )
    return "retry";
  return "failed";
}

export function retryDelay(
  attempt: number,
  retryAfter?: string | null,
  now = Date.now(),
): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const delay = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(retryAfter) - now;
    if (Number.isFinite(delay) && delay > 0)
      return Math.min(delay, 24 * 60 * 60 * 1000);
  }
  return Math.min(
    5_000 * 2 ** Math.min(Math.max(attempt - 1, 0), 12),
    30 * 60 * 1000,
  );
}

async function updateMutation(
  mutation: QueuedMutation,
  delivered = false,
): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(["mutations", "metadata"], "readwrite");
  const completion = finished(transaction);
  const store = transaction.objectStore("mutations");
  const request = store.get([mutation.scope, mutation.idempotencyKey]);
  request.onsuccess = () => {
    // Logout/discard may remove an entry while its network request is running.
    // Never recreate deleted local data when that request settles.
    if (!request.result) return;
    if (!delivered) {
      store.put(mutation);
      return;
    }
    store.delete([mutation.scope, mutation.idempotencyKey]);
    const metadata = transaction.objectStore("metadata");
    const metaRequest = metadata.get(mutation.scope);
    metaRequest.onsuccess = () => {
      if (metaRequest.result)
        metadata.put({
          ...metaRequest.result,
          lastSync: new Date().toISOString(),
        });
    };
  };
  await completion;
}

async function failureMessage(response: MutationResponse): Promise<string> {
  if (response.status === 409)
    return "This record changed on another device. Refresh it, compare your change, then save again.";
  if (response.status === 401 || response.status === 403)
    return "Your session or permissions changed. Sign in and review this change before saving again.";
  try {
    const body = (await response.json?.()) as
      { error?: { message?: unknown } } | undefined;
    if (typeof body?.error?.message === "string")
      return body.error.message.slice(0, 240);
  } catch {
    /* A delivery error may have no JSON body. */
  }
  return "This change could not be accepted. Review the record and save it again.";
}

async function flushUnlocked(
  scope: string,
  send: MutationSender,
): Promise<FlushResult> {
  let sent = 0;
  let queue = await getQueue(scope);
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return { status: "offline", sent, remaining: queue.length };
  while (queue.length) {
    const mutation = queue[0];
    if (mutation.status !== "pending")
      return {
        status: mutation.status,
        sent,
        remaining: queue.length,
        blockedBy: mutation,
      };
    if (
      mutation.nextAttemptAt &&
      Date.parse(mutation.nextAttemptAt) > Date.now()
    )
      return {
        status: "backoff",
        sent,
        remaining: queue.length,
        blockedBy: mutation,
      };
    mutation.attempts += 1;
    mutation.updatedAt = new Date().toISOString();
    await updateMutation(mutation);
    const controller = new AbortController();
    controllers.set(scope, controller);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const aborted = new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () =>
            reject(
              new Error(
                "Connection interrupted. Your change remains saved on this device.",
              ),
            ),
          { once: true },
        );
      });
      timeout = setTimeout(() => controller.abort(), 25_000);
      const response = await Promise.race([
        send(mutation, controller.signal),
        aborted,
      ]);
      const outcome = deliveryOutcome(response.status);
      if (outcome === "success" && response.ok) {
        await updateMutation(mutation, true);
        sent += 1;
      } else if (outcome === "retry") {
        mutation.retryable = true;
        mutation.status =
          mutation.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
        mutation.nextAttemptAt = new Date(
          Date.now() +
            retryDelay(mutation.attempts, response.headers?.get("Retry-After")),
        ).toISOString();
        mutation.lastError =
          mutation.status === "failed"
            ? "Delivery has repeatedly failed. Check your connection and review this saved change before trying again."
            : "The service is temporarily unavailable. This change is saved for retry.";
        await updateMutation(mutation);
        return {
          status: mutation.status === "failed" ? "failed" : "backoff",
          sent,
          remaining: (await getQueue(scope)).length,
          blockedBy: mutation,
        };
      } else {
        mutation.retryable = false;
        mutation.status = outcome === "conflict" ? "conflict" : "failed";
        mutation.nextAttemptAt = null;
        mutation.lastError = await failureMessage(response);
        await updateMutation(mutation);
        return {
          status: mutation.status,
          sent,
          remaining: (await getQueue(scope)).length,
          blockedBy: mutation,
        };
      }
    } catch (error) {
      mutation.retryable = true;
      mutation.status =
        mutation.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      mutation.nextAttemptAt = new Date(
        Date.now() + retryDelay(mutation.attempts),
      ).toISOString();
      mutation.lastError =
        mutation.status === "failed"
          ? "Delivery has repeatedly failed. Review this saved change before trying again."
          : "Connection interrupted. This change remains saved on this device.";
      await updateMutation(mutation);
      return {
        status: mutation.status === "failed" ? "failed" : "backoff",
        sent,
        remaining: (await getQueue(scope)).length,
        blockedBy: mutation,
      };
    } finally {
      clearTimeout(timeout);
      if (controllers.get(scope) === controller) controllers.delete(scope);
    }
    queue = await getQueue(scope);
  }
  return { status: "complete", sent, remaining: 0 };
}

/** FIFO replay. A failed/conflicting predecessor pauses its dependent changes. */
export async function flushQueue(
  scope: string,
  send: MutationSender,
): Promise<FlushResult> {
  checkScope(scope);
  const existing = inFlight.get(scope);
  if (existing) return existing;
  const promise: Promise<FlushResult> = (async () => {
    if (typeof navigator !== "undefined" && navigator.locks) {
      return await navigator.locks.request(
        `agribridge-sync:${scope}`,
        { ifAvailable: true },
        async (lock) =>
          lock
            ? flushUnlocked(scope, send)
            : {
                status: "busy" as const,
                sent: 0,
                remaining: (await getQueue(scope)).length,
              },
      );
    }
    return flushUnlocked(scope, send);
  })();
  inFlight.set(scope, promise);
  try {
    return await promise;
  } finally {
    if (inFlight.get(scope) === promise) inFlight.delete(scope);
  }
}
