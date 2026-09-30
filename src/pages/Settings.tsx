import { useState } from "react";
import {
  Download,
  Wifi,
  WifiOff,
  RefreshCw,
  Trash2,
  Smartphone,
  MessageSquare,
  Phone,
  Grid3X3,
  LogOut,
  ShieldCheck,
  LockKeyhole,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { Badge, Button, Field, Notice, PageHeader } from "../components/ui";
import { dateTime, label } from "../lib/format";
import { mutationPreview } from "../lib/offline";
import WhatsAppConnection from "../components/WhatsAppConnection";
import type { Channel, Role, Settings as Preferences } from "../types";

/** Bootstrap records include metadata; only editable preferences belong in a PUT. */
export function preferencePayload(
  current: Preferences,
  update: Partial<Preferences>,
): Preferences {
  const next = { ...current, ...update };
  return {
    language: next.language,
    lowDataMode: next.lowDataMode,
    preferredChannel: next.preferredChannel,
    notifications: next.notifications,
  };
}

export default function Settings() {
  const {
    user,
    data,
    demo,
    mutate,
    notify,
    online,
    offlineEnabled,
    setOfflineEnabled,
    queue,
    lastSync,
    sync,
    discard,
    retry,
    logout,
    lockWorkspace,
    demoLogin,
  } = useApp();
  const [busy, setBusy] = useState("");
  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const channels = [
    {
      id: "sms",
      name: "SMS",
      icon: MessageSquare,
      body: "Short updates on a basic phone. Mobile signal required.",
    },
    {
      id: "ussd",
      name: "USSD",
      icon: Grid3X3,
      body: "Short menus without mobile data. Network service required.",
    },
    {
      id: "whatsapp",
      name: "WhatsApp",
      icon: Smartphone,
      body: "Messages and richer support when you have mobile data.",
    },
    {
      id: "voice",
      name: "Voice / callback",
      icon: Phone,
      body: "A conversation with your support team.",
    },
  ] as const;
  async function preference(update: Partial<Preferences>) {
    await mutate(
      "/api/settings",
      "PUT",
      preferencePayload(data.settings, update),
    );
  }
  return (
    <>
      <PageHeader
        title="Connection & settings"
        description="Choose how you connect, learn, and keep your information safe."
      />
      <WhatsAppConnection key={`${user?.organizationId}:${user?.id}`} />
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Your connection</h2>
            {online ? <Wifi size={20} /> : <WifiOff size={20} />}
          </div>
          <div className="panel-body">
            <div className="settings-status">
              <Badge tone={online ? "green" : "amber"}>
                {online ? "Connected to Agribridge" : "Connection unavailable"}
              </Badge>
              <span className="muted">
                Last refresh: {dateTime(lastSync)} EAT
              </span>
            </div>
            <div className="setting-row">
              <div>
                <h3>
                  {user?.role === "farmer"
                    ? "Keep farm records and lessons on this device"
                    : "Keep lessons and public prices on this device"}
                </h3>
                <p>
                  {user?.role === "farmer"
                    ? "Read saved farm records and lessons without a connection. Farm and task edits can wait here until you reconnect."
                    : "Read saved lessons and public market prices without a connection. Staff farm, task and customer records stay online."}
                </p>
              </div>
              <input
                type="checkbox"
                role="switch"
                aria-label={
                  user?.role === "farmer"
                    ? "Keep farm records and lessons on this device"
                    : "Keep lessons and public prices on this device"
                }
                checked={offlineEnabled}
                disabled={!!busy}
                onChange={(e) =>
                  void run("offline", () => setOfflineEnabled(e.target.checked))
                }
              />
            </div>
            <Notice>
              Use this only on a device you trust. Saved information is
              accessible to people using this browser. Private notes, support
              follow-ups, CRM contacts, messages and community reports are not
              saved for offline browsing. Forecasts require a connection.
            </Notice>
            <div className="setting-row">
              <div>
                <h3>Low-data mode</h3>
                <p>
                  Keep the interface light. No autoplay, large photos, or map
                  downloads.
                </p>
              </div>
              <input
                type="checkbox"
                role="switch"
                aria-label="Low-data mode"
                checked={data.settings.lowDataMode}
                disabled={!!busy || !online}
                onChange={(e) =>
                  void run("data", () =>
                    preference({ lowDataMode: e.target.checked }),
                  )
                }
              />
            </div>
            <p className="muted icon-text">
              <Download size={16} />
              {import.meta.env.PROD
                ? "Install this app from your browser menu for quick access."
                : "Offline reopening is enabled in the built app. This development view supports saved records while open."}
            </p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Changes waiting to sync</h2>
            <Badge>{queue.length}</Badge>
          </div>
          <div className="panel-body">
            {queue.length ? (
              queue.map((q) => (
                <div className="queued-change" key={q.idempotencyKey}>
                  <div>
                    <strong>
                      {q.method === "POST" ? "New record" : "Record update"}
                    </strong>
                    <span>
                      {q.path.split("/")[2]} · {label(q.status)}
                    </span>
                    {q.lastError && <p>{q.lastError}</p>}
                    <details>
                      <summary>Review saved fields</summary>
                      <dl>
                        {mutationPreview(q).map(([field, value]) => (
                          <div key={field}>
                            <dt>{field}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                      <small>
                        Saved {dateTime(q.createdAt)} EAT. Private notes, owner
                        names and coordinates are not shown here.
                      </small>
                    </details>
                    {q.status === "failed" && q.retryable && (
                      <Button
                        variant="secondary"
                        disabled={!!busy}
                        onClick={() =>
                          void run("retry", () => retry(q.idempotencyKey))
                        }
                      >
                        Retry same saved change
                      </Button>
                    )}
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Discard ${q.path} pending change`}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remove this saved change from this device? A previous attempt may already have reached the server. Refresh before entering it again.",
                        )
                      )
                        void run("discard", () => discard(q.idempotencyKey));
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))
            ) : (
              <div className="sync-clear">
                <ShieldCheck size={34} />
                <h3>No pending changes.</h3>
                <p>Your saved changes have no outstanding sync work.</p>
              </div>
            )}
            <Button
              variant="secondary"
              busy={busy === "sync"}
              disabled={!!busy || (online && !queue.length)}
              onClick={() =>
                void run("sync", async () => {
                  if (!navigator.onLine) {
                    notify(
                      "No network connection yet. Your changes remain saved on this device.",
                    );
                    return;
                  }
                  await sync();
                })
              }
            >
              <RefreshCw size={16} />
              {online ? "Sync now" : "Try reconnecting"}
            </Button>
            {queue.some((q) => q.status === "conflict") && (
              <Notice tone="warning">
                A record was changed elsewhere. First open Review saved fields
                and copy the change you want to keep. Then discard that
                conflicting change, refresh the record, and apply your edit
                again. Later changes wait to avoid overwriting data.
              </Notice>
            )}
          </div>
        </section>
      </div>
      <section className="panel preferences-panel">
        <div className="panel-header">
          <h2>Meet me where I am.</h2>
          <Smartphone size={20} />
        </div>
        <div className="panel-body">
          <p className="muted">
            Choose a preferred channel. Your cooperative must activate the
            service and confirm your consent before sending messages.
          </p>
          <div className="channel-choices">
            {channels.map(({ id, name, icon: Icon, body }) => (
              <button
                key={id}
                className={
                  data.settings.preferredChannel === id ? "selected" : ""
                }
                disabled={!!busy || !online}
                onClick={() =>
                  void run(id, () =>
                    preference({ preferredChannel: id as Channel }),
                  )
                }
              >
                <Icon size={25} />
                <strong>{name}</strong>
                <span>{body}</span>
                {data.settings.preferredChannel === id && (
                  <Badge tone="green">Preferred</Badge>
                )}
              </button>
            ))}
          </div>
          <div className="setting-row">
            <div>
              <h3>Request reminders and updates</h3>
              <p>
                This preference does not activate a telecom subscription.
                Delivery requires verified contact details and channel consent.
              </p>
            </div>
            <input
              type="checkbox"
              role="switch"
              aria-label="Request reminders and updates"
              checked={data.settings.notifications}
              disabled={!!busy || !online}
              onChange={(e) =>
                void run("notifications", () =>
                  preference({ notifications: e.target.checked }),
                )
              }
            />
          </div>
          <Field
            label="Preferred language"
            hint="The interface and draft guides are currently in English. Luganda and Swahili preferences help plan reviewed content; this setting does not translate guidance automatically."
          >
            <select
              value={data.settings.language}
              disabled={!!busy || !online}
              onChange={(e) =>
                void run("language", () =>
                  preference({
                    language: e.target.value as Preferences["language"],
                  }),
                )
              }
            >
              <option value="en">English</option>
              <option value="lg">Luganda — content requested</option>
              <option value="sw">Kiswahili — content requested</option>
            </select>
          </Field>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Your account</h2>
          <LockKeyhole size={20} />
        </div>
        <div className="panel-body account-panel">
          <div>
            <strong>{user?.name}</strong>
            <p className="muted">
              {user?.organizationName} · {label(user?.role ?? "farmer")}
            </p>
          </div>
          {demo && (
            <Field label="Explore another demo role">
              <select
                value={user?.role}
                disabled={!!busy || !online}
                onChange={(e) =>
                  void run("role", () => demoLogin(e.target.value as Role))
                }
              >
                <option value="farmer">Farmer</option>
                <option value="operator">Cooperative operator</option>
                <option value="admin">Administrator</option>
              </select>
            </Field>
          )}
          <Button
            variant="secondary"
            disabled={!!busy}
            onClick={() => void run("lock", lockWorkspace)}
          >
            <LockKeyhole size={17} />
            Lock workspace
          </Button>
          <p className="muted">
            Lock hides this workspace and keeps unsynced work. You need a
            connection and explicit sign-in to reopen it. Browser storage is not
            encrypted by this lock.
          </p>
          <Button
            variant="secondary"
            busy={busy === "logout"}
            onClick={() => void run("logout", logout)}
          >
            <LogOut size={17} />
            Sign out
          </Button>
        </div>
      </section>
    </>
  );
}
