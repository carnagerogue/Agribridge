import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Bootstrap, Role, User } from "../types";
import { ApiError, rawRequest, request, setCsrfToken } from "../lib/api";
import {
  clearScope,
  blocksRecordMutation,
  enqueueMutation,
  flushQueue,
  getQueue,
  loadSnapshot,
  removeMutation,
  retryMutation,
  pauseSync,
  saveSnapshot,
  type QueuedMutation,
} from "../lib/offline";

const empty: Bootstrap = {
  farms: [],
  tasks: [],
  contacts: [],
  marketPrices: [],
  offers: [],
  deals: [],
  reports: [],
  lessons: [],
  progress: [],
  messages: [],
  seasons: [],
  lots: [],
  collections: [],
  settings: {
    language: "en",
    lowDataMode: true,
    preferredChannel: "sms",
    notifications: false,
  },
};
type Context = {
  user: User | null;
  data: Bootstrap;
  loading: boolean;
  demo: boolean;
  error: string;
  online: boolean;
  offlineEnabled: boolean;
  queue: QueuedMutation[];
  lastSync: string;
  toast: string;
  login: (email: string, password: string) => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  demoLogin: (role: Role) => Promise<void>;
  logout: () => Promise<void>;
  lockWorkspace: () => Promise<void>;
  refresh: () => Promise<Bootstrap | undefined>;
  mutate: <T>(
    path: string,
    method: string,
    body: unknown,
    offline?: boolean,
  ) => Promise<T | { queued: true }>;
  notify: (message: string) => void;
  setOfflineEnabled: (enabled: boolean) => Promise<void>;
  sync: () => Promise<void>;
  discard: (key: string) => Promise<void>;
  retry: (key: string) => Promise<void>;
};
const AppContext = createContext<Context | null>(null);
const scopeOf = (user: User) => user.organizationId + ":" + user.id;
const consentKey = (scope: string) => "agribridge:offline:" + scope;
const OFFLINE_USER = "agribridge:offline-user";
export const LOCAL_LOGOUT_LOCK = "agribridge:local-logout";
export const LOCAL_ACCESS_LOCK = "agribridge:access-lock";
const allowedTaskCategories = new Set([
  "general",
  "scouting",
  "planting",
  "watering",
  "harvest",
  "learning",
]);

/** The API scopes farmer records to their owner; staff-wide lists must not persist. */
export function safeData(data: Bootstrap, user: User): Bootstrap {
  const farmer = user.role === "farmer";
  return {
    farms: farmer
      ? data.farms.map((farm) => ({
          id: farm.id,
          version: farm.version,
          createdAt: farm.createdAt,
          updatedAt: farm.updatedAt,
          name: farm.name,
          district: farm.district,
          latitude: farm.latitude,
          longitude: farm.longitude,
          areaAcres: farm.areaAcres,
          crop: farm.crop,
          plantedAt: farm.plantedAt,
          ownerName: farm.ownerName,
          stage: farm.stage,
          notes: "",
        }))
      : [],
    tasks: farmer
      ? data.tasks
          .filter((task) => allowedTaskCategories.has(task.category))
          .map((task) => ({
            id: task.id,
            version: task.version,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            farmId: task.farmId,
            title: task.title,
            dueDate: task.dueDate,
            category: task.category,
            status: task.status,
            notes: "",
          }))
      : [],
    contacts: [],
    offers: [],
    deals: [],
    reports: [],
    messages: [],
    seasons: [],
    lots: [],
    collections: [],
    marketPrices: data.marketPrices.map((price) => ({
      id: price.id,
      version: price.version,
      createdAt: price.createdAt,
      updatedAt: price.updatedAt,
      crop: price.crop,
      market: price.market,
      district: price.district,
      priceUgx: price.priceUgx,
      unit: price.unit,
      observedAt: price.observedAt,
      source: price.source,
      status: price.status,
    })),
    lessons: data.lessons.map((lesson) => ({
      id: lesson.id,
      crop: lesson.crop,
      title: lesson.title,
      summary: lesson.summary,
      durationMinutes: lesson.durationMinutes,
      level: lesson.level,
      sections: lesson.sections.map((section) => ({
        heading: section.heading,
        body: section.body,
      })),
      quiz: {
        question: lesson.quiz.question,
        options: [...lesson.quiz.options],
      },
      sourceTitle: lesson.sourceTitle,
      sourceUrl: lesson.sourceUrl,
      reviewStatus: lesson.reviewStatus,
    })),
    progress: data.progress.map((progress) => ({
      id: progress.id,
      lessonId: progress.lessonId,
      completed: progress.completed,
      score: progress.score,
    })),
    settings: {
      language: data.settings.language,
      lowDataMode: data.settings.lowDataMode,
      preferredChannel: data.settings.preferredChannel,
      notifications: data.settings.notifications,
    },
  };
}

export function locallySignedOut(
  storage: Pick<Storage, "getItem"> = localStorage,
): boolean {
  try {
    return (
      storage.getItem(LOCAL_LOGOUT_LOCK) === "true" ||
      storage.getItem(LOCAL_ACCESS_LOCK) === "true"
    );
  } catch {
    return true;
  }
}

export function persistLocalLogout(
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(LOCAL_LOGOUT_LOCK, "true");
}

export function persistAccessLock(
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(LOCAL_ACCESS_LOCK, "true");
}

/** Overlay acknowledged local intent without inventing server IDs or record versions. */
export function applyQueuedUpdates(
  data: Bootstrap,
  queue: QueuedMutation[],
): Bootstrap {
  const overlay = <T extends { id: string; version: number }>(
    type: "farms" | "tasks",
    records: T[],
  ): T[] =>
    records.map((record) => {
      const item = queue.find(
        (change) =>
          change.method === "PATCH" &&
          change.path === `/api/${type}/${record.id}` &&
          change.status !== "conflict",
      );
      if (
        !item?.body ||
        typeof item.body !== "object" ||
        Array.isArray(item.body)
      )
        return record;
      const body = item.body as Record<string, unknown>;
      if (body.version !== record.version) return record;
      const permitted =
        type === "farms"
          ? ["name", "district", "areaAcres", "crop", "plantedAt", "stage"]
          : ["title", "dueDate", "category", "status"];
      return {
        ...record,
        ...Object.fromEntries(
          Object.entries(body).filter(([key]) => permitted.includes(key)),
        ),
      };
    });
  return {
    ...data,
    farms: overlay("farms", data.farms),
    tasks: overlay("tasks", data.tasks),
  };
}

function hasOfflineConsent(scope: string): boolean {
  try {
    return localStorage.getItem(consentKey(scope)) === "true";
  } catch {
    return false;
  }
}

function rememberedUser(): User | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(OFFLINE_USER) ?? "null",
    ) as User | null;
    return value &&
      typeof value.id === "string" &&
      typeof value.organizationId === "string" &&
      typeof value.name === "string" &&
      typeof value.organizationName === "string" &&
      ["farmer", "operator", "admin"].includes(value.role) &&
      !value.passwordChangeRequired
      ? value
      : null;
  } catch {
    return null;
  }
}

function rememberUser(user: User) {
  localStorage.setItem(
    OFFLINE_USER,
    JSON.stringify({
      id: user.id,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: user.organizationName,
    }),
  );
}

function connectionFailure(failure: unknown) {
  return (
    failure instanceof TypeError ||
    failure instanceof DOMException ||
    (failure instanceof ApiError && failure.status >= 500)
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [data, setData] = useState<Bootstrap>(empty),
    [loading, setLoading] = useState(true),
    [demo, setDemo] = useState(false),
    [error, setError] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [offlineEnabled, setOffline] = useState(false),
    [queue, setQueue] = useState<QueuedMutation[]>([]),
    [lastSync, setLastSync] = useState(""),
    [toast, setToast] = useState("");
  const userRef = useRef(user);
  userRef.current = user;
  const dataRef = useRef(data);
  dataRef.current = data;
  // True once this session has loaded the workspace from the server. A device
  // copy must never be saved from the empty state shown while it loads.
  const loadedRef = useRef(false);
  const generation = useRef(0);
  const notify = useCallback((message: string) => setToast(message), []);
  const clearInterface = useCallback(() => {
    generation.current += 1;
    userRef.current = null;
    dataRef.current = empty;
    loadedRef.current = false;
    setCsrfToken("");
    setUser(null);
    setData(empty);
    setQueue([]);
    setOffline(false);
    setLastSync("");
    setToast("");
  }, []);
  const lockAfterRejection = useCallback(() => {
    const current = userRef.current;
    persistAccessLock();
    if (current) pauseSync(scopeOf(current));
    clearInterface();
    setError(
      "Access is locked. Connect and sign in again. Unsynced changes remain saved on this device.",
    );
  }, [clearInterface]);
  const isCurrent = useCallback(
    (current: User, revision: number) =>
      generation.current === revision &&
      userRef.current?.id === current.id &&
      userRef.current?.organizationId === current.organizationId &&
      !locallySignedOut(),
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const up = () => setOnline(true),
      down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (
        ![LOCAL_LOGOUT_LOCK, LOCAL_ACCESS_LOCK].includes(event.key ?? "") ||
        event.newValue !== "true"
      )
        return;
      const current = userRef.current;
      if (current) pauseSync(scopeOf(current));
      clearInterface();
      setError(
        "Workspace locked on this device. Connect and sign in to open it again.",
      );
      if (current && event.key === LOCAL_LOGOUT_LOCK)
        void clearScope(scopeOf(current)).catch(() => {});
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [clearInterface]);

  const accept = useCallback(
    async (
      session: { user: User; csrfToken: string },
      explicitLogin = false,
    ) => {
      if (!explicitLogin && locallySignedOut()) return;
      const enteringRevision = generation.current;
      const previous = userRef.current ?? rememberedUser();
      if (
        previous &&
        scopeOf(previous) !== scopeOf(session.user) &&
        (await getQueue(scopeOf(previous))).length
      ) {
        persistAccessLock();
        clearInterface();
        throw new Error(
          "This device has unsynced work in the previous account. Sign in to that account to sync or review it before switching accounts.",
        );
      }
      if (generation.current !== enteringRevision)
        throw new Error("Sign-in was interrupted. Please sign in again.");
      if (explicitLogin) {
        localStorage.removeItem(LOCAL_LOGOUT_LOCK);
        localStorage.removeItem(LOCAL_ACCESS_LOCK);
      }
      const revision = ++generation.current;
      userRef.current = session.user;
      setCsrfToken(session.csrfToken);
      setUser(session.user);
      setData(empty);
      loadedRef.current = false;
      setQueue([]);
      setError("");
      setLastSync("");
      setOnline(navigator.onLine);
      const scope = scopeOf(session.user);
      const enabled =
        hasOfflineConsent(scope) && !session.user.passwordChangeRequired;
      setOffline(enabled);
      try {
        if (previous && scopeOf(previous) !== scope) {
          localStorage.removeItem(consentKey(scopeOf(previous)));
          await clearScope(scopeOf(previous));
        }
        if (!isCurrent(session.user, revision)) return;
        if (enabled) {
          rememberUser(session.user);
          const cached = await loadSnapshot<Bootstrap>(scope);
          if (!isCurrent(session.user, revision)) return;
          if (cached) {
            const sanitized = safeData(
              { ...empty, ...cached.data },
              session.user,
            );
            setData(sanitized);
            setLastSync(cached.savedAt);
            await saveSnapshot(scope, sanitized, cached.savedAt);
            if (!isCurrent(session.user, revision)) {
              await clearScope(scope);
              return;
            }
          }
          const pending = await getQueue(scope);
          if (isCurrent(session.user, revision)) setQueue(pending);
        } else localStorage.removeItem(OFFLINE_USER);
      } catch {
        if (isCurrent(session.user, revision))
          setError(
            "Signed in. Saved device data could not be loaded; reconnect to refresh your workspace.",
          );
      }
    },
    [isCurrent, clearInterface],
  );

  const refresh = useCallback(async () => {
    const current = userRef.current,
      revision = generation.current;
    if (!current || locallySignedOut()) return;
    try {
      const next = await request<Bootstrap>("/api/bootstrap");
      if (!isCurrent(current, revision)) return;
      const complete = { ...empty, ...next };
      setData(complete);
      loadedRef.current = true;
      setError("");
      setLastSync(new Date().toISOString());
      // A response that was already in flight must not hide a connection the
      // browser has since lost; the "online" event restores the state.
      setOnline(navigator.onLine);
      const scope = scopeOf(current);
      if (hasOfflineConsent(scope)) {
        try {
          await saveSnapshot(scope, safeData(complete, current));
          if (!isCurrent(current, revision)) {
            await clearScope(scope);
            return;
          }
          const pending = await getQueue(scope);
          if (isCurrent(current, revision)) setQueue(pending);
        } catch {
          if (isCurrent(current, revision))
            notify(
              "Workspace refreshed. This browser could not update its saved offline copy.",
            );
        }
      }
      return complete;
    } catch (failure) {
      if (!isCurrent(current, revision)) return;
      if (failure instanceof ApiError && failure.status === 401) {
        lockAfterRejection();
      } else {
        if (connectionFailure(failure)) {
          setOnline(false);
          setData(safeData(dataRef.current, current));
        }
        setError(
          failure instanceof Error ? failure.message : "Unable to refresh.",
        );
      }
      throw failure;
    }
  }, [lockAfterRejection, isCurrent, notify]);

  useEffect(() => {
    let active = true;
    void request<{ mode: string }>("/api/health")
      .then((health) => {
        if (active) setDemo(health.mode === "demo");
      })
      .catch(() => {});
    if (locallySignedOut()) {
      setLoading(false);
      return () => {
        active = false;
      };
    }
    void (async () => {
      try {
        const session = await request<{ user: User; csrfToken: string }>(
          "/api/auth/session",
        );
        if (active && !locallySignedOut()) await accept(session);
      } catch (failure) {
        if (!active || locallySignedOut()) return;
        if (failure instanceof ApiError && failure.status < 500) {
          setOnline(navigator.onLine);
          if (failure.status === 401 && rememberedUser()) lockAfterRejection();
          return;
        }
        if (connectionFailure(failure)) setOnline(false);
        setError("Connection unavailable. Reconnect to sign in.");
        const saved = rememberedUser();
        if (saved && hasOfflineConsent(scopeOf(saved))) {
          try {
            const cached = await loadSnapshot<Bootstrap>(scopeOf(saved));
            if (!active || locallySignedOut() || !cached) return;
            const sanitized = safeData({ ...empty, ...cached.data }, saved);
            const revision = ++generation.current;
            userRef.current = saved;
            setUser(saved);
            setData(sanitized);
            setOffline(true);
            setLastSync(cached.savedAt);
            setError("Showing your saved workspace. Reconnect to sync.");
            const pending = await getQueue(scopeOf(saved));
            if (!active || !isCurrent(saved, revision)) return;
            setQueue(pending);
            await saveSnapshot(scopeOf(saved), sanitized, cached.savedAt);
            if (!isCurrent(saved, revision)) await clearScope(scopeOf(saved));
          } catch {
            /* Sign-in remains usable when browser storage is unavailable. */
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [accept, isCurrent, lockAfterRejection]);

  useEffect(() => {
    if (online || locallySignedOut()) return;
    let active = true,
      checking = false;
    const timer = setInterval(() => {
      if (
        checking ||
        !navigator.onLine ||
        document.visibilityState === "hidden"
      )
        return;
      checking = true;
      void request<{ mode: string }>("/api/health")
        .then((health) => {
          if (active && !locallySignedOut()) {
            setDemo(health.mode === "demo");
            setOnline(navigator.onLine);
          }
        })
        .catch(() => {})
        .finally(() => {
          checking = false;
        });
    }, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [online, user?.id]);

  useEffect(() => {
    if (user && online && !user.passwordChangeRequired)
      void refresh().catch(() => {});
  }, [user?.id, user?.passwordChangeRequired, online, refresh]);
  const login = async (email: string, password: string) => {
    const revision = generation.current;
    const session = await request<{ user: User; csrfToken: string }>(
      "/api/auth/login",
      "POST",
      { email, password },
    );
    if (revision !== generation.current)
      throw new Error("Sign-in was interrupted. Please sign in again.");
    await accept(session, true);
  };
  const changePassword = async (
    currentPassword: string,
    newPassword: string,
  ) => {
    const revision = generation.current;
    const session = await request<{ user: User; csrfToken: string }>(
      "/api/auth/password",
      "POST",
      { currentPassword, newPassword },
    );
    if (revision === generation.current) await accept(session);
  };
  const demoLogin = async (role: Role) => {
    if (queue.length)
      throw new Error(
        "Sync or discard pending changes before switching workspaces.",
      );
    const revision = generation.current;
    const session = await request<{ user: User; csrfToken: string }>(
      "/api/auth/demo",
      "POST",
      { role },
    );
    if (revision !== generation.current)
      throw new Error("Sign-in was interrupted. Please try again.");
    await accept(session, true);
  };
  const logout = async () => {
    const current = userRef.current;
    if (
      queue.length ||
      (current &&
        hasOfflineConsent(scopeOf(current)) &&
        (await getQueue(scopeOf(current))).length)
    )
      throw new Error(
        "Sync or review pending changes before signing out. Use Lock workspace to keep your saved work and hide this workspace now.",
      );
    persistLocalLogout();
    // Build the remote request with current CSRF before clearing local identity.
    const remote = navigator.onLine
      ? rawRequest("/api/auth/logout", "POST", {})
          .then((response) => response.ok || response.status === 401)
          .catch(() => false)
      : Promise.resolve(false);
    const remembered = rememberedUser();
    clearInterface();
    setError("");
    const scopes = new Set(
      [current, remembered]
        .filter((value): value is User => value !== null)
        .map(scopeOf),
    );
    localStorage.removeItem(OFFLINE_USER);
    for (const scope of scopes) localStorage.removeItem(consentKey(scope));
    const cleared = await Promise.allSettled([...scopes].map(clearScope));
    const revoked = await remote;
    if (!locallySignedOut()) return;
    if (cleared.some((result) => result.status === "rejected"))
      setError(
        "Signed out. Some saved device data could not be removed. Clear this site’s browser data before sharing the device.",
      );
    else if (!revoked)
      setError(
        "Signed out on this device. The server could not be reached; this browser stays locked until you explicitly sign in.",
      );
  };

  const lockWorkspace = async () => {
    const current = userRef.current;
    persistAccessLock();
    const remote = navigator.onLine
      ? rawRequest("/api/auth/logout", "POST", {}).catch(() => undefined)
      : Promise.resolve();
    if (current) pauseSync(scopeOf(current));
    clearInterface();
    setError(
      "Workspace locked. Connect and sign in to reopen it. Unsynced work stays saved on this device; locking does not encrypt browser storage.",
    );
    await remote;
  };

  const sync = useCallback(async () => {
    const current = userRef.current,
      revision = generation.current;
    if (!current || !navigator.onLine || locallySignedOut()) return;
    const scope = scopeOf(current);
    try {
      const session = await request<{ user: User; csrfToken: string }>(
        "/api/auth/session",
      );
      if (!isCurrent(current, revision)) return;
      if (
        session.user.id !== current.id ||
        session.user.organizationId !== current.organizationId
      )
        throw new Error("Sign in to this workspace before syncing.");
      setCsrfToken(session.csrfToken);
      let connectionLost = false;
      const result = await flushQueue(scope, async (mutation, signal) => {
        if (!isCurrent(current, revision))
          throw new Error("Session changed. Sign in before syncing.");
        try {
          const response = await rawRequest(
            mutation.path,
            mutation.method,
            mutation.body,
            mutation.idempotencyKey,
            signal,
          );
          if (response.status === 401) lockAfterRejection();
          if (response.status >= 500) connectionLost = true;
          return response;
        } catch (failure) {
          connectionLost = true;
          throw failure;
        }
      });
      if (!isCurrent(current, revision)) return;
      setQueue(await getQueue(scope));
      if (result.sent) await refresh().catch(() => {});
      else
        setOnline(
          navigator.onLine && !connectionLost && result.status !== "offline",
        );
      if (result.status === "conflict")
        notify(
          "A record changed elsewhere. Review the conflict in Connection & settings.",
        );
      else if (result.sent)
        notify(
          String(result.sent) +
            " saved change" +
            (result.sent === 1 ? "" : "s") +
            " synced.",
        );
    } catch (failure) {
      if (isCurrent(current, revision)) {
        if (failure instanceof ApiError && failure.status === 401) {
          lockAfterRejection();
          return;
        }
        if (connectionFailure(failure)) setOnline(false);
        notify(
          failure instanceof Error
            ? failure.message
            : "Sync unavailable. Try again when connected.",
        );
      }
    }
  }, [isCurrent, lockAfterRejection, notify, refresh]);
  useEffect(() => {
    if (online && offlineEnabled && user) void sync();
  }, [online, offlineEnabled, user?.id, sync]);
  useEffect(() => {
    if (
      !online ||
      !offlineEnabled ||
      !user ||
      !queue.some((item) => item.status === "pending")
    )
      return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void sync();
    }, 30_000);
    return () => clearInterval(timer);
  }, [online, offlineEnabled, user?.id, queue, sync]);

  const mutate = async <T,>(
    path: string,
    method: string,
    body: unknown,
    canQueue = false,
  ): Promise<T | { queued: true }> => {
    const current = userRef.current,
      revision = generation.current;
    if (!current || locallySignedOut()) throw new Error("Please sign in.");
    if (offlineEnabled) {
      const pending = await getQueue(scopeOf(current));
      if (
        pending.some((item) =>
          blocksRecordMutation(item, { path, method: method as "PATCH" }),
        )
      ) {
        throw new Error(
          "This record already has a saved change. Sync or review it in Connection & settings before editing again.",
        );
      }
    }
    const key = crypto.randomUUID();
    let result: T;
    try {
      if (!navigator.onLine) throw new TypeError("Offline");
      result = await request<T>(path, method, body, key);
    } catch (failure) {
      if (!isCurrent(current, revision))
        throw new Error("Your session changed. Sign in before saving.");
      if (failure instanceof ApiError && failure.status === 401) {
        lockAfterRejection();
        throw failure;
      }
      if (connectionFailure(failure)) setOnline(false);
      const permittedOfflinePath =
        /^\/api\/(?:farms|tasks|progress)(?:\/[^/?#]+)?$/.test(path);
      if (
        canQueue &&
        permittedOfflinePath &&
        current.role === "farmer" &&
        offlineEnabled &&
        connectionFailure(failure)
      ) {
        const scope = scopeOf(current);
        await enqueueMutation(scope, {
          path,
          method: method as "POST" | "PATCH" | "PUT",
          body,
          idempotencyKey: key,
        });
        if (!isCurrent(current, revision)) {
          await clearScope(scope);
          throw new Error("Your session changed. Sign in before saving.");
        }
        if (isCurrent(current, revision)) {
          setQueue(await getQueue(scope));
          notify("Saved on this device. Waiting to sync.");
        }
        return { queued: true };
      }
      throw failure;
    }
    // A confirmed save must not become a retry because refreshing the view failed.
    if (isCurrent(current, revision)) {
      try {
        await refresh();
        if (isCurrent(current, revision)) notify("Saved to your workspace.");
      } catch {
        if (isCurrent(current, revision))
          notify(
            "Your change was saved. Reconnect and refresh to see the latest workspace.",
          );
      }
    }
    return result;
  };
  const setOfflineEnabled = async (enabled: boolean) => {
    const current = userRef.current,
      revision = generation.current;
    if (!current || locallySignedOut()) return;
    const scope = scopeOf(current);
    if (!enabled && queue.length)
      throw new Error(
        "Sync or discard pending changes before clearing offline storage.",
      );
    if (enabled) {
      let workspace = dataRef.current;
      if (!loadedRef.current) {
        // Still loading, or showing an earlier device copy: fetch first.
        const loaded = await refresh().catch(() => undefined);
        if (!isCurrent(current, revision)) return;
        if (!loaded)
          throw new Error(
            "Connect to load your workspace before saving it on this device.",
          );
        workspace = loaded;
      }
      await saveSnapshot(scope, safeData(workspace, current));
      if (!isCurrent(current, revision)) {
        await clearScope(scope);
        return;
      }
      localStorage.setItem(consentKey(scope), "true");
      rememberUser(current);
    } else {
      await clearScope(scope);
      localStorage.removeItem(consentKey(scope));
      localStorage.removeItem(OFFLINE_USER);
    }
    if (isCurrent(current, revision)) {
      setOffline(enabled);
      notify(
        enabled
          ? current.role === "farmer"
            ? "Your farm records and lessons are saved. Notes and support records stay online."
            : "Learning and public market information are saved. Staff farm and support records stay online."
          : "Saved device data cleared.",
      );
    }
  };
  const discard = async (key: string) => {
    const current = userRef.current;
    if (!current) return;
    const scope = scopeOf(current);
    await removeMutation(scope, key);
    setQueue(await getQueue(scope));
    notify("Pending change discarded.");
  };
  const retry = async (key: string) => {
    const current = userRef.current,
      revision = generation.current;
    if (!current || locallySignedOut()) return;
    await retryMutation(scopeOf(current), key);
    if (!isCurrent(current, revision)) return;
    setQueue(await getQueue(scopeOf(current)));
    notify(
      "The same saved change is ready to retry. Its original delivery key is preserved.",
    );
    await sync();
  };
  const visibleData = useMemo(
    () => applyQueuedUpdates(data, queue),
    [data, queue],
  );
  return (
    <AppContext.Provider
      value={{
        user,
        data: visibleData,
        loading,
        demo,
        error,
        online,
        offlineEnabled,
        queue,
        lastSync,
        toast,
        login,
        changePassword,
        logout,
        lockWorkspace,
        demoLogin,
        refresh,
        mutate,
        notify,
        setOfflineEnabled,
        sync,
        discard,
        retry,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("AppProvider required");
  return value;
}
