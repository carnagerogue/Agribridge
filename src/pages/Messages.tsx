import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  MessageSquare,
  RotateCcw,
  Send,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import {
  Badge,
  Button,
  Empty,
  ErrorMessage,
  Field,
  Notice,
  PageHeader,
  SearchInput,
  Skeleton,
} from "../components/ui";
import { ApiError, request } from "../lib/api";
import { dateTime, districts, label, ugx } from "../lib/format";
import { getUssdDecision, resolveUssd } from "../../server/channels/ussd";
import { estimateSmsSegments } from "../../server/channels/sms";
import type { Channel, Contact, Forecast, Message } from "../types";
import WhatsAppInbox from "../components/WhatsAppInbox";

type DeliveryMessage = Message & {
  error?: string;
  deliveryUncertain?: boolean;
};
type PermissionContact = Contact & { consentChannels?: Channel[] };
const channelName = (channel: string) =>
  channel === "whatsapp"
    ? "WhatsApp"
    : channel === "sms"
      ? "SMS"
      : label(channel);
const statusName = (status: string) =>
  status === "not_configured" ? "Not connected" : label(status);
function deliveryDetail(error?: string) {
  if (!error) return "";
  const messages: Record<string, string> = {
    sms_not_configured: "SMS delivery is not connected. No message was sent.",
    whatsapp_not_configured:
      "WhatsApp delivery is not connected. No message was sent.",
    whatsapp_template_required:
      "Ask the contact to message your business first, or have an administrator arrange an approved WhatsApp template.",
    sms_segment_limit:
      "This message exceeds the configured SMS length limit. Shorten it before sending again.",
    consent_required: "Record permission for this channel before sending.",
    invalid_message:
      "Check the phone number and message text before sending again.",
    provider_rate_limited:
      "The provider is limiting requests. Check its status before trying again.",
    provider_rejected:
      "The provider did not accept this request. Check its delivery records and account settings.",
    provider_timeout:
      "The provider did not respond in time. Check its records before sending again.",
    provider_response_unavailable:
      "Delivery could not be confirmed. Check the provider records before sending again.",
    provider_acceptance_unconfirmed:
      "The provider did not confirm acceptance. Check its records before sending again.",
  };
  return (
    messages[error] ??
    (/^[a-z_]+$/.test(error)
      ? "Delivery needs attention. Check the channel configuration and provider records."
      : error)
  );
}

function UssdPreview() {
  const { data, online } = useApp();
  const [path, setPath] = useState(""),
    [reply, setReply] = useState(""),
    [choice, setChoice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void resolveUssd("").then(setReply);
  }, []);
  async function choose(value: string) {
    if (busy || reply.startsWith("END")) return;
    const next = path ? `${path}*${value}` : value;
    setBusy(true);
    setChoice("");
    setPath(next);
    try {
      const decision = getUssdDecision(next);
      if (
        "action" in decision &&
        (decision.action === "callback" || decision.action === "stop")
      ) {
        setReply(
          `END Preview complete. No ${decision.action === "callback" ? "callback was requested" : "alert preferences were changed"}.`,
        );
        return;
      }
      setReply(
        await resolveUssd(next, {
          weather: async (district) => {
            const place = districts.find((item) => item.name === district);
            if (!place || !online) return undefined;
            const weather = await request<Forecast>(
              `/api/weather?latitude=${place.latitude}&longitude=${place.longitude}`,
            );
            return `${district}: ${weather.current.description}, ${weather.current.temperature}C. Forecast fetched ${dateTime(weather.fetchedAt)}. Source: ${weather.source}.`;
          },
          market: async (district) => {
            const price = data.marketPrices
              .filter(
                (item) =>
                  item.district === district && item.status === "verified",
              )
              .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
            return price
              ? `${price.market}: ${price.crop} ${ugx(price.priceUgx)}/kg. ${dateTime(price.observedAt)}. ${price.source}. Confirm price with buyer.`
              : undefined;
          },
          lesson: async (crop) => {
            const lesson = data.lessons.find(
              (item) => item.crop === crop && item.reviewStatus === "reviewed",
            );
            return lesson ? `${lesson.title}: ${lesson.summary}` : undefined;
          },
        }),
      );
    } catch {
      setReply(
        "END Information is unavailable right now. Please try again later.",
      );
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setPath("");
    setChoice("");
    void resolveUssd("").then(setReply);
  }
  const ended = reply.startsWith("END");
  return (
    <section className="panel op-ussd">
      <div className="panel-header">
        <h2>
          <Smartphone size={19} />
          Try the simple-phone menu
        </h2>
        <Badge>Preview</Badge>
      </div>
      <div className="op-ussd-body">
        <div>
          <p>
            A short menu for phones without mobile data. Try the same navigation
            used by the USSD service.
          </p>
          <p className="muted">
            This preview does not dial a network, collect a phone number,
            request a call or change anyone's preferences. Live access needs an
            assigned code and funded provider.
          </p>
          <div className="op-preview-hint">
            <ShieldCheck size={18} />
            <span>Only verified prices and reviewed lessons appear here.</span>
          </div>
        </div>
        <div className="op-phone-preview">
          <div className="op-phone-screen" aria-live="polite" aria-busy={busy}>
            <pre>
              {busy
                ? "Getting your information…"
                : reply.replace(/^(CON|END) /, "")}
            </pre>
          </div>
          {ended ? (
            <Button variant="secondary" onClick={reset}>
              <RotateCcw size={16} />
              Start again
            </Button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (choice) void choose(choice);
              }}
              className="op-ussd-input"
            >
              <input
                aria-label="USSD menu option"
                value={choice}
                onChange={(event) =>
                  setChoice(
                    event.target.value.replace(/[^0-9]/g, "").slice(0, 1),
                  )
                }
                inputMode="numeric"
                pattern="[0-9]"
                maxLength={1}
                placeholder="Enter a number"
                required
                disabled={busy}
              />
              <Button type="submit" busy={busy} disabled={!choice}>
                Next <ArrowRight size={15} />
              </Button>
            </form>
          )}
          <button
            className="text-link op-reset-preview"
            onClick={reset}
            disabled={busy}
          >
            Reset preview
          </button>
        </div>
      </div>
    </section>
  );
}

function OutboundMessages() {
  const {
    user,
    data,
    loading,
    demo,
    online,
    error: workspaceError,
    refresh,
    notify,
  } = useApp();
  const [params] = useSearchParams();
  const [contactId, setContactId] = useState(params.get("contact") ?? ""),
    [channel, setChannel] = useState<"sms" | "whatsapp">("sms"),
    [body, setBody] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<DeliveryMessage | null>(null),
    [uncertain, setUncertain] = useState(false);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const draftKey = useRef(crypto.randomUUID());
  const appliedContact = useRef("");
  const selected = data.contacts.find((contact) => contact.id === contactId) as
    PermissionContact | undefined;
  const permission =
    selected?.consent === true &&
    selected.consentChannels?.includes(channel) === true;
  const messages = useMemo(
    () =>
      (data.messages as DeliveryMessage[])
        .filter(
          (message) =>
            (filter === "all" || message.status === filter) &&
            `${message.body} ${data.contacts.find((contact) => contact.id === message.contactId)?.name ?? ""}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.messages, data.contacts, query, filter],
  );
  useEffect(() => {
    const target = params.get("contact");
    if (!target || appliedContact.current === target) return;
    const contact = data.contacts.find((item) => item.id === target);
    if (contact) {
      appliedContact.current = target;
      setContactId(contact.id);
      setChannel(contact.preferredChannel === "whatsapp" ? "whatsapp" : "sms");
    }
  }, [params, data.contacts]);
  function newDraft() {
    draftKey.current = crypto.randomUUID();
    setBody("");
    setError("");
    setResult(null);
    setUncertain(false);
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !permission || !online || uncertain) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const saved = await request<DeliveryMessage>(
        "/api/messages",
        "POST",
        { contactId, channel, body: body.trim() },
        draftKey.current,
      );
      setResult(saved);
      setBody("");
      draftKey.current = crypto.randomUUID();
      notify(
        saved.status === "not_configured"
          ? "Message recorded. No message was sent."
          : saved.status === "failed"
            ? "Delivery failed. Review the recorded status."
            : "Message submitted. Delivery status is shown below.",
      );
      await refresh().catch(() => {});
    } catch (e) {
      const unknown = !(e instanceof ApiError) || e.status >= 500;
      setUncertain(unknown);
      setError(
        unknown
          ? "Delivery could not be confirmed. Refresh the message history before starting another message; avoid sending the same message twice."
          : e.message,
      );
      if (!unknown) draftKey.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }
  if (user?.role === "farmer")
    return (
      <Empty
        icon={MessageSquare}
        title="Choose how your team reaches you"
        body="You can set your preferred channel in Connection & settings."
        action={
          <Link className="text-link" to="/settings">
            Open connection settings <ArrowRight size={16} />
          </Link>
        }
      />
    );
  if (loading) return <Skeleton />;
  const { segments } = estimateSmsSegments(body.trim());
  return (
    <>
      <div className="toolbar">
        <Button
          variant="secondary"
          disabled={!online || busy}
          onClick={() => void refresh().catch(() => {})}
        >
          <RotateCcw size={16} />
          Refresh status
        </Button>
      </div>
      {demo && (
        <Notice>
          Demo delivery is disabled. Test messages are recorded here, but
          nothing is sent to a phone.
        </Notice>
      )}
      {!online && (
        <Notice>
          Reconnect to access contact information or send a message. Messages
          are never queued on this device.
        </Notice>
      )}
      {workspaceError && <ErrorMessage message={workspaceError} />}
      <div className="op-messages-layout">
        <section className="panel">
          <div className="panel-header">
            <h2>Compose a message</h2>
            <MessageSquare size={19} />
          </div>
          <form className="op-compose" onSubmit={send}>
            <Field label="To">
              <select
                value={contactId}
                onChange={(event) => {
                  setContactId(event.target.value);
                  const contact = data.contacts.find(
                    (item) => item.id === event.target.value,
                  );
                  setChannel(
                    contact?.preferredChannel === "whatsapp"
                      ? "whatsapp"
                      : "sms",
                  );
                  setResult(null);
                }}
                required
                disabled={busy || uncertain}
              >
                <option value="">Choose a contact</option>
                {data.contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name} · {contact.district}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Channel">
              <select
                value={channel}
                onChange={(event) => {
                  setChannel(event.target.value as "sms" | "whatsapp");
                  setResult(null);
                }}
                disabled={busy || uncertain}
              >
                <option value="sms">SMS — basic and smart phones</option>
                <option value="whatsapp">
                  WhatsApp — requires mobile data
                </option>
              </select>
            </Field>
            {selected && (
              <div className="op-message-permission">
                <ShieldCheck size={17} />
                <span>
                  {permission
                    ? `Permission for ${channelName(channel)} is recorded.`
                    : `Permission for ${channelName(channel)} is not recorded.`}
                  {!permission && (
                    <>
                      {" "}
                      <Link to="/crm">Review contact permission</Link>
                    </>
                  )}
                </span>
              </div>
            )}
            <Field
              label="Message"
              hint={
                channel === "sms"
                  ? "Keep it short, specific and useful. Network charges depend on message encoding and length."
                  : "Free-text replies require an open customer conversation window. The server checks this before delivery."
              }
            >
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                required
                maxLength={1500}
                rows={5}
                disabled={busy || uncertain}
                placeholder="What does this person need to know or do?"
              />
            </Field>
            <div className="op-compose-meta">
              <span>{body.length}/1,500 characters</span>
              {channel === "sms" && body && (
                <span>
                  About {segments} SMS segment{segments === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {error && <ErrorMessage message={error} />}
            {result && (
              <Notice
                tone={
                  result.status === "delivered"
                    ? "success"
                    : result.status === "failed" ||
                        result.status === "not_configured"
                      ? "warning"
                      : "info"
                }
              >
                <strong>{statusName(result.status)}.</strong>{" "}
                {deliveryDetail(result.error) ||
                  (result.status === "delivered"
                    ? "The provider confirmed delivery."
                    : result.status === "sent"
                      ? "Accepted by the provider; delivery is not yet confirmed."
                      : result.status === "not_configured"
                        ? "The channel is not connected. No message was sent."
                        : "Check the history for updated delivery information.")}
                {result.deliveryUncertain &&
                  " Check with the provider before sending again."}
              </Notice>
            )}
            <div className="op-compose-actions">
              {uncertain ? (
                <Button type="button" variant="secondary" onClick={newDraft}>
                  Start another message
                </Button>
              ) : (
                <Button
                  type="submit"
                  busy={busy}
                  disabled={!online || !permission || !body.trim()}
                >
                  <Send size={16} />
                  {demo ? "Record test message" : "Send message"}
                </Button>
              )}
              <small>No automatic resend.</small>
            </div>
          </form>
        </section>
        <aside className="panel op-delivery-guide">
          <div className="panel-header">
            <h2>Know what happened</h2>
          </div>
          <div className="op-detail-body">
            <div>
              <Badge tone="blue">Sent</Badge>
              <p>
                The provider accepted the message. Delivery is still
                unconfirmed.
              </p>
            </div>
            <div>
              <Badge tone="green">Delivered</Badge>
              <p>The provider returned a delivery receipt.</p>
            </div>
            <div>
              <Badge tone="amber">Not connected</Badge>
              <p>
                The message is recorded, but a provider is not ready to deliver
                it.
              </p>
            </div>
            <div>
              <Badge tone="red">Failed</Badge>
              <p>Review the reason before deciding whether to send again.</p>
            </div>
            <Link className="text-link" to="/admin">
              View channel readiness <ArrowRight size={16} />
            </Link>
          </div>
        </aside>
      </div>
      <section className="panel op-message-history">
        <div className="panel-header">
          <h2>Message history</h2>
          <span className="muted">{data.messages.length} messages</span>
        </div>
        <div className="toolbar op-panel-toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search messages or contacts"
          />
          <select
            aria-label="Filter delivery status"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            {["queued", "sent", "delivered", "failed", "not_configured"].map(
              (status) => (
                <option key={status} value={status}>
                  {statusName(status)}
                </option>
              ),
            )}
          </select>
        </div>
        {messages.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contact / time</th>
                  <th>Message</th>
                  <th>Channel</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((message) => (
                  <tr key={message.id}>
                    <td>
                      <strong>
                        {data.contacts.find(
                          (contact) => contact.id === message.contactId,
                        )?.name ?? "Contact unavailable"}
                      </strong>
                      <small className="op-cell-secondary">
                        {dateTime(message.createdAt)}
                      </small>
                    </td>
                    <td className="op-message-cell">
                      <p>{message.body}</p>
                      {message.error && (
                        <small>{deliveryDetail(message.error)}</small>
                      )}
                      {message.deliveryUncertain && (
                        <small className="op-uncertain">
                          Delivery uncertain. Check before sending again.
                        </small>
                      )}
                    </td>
                    <td>{channelName(message.channel)}</td>
                    <td>
                      <Badge
                        tone={
                          message.status === "delivered"
                            ? "green"
                            : message.status === "failed"
                              ? "red"
                              : message.status === "not_configured"
                                ? "amber"
                                : "blue"
                        }
                      >
                        {statusName(message.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={MessageSquare}
            title={
              query || filter !== "all"
                ? "No matching messages"
                : "Your conversations start here"
            }
            body={
              query || filter !== "all"
                ? "Try another search or delivery status."
                : "Record permission, choose a contact and send a useful update. Its status will appear here."
            }
          />
        )}
      </section>
    </>
  );
}

export default function Messages() {
  const { user, online, loading } = useApp();
  const [params, setParams] = useSearchParams();
  const tab =
    params.get("tab") === "preview"
      ? "preview"
      : params.get("tab") === "outbound" || params.has("contact")
        ? "outbound"
        : "inbox";
  const views = [
    { id: "inbox", title: "WhatsApp inbox" },
    { id: "outbound", title: "Outbound messages" },
    { id: "preview", title: "Simple-phone preview" },
  ] as const;
  if (loading) return <Skeleton />;
  if (!user || user.role === "farmer")
    return (
      <Empty
        icon={MessageSquare}
        title="Choose how your team reaches you"
        body="Set your preferred channel in Connection & settings. Only the support team can view private conversations."
        action={
          <Link className="text-link" to="/settings">
            Open connection settings
            <ArrowRight size={16} />
          </Link>
        }
      />
    );
  return (
    <>
      <PageHeader
        title="Messages"
        description="Answer questions from the field. Send useful updates with permission."
      />
      <div className="message-tabs" role="tablist" aria-label="Messaging tools">
        {views.map((view, index) => (
          <button
            type="button"
            key={view.id}
            id={`messages-tab-${view.id}`}
            role="tab"
            aria-selected={tab === view.id}
            aria-controls="messages-view"
            tabIndex={tab === view.id ? 0 : -1}
            onClick={() => setParams({ tab: view.id })}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % views.length
                  : event.key === "ArrowLeft"
                    ? (index + views.length - 1) % views.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? views.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setParams({ tab: views[next].id });
              document
                .getElementById(`messages-tab-${views[next].id}`)
                ?.focus();
            }}
          >
            {view.title}
          </button>
        ))}
      </div>
      <div
        id="messages-view"
        role="tabpanel"
        aria-labelledby={`messages-tab-${tab}`}
      >
        {tab === "preview" ? (
          <UssdPreview />
        ) : !online ? (
          <Notice>
            Reconnect to view contacts and private conversations. Inbox messages
            and reply drafts are never saved for offline use.
          </Notice>
        ) : tab === "inbox" ? (
          <WhatsAppInbox />
        ) : (
          <OutboundMessages
            key={`${user.organizationId}:${user.id}:${user.role}`}
          />
        )}
      </div>
    </>
  );
}
