import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Circle,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { request } from "../lib/api";
import { Badge, Button, ErrorMessage, Notice } from "./ui";
import "./whatsapp-connection.css";

export type WhatsAppConnectionState = {
  status: "not_configured" | "configured" | "demo";
  businessNumber: string | null;
  chatUrl: string | null;
  checklist: { id: string; label: string; ready: boolean }[];
  detail: string;
};

/** Never turn an arbitrary server string into an external destination. */
export function whatsappChatLink(
  connection: WhatsAppConnectionState,
): string | null {
  if (
    connection.status !== "configured" ||
    !connection.businessNumber ||
    !/^\+[1-9]\d{7,14}$/.test(connection.businessNumber)
  )
    return null;
  const expected = `https://wa.me/${connection.businessNumber.slice(1)}`;
  return connection.chatUrl === expected ? expected : null;
}

export default function WhatsAppConnection() {
  const { user, online } = useApp();
  const identity = `${user?.organizationId ?? ""}:${user?.id ?? ""}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    identity: string;
    attempt: number;
    data?: WhatsAppConnectionState;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    if (!online || !user) {
      setState(null);
      return;
    }
    void request<WhatsAppConnectionState>("/api/whatsapp/connection").then(
      (data) => {
        if (active) setState({ identity, attempt, data });
      },
      () => {
        if (active)
          setState({
            identity,
            attempt,
            error:
              "Could not check WhatsApp availability. Try again when your connection improves.",
          });
      },
    );
    return () => {
      active = false;
    };
  }, [identity, attempt, online, user?.id]);
  const current =
    online && state?.identity === identity && state.attempt === attempt
      ? state
      : null;
  const connection = current?.data;
  const chatUrl = connection ? whatsappChatLink(connection) : null;
  const checking = online && !current;
  const staff = user?.role !== "farmer";
  return (
    <section
      className="panel wa-connection"
      id="whatsapp"
      aria-labelledby="whatsapp-heading"
    >
      <div className="panel-header">
        <h2 id="whatsapp-heading">
          <MessageSquare size={20} /> Support on WhatsApp
        </h2>
        <Badge tone={chatUrl ? "green" : "amber"}>
          {!online
            ? "Reconnect to check"
            : checking
              ? "Checking…"
              : connection?.status === "demo"
                ? "Demo · not connected"
                : chatUrl
                  ? "Setup configured"
                  : "Not connected"}
        </Badge>
      </div>
      <div className="panel-body wa-connection-body">
        <div>
          <h3>A question from the field? Start a conversation.</h3>
          <p>
            Message your cooperative about crop learning, weather or a harvest
            question. A support person can reply without you opening Agribridge
            again.
          </p>
          <p className="muted">
            WhatsApp needs mobile data or Wi-Fi. Keep messages short when your
            signal is weak. No automatic AI replies are enabled.
          </p>
          {chatUrl ? (
            <div className="wa-connect-actions">
              <a
                className="button button-primary"
                href={chatUrl}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                Open WhatsApp <ArrowUpRight size={17} />
              </a>
              <span>{connection?.businessNumber}</span>
            </div>
          ) : (
            <p className="wa-connection-status" role="status">
              {!online
                ? "Reconnect to check your cooperative’s WhatsApp number."
                : checking
                  ? "Checking your cooperative’s connection…"
                  : connection?.status === "demo"
                    ? "This demo does not connect to a real WhatsApp number or send messages."
                    : current?.error
                      ? "WhatsApp availability is unknown."
                      : "Your cooperative has not connected its WhatsApp business number yet."}
            </p>
          )}
          {current?.error && <ErrorMessage message={current.error} />}
          {chatUrl && (
            <p className="muted">
              Opens WhatsApp with no message pre-filled. Configuration has not
              been verified by a live delivery test.
            </p>
          )}
          <Button
            variant="secondary"
            disabled={!online || checking}
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw size={15} /> Check connection
          </Button>
        </div>
        <div className="wa-privacy-note">
          <h3>You choose what to share.</h3>
          <p>
            Starting a chat shares your WhatsApp number and what you send with
            your cooperative and Meta. It does not link or unlock your private
            farm account.
          </p>
          <p>
            Do not send passwords, payment PINs, identity documents or private
            health information. Message text is available here for up to 30
            days; staff may need to use their authorized provider inbox for
            photos or voice notes.
          </p>
          <Notice>
            Asking for help does not subscribe you to ongoing alerts. Those need
            separate permission. Send STOP to withdraw alerts.
          </Notice>
        </div>
      </div>
      {staff && connection && (
        <details className="wa-setup-details">
          <summary>Business connection checklist</summary>
          <p>{connection.detail}</p>
          <ul>
            {connection.checklist.map((item) => (
              <li key={item.id}>
                {item.ready ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Circle size={16} aria-hidden="true" />
                )}
                <span>{item.label}</span>
                <span className="muted">
                  {item.ready ? "Configured" : "Needed"}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted">
            An administrator must configure credentials on the server and verify
            the public webhook. Never enter access tokens in a chat or farmer
            profile.
          </p>
        </details>
      )}
    </section>
  );
}
