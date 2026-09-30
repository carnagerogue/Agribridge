import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUp,
  Bot,
  BookOpen,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { request } from "../lib/api";
import {
  Badge,
  Button,
  ErrorMessage,
  Field,
  Notice,
  PageHeader,
} from "../components/ui";
import { crops, districts, label } from "../lib/format";
type Status = {
  configured: boolean;
  model: string;
  dailyLimit: number;
  remaining: number;
  availability: string;
};
type Answer = {
  answer: string;
  sources: { title: string; url: string }[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  disclaimer: string;
};
export default function Assistant() {
  const { data, online } = useApp();
  const [status, setStatus] = useState<Status | null>(null),
    [question, setQuestion] = useState(""),
    [crop, setCrop] = useState(data.farms[0]?.crop ?? "Maize"),
    [district, setDistrict] = useState(data.farms[0]?.district ?? "Nakaseke"),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reply, setReply] = useState<Answer | null>(null),
    [asked, setAsked] = useState("");
  async function loadStatus() {
    try {
      setStatus(await request<Status>("/api/assistant/status"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void loadStatus();
  }, []);
  async function ask(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setReply(null);
    try {
      const answer = await request<Answer>("/api/assistant", "POST", {
        question,
        crop,
        district,
        consent,
      });
      setReply(answer);
      setAsked(question);
      await loadStatus();
    } catch (e) {
      setError((e as Error).message);
      void loadStatus();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Farm assistant"
        description="Ask a practical farming question. Get a short answer with its sources."
      />
      <div className="assistant-layout">
        <section className="assistant-main">
          <div className="assistant-welcome">
            <span className="assistant-mark">
              <Sprout size={35} />
            </span>
            <h2>Let’s work it out together.</h2>
            <p>
              Start with one question about your crop or your learning guide.
            </p>
            <div className="suggestion-list">
              {[
                "What should I record before planting maize?",
                "How do I describe changes in my bean leaves?",
                "What should I compare before selling my harvest?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setQuestion(q);
                    if (q.includes("maize")) setCrop("Maize");
                    else if (q.includes("bean")) setCrop("Beans");
                    else setCrop("Coffee");
                  }}
                >
                  {q}
                  <ArrowUp size={16} />
                </button>
              ))}
            </div>
          </div>
          {error && <ErrorMessage message={error} />}{" "}
          {status && !status.configured && (
            <Notice tone="warning">
              The farm assistant has not been connected yet. Your field guides
              and other farm tools are still available.
            </Notice>
          )}
          {status?.availability === "billing_unavailable" && (
            <Notice tone="warning">
              The AI provider’s billing credit is exhausted. Your administrator
              needs to add credit before questions can be answered.
            </Notice>
          )}
          {reply && (
            <section className="assistant-answer" aria-live="polite">
              <p className="asked-question">{asked}</p>
              <div className="answer-heading">
                <Bot size={23} />
                <strong>Agribridge assistant</strong>
                <Badge>
                  {reply.model === "safety-guidance"
                    ? "Safety guidance"
                    : "AI answer"}
                </Badge>
              </div>
              <div className="answer-text">{reply.answer}</div>
              <div className="answer-sources">
                {reply.sources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer">
                    <BookOpen size={14} />
                    {s.title}
                    <ExternalLink size={13} />
                  </a>
                ))}
              </div>
              <p className="source-note">{reply.disclaimer}</p>
            </section>
          )}
          <form className="assistant-composer" onSubmit={ask}>
            <div className="assistant-context">
              <Field label="Crop">
                <select value={crop} onChange={(e) => setCrop(e.target.value)}>
                  {crops.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="District">
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                >
                  {districts.map((d) => (
                    <option key={d.name}>{d.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="sr-only" htmlFor="farm-question">
              Your farming question
            </label>
            <textarea
              id="farm-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={600}
              minLength={3}
              required
              placeholder="What would you like help with?"
              rows={3}
            />
            <label className="consent-checkbox">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
              />
              I agree to send this question, crop and district to OpenAI. I will
              leave out names, phone numbers, and private health information.
            </label>
            <div className="composer-footer">
              <small>{question.length}/600 characters</small>
              <Button
                type="submit"
                busy={busy}
                disabled={
                  !online ||
                  !status?.configured ||
                  !consent ||
                  question.trim().length < 3 ||
                  status?.availability === "billing_unavailable"
                }
              >
                Ask assistant
                <ArrowUp size={17} />
              </Button>
            </div>
          </form>
        </section>
        <aside>
          <section className="panel">
            <div className="panel-header">
              <h2>Useful, with clear limits.</h2>
              <ShieldCheck size={20} />
            </div>
            <div className="panel-body">
              <p>
                Answers use the field guides and available district forecasts.
                They cannot confirm a crop diagnosis or replace an extension
                officer.
              </p>
              <ul className="plain-list">
                <li>Short answers to keep data use low.</li>
                <li>References you can check.</li>
                <li>No medicines or pesticide prescriptions.</li>
                <li>No automatic payments or actions.</li>
              </ul>
              <Link className="text-link" to="/community">
                Request a local review
                <ArrowUp size={15} />
              </Link>
            </div>
          </section>
          <section className="panel assistant-status">
            <div className="panel-header">
              <h2>Service status</h2>
              <button
                className="icon-button"
                aria-label="Refresh assistant status"
                onClick={() => void loadStatus()}
              >
                <RefreshCw size={17} />
              </button>
            </div>
            <div className="panel-body">
              <Badge
                tone={status?.availability === "available" ? "green" : "amber"}
              >
                {label(status?.availability ?? "Checking")}
              </Badge>
              <p className="muted">
                {status?.configured
                  ? "Key configured; availability depends on provider access and funding."
                  : "Waiting for a server connection."}
              </p>
              <small>
                Your remaining allowance today: {status?.remaining ?? "—"}{" "}
                requests. The whole service is capped at{" "}
                {status?.dailyLimit ?? "—"} requests per day.
              </small>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
