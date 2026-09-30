import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  Send,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { ApiError, rawRequest } from "../lib/api";
import { dateTime } from "../lib/format";
import {
  Badge,
  Button,
  Empty,
  ErrorMessage,
  Field,
  Notice,
  Skeleton,
} from "./ui";
import "../styles/whatsapp-inbox.css";

export interface InboxReply {
  id: string;
  body: string | null;
  createdAt: string;
  status: "queued" | "sent" | "delivered" | "failed" | "not_configured";
  deliveryUncertain: boolean;
  error: string | null;
  sample: boolean;
}
export interface WhatsAppInboxItem {
  id: string;
  from: string;
  body: string | null;
  contentType: "text" | "unsupported";
  truncated?: boolean;
  command: "stop" | "help" | "start" | "message";
  occurredAt: string;
  receivedAt: string;
  contact: { id: string; name: string } | null;
  replyWindowExpiresAt: string | null;
  canReply: boolean;
  replyBlockedReason:
    | "window_expired"
    | "stopped"
    | "not_configured"
    | "demo"
    | "expired"
    | "reply_unresolved"
    | null;
  replies: InboxReply[];
  sample: boolean;
}
interface InboxPage {
  items: WhatsAppInboxItem[];
  nextCursor: string | null;
  retentionDays: number;
}
export interface ReplyAttempt {
  inboxId: string;
  body: string;
  key: string;
  state: "submitting" | "unknown" | "resolved";
  reply?: InboxReply;
}

export function inboxConnectionFailure(failure: unknown): boolean {
  return (
    failure instanceof TypeError ||
    failure instanceof DOMException ||
    (failure instanceof ApiError && failure.status >= 500)
  );
}

/** Hide private read data immediately; retain only an unresolved original request
 * in memory until a successful read or the parent offline boundary unmounts us. */
export function privateStateAfterReadFailure(
  attempts: Record<string, ReplyAttempt>,
): {
  page: InboxPage;
  drafts: Record<string, string>;
  attempts: Record<string, ReplyAttempt>;
} {
  return {
    page: { items: [], nextCursor: null, retentionDays: 30 },
    drafts: {},
    attempts: Object.fromEntries(
      Object.entries(attempts).filter(
        ([, attempt]) =>
          attempt.state === "unknown" || attempt.state === "submitting",
      ),
    ),
  };
}

export function replyNeedsConfirmation(reply: InboxReply): boolean {
  return (
    reply.status !== "delivered" &&
    (reply.deliveryUncertain || reply.status === "queued")
  );
}

export function replyAvailability(
  item: WhatsAppInboxItem,
  now = Date.now(),
): { allowed: boolean; explanation: string } {
  if (item.sample || item.replyBlockedReason === "demo")
    return {
      allowed: false,
      explanation:
        "Sample conversation. Demo replies are disabled; nothing can be sent to a phone.",
    };
  if (item.command === "stop" || item.replyBlockedReason === "stopped")
    return {
      allowed: false,
      explanation:
        "STOP received. Do not reply or enrol this person in alerts. A new support message must reopen the conversation.",
    };
  if (
    item.replyBlockedReason === "expired" ||
    (item.body === null && item.contentType === "text")
  )
    return {
      allowed: false,
      explanation:
        "Message content has expired under the retention policy. Ask the person to contact the team again.",
    };
  if (item.replyBlockedReason === "not_configured")
    return {
      allowed: false,
      explanation:
        "WhatsApp delivery is not connected. Ask an administrator to complete the provider setup.",
    };
  if (item.replyBlockedReason === "reply_unresolved")
    return {
      allowed: false,
      explanation:
        "Another reply to this phone is still awaiting confirmation. Check delivery records with an administrator or provider before sending again. Refresh alone may not resolve an uncertain send.",
    };
  const expires = Date.parse(item.replyWindowExpiresAt ?? "");
  if (
    !Number.isFinite(expires) ||
    expires <= now ||
    item.replyBlockedReason === "window_expired"
  )
    return {
      allowed: false,
      explanation:
        "The 24-hour support window is closed. Ask the person to message the business again; do not send a free-text reply outside this window.",
    };
  if (!item.canReply)
    return {
      allowed: false,
      explanation:
        "The server has blocked replies for this conversation. Refresh its status before taking action.",
    };
  if (item.replies.some(replyNeedsConfirmation))
    return {
      allowed: false,
      explanation:
        "A previous reply is awaiting confirmation. Check its status and the provider records before sending another.",
    };
  return {
    allowed: true,
    explanation:
      "Reply to this support request only. This conversation does not grant permission for ongoing alerts.",
  };
}

export function duplicatesAcceptedReply(
  item: WhatsAppInboxItem,
  body: string,
): boolean {
  return item.replies.some(
    (reply) =>
      reply.body?.trim() === body.trim() &&
      (reply.status === "sent" ||
        reply.status === "delivered" ||
        replyNeedsConfirmation(reply)),
  );
}

export function prepareReplyAttempt(
  item: WhatsAppInboxItem,
  body: string,
  existing?: ReplyAttempt,
  now = Date.now(),
): ReplyAttempt {
  if (existing && existing.inboxId !== item.id)
    throw new Error("This recovery key belongs to another support request.");
  if (existing?.state === "unknown")
    return { ...existing, state: "submitting" };
  if (existing?.state === "submitting")
    throw new Error("This reply is already being checked. Please wait.");
  const availability = replyAvailability(item, now);
  if (!availability.allowed) throw new Error(availability.explanation);
  const text = body.trim();
  if (!text || text.length > 1600)
    throw new Error("Write a reply between 1 and 1,600 characters.");
  if (duplicatesAcceptedReply(item, text))
    throw new Error(
      "This same reply already appears in the delivery history. Check that record instead of sending it again.",
    );
  return {
    inboxId: item.id,
    body: text,
    key: crypto.randomUUID(),
    state: "submitting",
  };
}

export function replyStatusDetail(reply: InboxReply): string {
  if (reply.sample) return "Sample record. No message was sent.";
  if (reply.status === "delivered") return "The provider confirmed delivery.";
  if (replyNeedsConfirmation(reply))
    return "Acceptance or delivery is uncertain. Check status and provider records; do not resend.";
  if (reply.status === "sent")
    return "Accepted by the provider. Handset delivery is not yet confirmed.";
  if (reply.status === "not_configured")
    return "The provider is not connected. No reply was sent.";
  return "The provider did not confirm a successful send. Review the provider records before composing another reply.";
}

function messagePreview(item: WhatsAppInboxItem): string {
  if (item.contentType !== "text")
    return "Media or another unsupported message type";
  return item.body ?? "Content expired";
}

/** Online-only boundary: changing identity, role or connectivity destroys private component state. */
export default function WhatsAppInbox() {
  const { user, online } = useApp();
  if (!user || user.role === "farmer")
    return (
      <Notice>
        Only the authorised support team can view WhatsApp conversations.
      </Notice>
    );
  if (!online)
    return (
      <Notice>
        Reconnect to open the WhatsApp inbox. Conversations and reply drafts are
        never saved for offline use.
      </Notice>
    );
  return (
    <PrivateInbox key={`${user.organizationId}:${user.id}:${user.role}`} />
  );
}

function PrivateInbox() {
  const { refresh } = useApp();
  const [page, setPage] = useState<InboxPage>({
    items: [],
    nextCursor: null,
    retentionDays: 30,
  });
  const [selectedId, setSelectedId] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<Array<string | null>>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [attempts, setAttempts] = useState<Record<string, ReplyAttempt>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lifetime = useRef({ active: true, epoch: 0 });
  const controllers = useRef(new Set<AbortController>());
  const readSequence = useRef(0);
  const submission = useRef(false);
  const attemptsRef = useRef(attempts);
  attemptsRef.current = attempts;

  const revoke = useCallback(() => {
    lifetime.current.epoch += 1;
    for (const controller of controllers.current) controller.abort();
    setPage({ items: [], nextCursor: null, retentionDays: 30 });
    setDrafts({});
    setAttempts({});
    attemptsRef.current = {};
    setSelectedId("");
    setDenied(true);
    void refresh().catch(() => {});
  }, [refresh]);

  const call = useCallback(
    async <T,>(
      path: string,
      method = "GET",
      body?: unknown,
      key?: string,
    ): Promise<T> => {
      const epoch = lifetime.current.epoch;
      const controller = new AbortController();
      controllers.current.add(controller);
      const timeout = setTimeout(() => controller.abort(), 18_000);
      try {
        const response = await rawRequest(
          path,
          method,
          body,
          key,
          controller.signal,
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (
            (response.status === 401 || response.status === 403) &&
            lifetime.current.active &&
            epoch === lifetime.current.epoch
          )
            revoke();
          throw new ApiError(
            response.status,
            result.error?.code ?? "REQUEST_FAILED",
            result.error?.message ??
              "The inbox is unavailable. Please try again.",
          );
        }
        return result as T;
      } finally {
        clearTimeout(timeout);
        controllers.current.delete(controller);
      }
    },
    [revoke],
  );

  const load = useCallback(
    async (
      target: string | null,
      history: Array<string | null>,
      preserveSelection = true,
    ) => {
      const epoch = lifetime.current.epoch,
        sequence = ++readSequence.current;
      const valid = () =>
        lifetime.current.active &&
        epoch === lifetime.current.epoch &&
        sequence === readSequence.current;
      setBusy(true);
      setError("");
      try {
        const result = await call<InboxPage>(
          `/api/whatsapp/inbox?limit=20${target ? `&cursor=${encodeURIComponent(target)}` : ""}`,
        );
        if (!valid()) return;
        if (
          !Array.isArray(result.items) ||
          result.items.length > 20 ||
          result.items.some((item) => !item.id || !Array.isArray(item.replies))
        )
          throw new Error(
            "The inbox returned an invalid response. Please refresh.",
          );
        setPage(result);
        setCursor(target);
        setPrevious(history);
        setSelectedId((id) =>
          preserveSelection && result.items.some((item) => item.id === id)
            ? id
            : (result.items[0]?.id ?? ""),
        );
      } catch (failure) {
        if (valid()) {
          if (inboxConnectionFailure(failure)) {
            const cleared = privateStateAfterReadFailure(attemptsRef.current);
            setPage(cleared.page);
            setDrafts(cleared.drafts);
            attemptsRef.current = cleared.attempts;
            setAttempts(cleared.attempts);
            setSelectedId("");
            // The browser can report online while the API is unreachable. A
            // bootstrap check drives the shared offline boundary without resending.
            void refresh().catch(() => {});
          }
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load the inbox.",
          );
        }
      } finally {
        if (valid()) setBusy(false);
      }
    },
    [call, refresh],
  );

  useEffect(() => {
    lifetime.current.active = true;
    void load(null, [], false);
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      lifetime.current.active = false;
      lifetime.current.epoch += 1;
      readSequence.current += 1;
      for (const controller of controllers.current) controller.abort();
      clearInterval(timer);
    };
  }, [load]);

  const selected = page.items.find((item) => item.id === selectedId);
  const attempt = selected ? attempts[selected.id] : undefined;
  const draft = selected ? (drafts[selected.id] ?? "") : "";
  const sending = Object.values(attempts).some(
    (item) => item.state === "submitting",
  );
  const availability = selected ? replyAvailability(selected, now) : null;
  const uncertain = attempt?.state === "unknown";

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!selected || submission.current || denied) return;
    const epoch = lifetime.current.epoch;
    const valid = () =>
      lifetime.current.active && lifetime.current.epoch === epoch;
    let next: ReplyAttempt;
    try {
      next = prepareReplyAttempt(
        selected,
        draft,
        attemptsRef.current[selected.id],
      );
    } catch (failure) {
      setError((failure as Error).message);
      return;
    }
    submission.current = true;
    attemptsRef.current = { ...attemptsRef.current, [selected.id]: next };
    setAttempts(attemptsRef.current);
    setError("");
    try {
      const reply = await call<InboxReply>(
        `/api/whatsapp/inbox/${encodeURIComponent(next.inboxId)}/reply`,
        "POST",
        { body: next.body },
        next.key,
      );
      if (!valid()) return;
      if (
        !reply.id ||
        !["queued", "sent", "delivered", "failed", "not_configured"].includes(
          reply.status,
        )
      )
        throw new Error("Reply acceptance could not be verified.");
      attemptsRef.current = {
        ...attemptsRef.current,
        [next.inboxId]: { ...next, state: "resolved", reply },
      };
      setAttempts(attemptsRef.current);
      setDrafts((current) => ({ ...current, [next.inboxId]: "" }));
      setPage((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === next.inboxId
            ? {
                ...item,
                replies: [
                  ...item.replies.filter((old) => old.id !== reply.id),
                  reply,
                ],
              }
            : item,
        ),
      }));
      // One read to reconcile receipt/window state. It cannot send another message.
      await load(cursor, previous);
    } catch (failure) {
      if (!valid()) return;
      const ambiguous =
        !(failure instanceof ApiError) ||
        failure.status >= 500 ||
        [408, 425, 429].includes(failure.status);
      if (ambiguous) {
        const pending = { ...next, state: "unknown" as const };
        attemptsRef.current = {
          ...attemptsRef.current,
          [next.inboxId]: pending,
        };
        setAttempts(attemptsRef.current);
        setError(
          "The original request may have reached the server. Check its status below; do not start a duplicate reply. The same delivery key and text are retained in this open view.",
        );
        // A read can recover receipts without transmitting another reply. If it
        // also fails, load clears private content and checks app reachability.
        await load(cursor, previous);
      } else {
        setAttempts((current) => {
          const updated = { ...current };
          delete updated[next.inboxId];
          return updated;
        });
        setError(failure.message);
      }
    } finally {
      submission.current = false;
    }
  }

  if (denied)
    return (
      <Notice>
        Your inbox access needs a fresh sign-in or a permission review. Private
        conversations and drafts have been cleared from this view.
      </Notice>
    );
  return (
    <section className="wa-inbox" aria-label="WhatsApp support inbox">
      <div className="wa-inbox-heading">
        <div>
          <h2>Questions from the field.</h2>
          <p>One request. A useful human response. No automatic AI replies.</p>
        </div>
        <Button
          variant="secondary"
          busy={busy}
          disabled={sending}
          onClick={() => void load(cursor, previous)}
        >
          <RefreshCw size={16} />
          Refresh inbox
        </Button>
      </div>
      <div className="wa-privacy">
        <LockKeyhole size={16} />
        <span>
          Authorised team only · online-only view · message text available here
          for up to {page.retentionDays} days. Drafts clear when you leave,
          lock, or lose connection.
        </span>
      </div>
      {error && <ErrorMessage message={error} />}
      {busy && page.items.length === 0 ? (
        <Skeleton />
      ) : page.items.length === 0 ? (
        <Empty
          icon={MessageSquare}
          title={
            error
              ? "Could not open the inbox"
              : "No incoming WhatsApp questions yet"
          }
          body={
            error
              ? "No conversation data has been loaded. Check your connection or access, then refresh the inbox."
              : "Once your business number and verified webhook are connected, incoming requests appear here. No phone numbers or questions are fabricated."
          }
        />
      ) : (
        <div className="wa-workspace">
          <aside
            className="panel wa-question-list"
            aria-label="Incoming questions"
          >
            <div className="panel-header">
              <h3>Incoming questions</h3>
              <Badge>{page.items.length}</Badge>
            </div>
            {page.items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`wa-question ${selectedId === item.id ? "wa-question-selected" : ""}`}
                aria-pressed={selectedId === item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  setError("");
                }}
              >
                <span className="wa-question-top">
                  <strong>{item.contact?.name ?? item.from}</strong>
                  {item.sample && <Badge>Sample</Badge>}
                </span>
                {item.contact && <span className="wa-phone">{item.from}</span>}
                <span className="wa-preview">{messagePreview(item)}</span>
                <span className="wa-question-bottom">
                  <time>{dateTime(item.occurredAt)} EAT</time>
                  <span>
                    {item.command === "stop"
                      ? "STOP"
                      : item.replies.length
                        ? `${item.replies.length} repl${item.replies.length === 1 ? "y" : "ies"}`
                        : "No reply"}
                  </span>
                </span>
              </button>
            ))}
            <div className="wa-pagination">
              <Button
                variant="ghost"
                disabled={!previous.length || busy || sending}
                onClick={() =>
                  void load(
                    previous.at(-1) ?? null,
                    previous.slice(0, -1),
                    false,
                  )
                }
              >
                <ArrowLeft size={15} />
                Newer
              </Button>
              <Button
                variant="ghost"
                disabled={!page.nextCursor || busy || sending}
                onClick={() =>
                  void load(page.nextCursor, [...previous, cursor], false)
                }
              >
                Older
                <ArrowRight size={15} />
              </Button>
            </div>
          </aside>
          {selected && (
            <article className="panel wa-conversation">
              <div className="panel-header wa-conversation-heading">
                <div>
                  <h3>
                    {selected.contact?.name ?? "Incoming support request"}
                  </h3>
                  <span>{selected.from}</span>
                </div>
                {selected.sample ? (
                  <Badge>Sample · no sending</Badge>
                ) : (
                  <Badge tone={availability?.allowed ? "green" : "amber"}>
                    {availability?.allowed
                      ? "Reply window open"
                      : "Reply paused"}
                  </Badge>
                )}
              </div>
              <div className="wa-conversation-body">
                <div className="wa-bubble wa-incoming">
                  <span className="wa-bubble-label">Incoming question</span>
                  {selected.contentType === "text" ? (
                    <p>
                      {selected.body ??
                        "This message’s content is no longer available here."}
                    </p>
                  ) : (
                    <>
                      <p>A media or unsupported message was received.</p>
                      <small>
                        Only metadata is stored here. No attachment was
                        downloaded. If your cooperative has a connected provider
                        inbox, review it there; otherwise ask for a short text
                        description.
                      </small>
                    </>
                  )}
                  {selected.truncated && (
                    <small>
                      Long message shortened. Ask the sender to split the
                      remaining details into short messages.
                    </small>
                  )}
                  <time>{dateTime(selected.occurredAt)} EAT</time>
                </div>
                {selected.replies.map((reply) => (
                  <div key={reply.id} className="wa-bubble wa-outgoing">
                    <span className="wa-bubble-label">
                      Team reply {reply.sample && "· sample"}
                    </span>
                    <p>
                      {reply.body ??
                        "Reply content is no longer available here."}
                    </p>
                    <div className="wa-reply-meta">
                      <Badge
                        tone={
                          reply.status === "delivered"
                            ? "green"
                            : reply.status === "failed"
                              ? "red"
                              : replyNeedsConfirmation(reply)
                                ? "amber"
                                : "blue"
                        }
                      >
                        {reply.status === "not_configured"
                          ? "Not connected"
                          : replyNeedsConfirmation(reply)
                            ? "Check status"
                            : reply.status}
                      </Badge>
                      <time>{dateTime(reply.createdAt)} EAT</time>
                    </div>
                    <small>{replyStatusDetail(reply)}</small>
                  </div>
                ))}
                {selected.replyWindowExpiresAt && (
                  <div className="wa-window">
                    <Clock3 size={16} />
                    <span>
                      24-hour service window ends{" "}
                      {dateTime(selected.replyWindowExpiresAt)} EAT. The server
                      checks again when you reply.
                    </span>
                  </div>
                )}
                <Notice tone={availability?.allowed ? "info" : "warning"}>
                  {availability?.explanation}
                </Notice>
                <form
                  className="wa-reply-form"
                  onSubmit={(event) => void send(event)}
                >
                  <Field
                    label="Reply to this question"
                    hint="Keep it practical and easy to read. Never request passwords, national IDs, patient details, or precise household locations."
                  >
                    <textarea
                      rows={4}
                      maxLength={1600}
                      value={uncertain ? attempt.body : draft}
                      disabled={sending || uncertain || !availability?.allowed}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [selected.id]: event.target.value,
                        }))
                      }
                      placeholder="A short answer and one clear next step…"
                    />
                  </Field>
                  <div className="wa-reply-actions">
                    <small>
                      {(uncertain ? attempt.body : draft).length}/1,600 · no
                      automatic resend
                    </small>
                    {uncertain ? (
                      <Button
                        type="button"
                        busy={sending}
                        onClick={() => void send()}
                      >
                        <RefreshCw size={16} />
                        Check original request
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        busy={sending}
                        disabled={
                          !availability?.allowed ||
                          !draft.trim() ||
                          duplicatesAcceptedReply(selected, draft)
                        }
                      >
                        <Send size={16} />
                        Send support reply
                      </Button>
                    )}
                  </div>
                  {uncertain && (
                    <p className="wa-caution">
                      This checks or completes the original request using the
                      same key and unchanged text. If the provider accepted it,
                      the server does not send it again. Refreshing this page
                      clears the local recovery key; check the delivery history
                      before writing another reply.
                    </p>
                  )}
                </form>
              </div>
            </article>
          )}
        </div>
      )}
    </section>
  );
}
