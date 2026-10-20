import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, MessageCircle, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { request } from "../../lib/api";
import {
  errorText,
  safeMarketSource,
  marketDate as date,
} from "../../lib/marketplace";
import { Button, ErrorMessage } from "../ui";

type DeskAnswer = {
  answer: string;
  kind: "prices" | "weather" | "inputs" | "logistics" | "buyers" | "help";
  available: boolean;
  sources: { title: string; url?: string; observedAt?: string }[];
};

export function MarketDesk({
  online,
  district,
  crop,
}: {
  online: boolean;
  district?: string;
  crop?: string;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<DeskAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function ask(value: string) {
    if (!online || lock.current || !value.trim()) return;
    lock.current = true;
    setQuestion(value);
    setBusy(true);
    setError("");
    try {
      const result = await request<DeskAnswer>("/api/marketplace/ask", "POST", {
        question: value.trim(),
        ...(district ? { district } : {}),
        ...(crop ? { crop } : {}),
      });
      setAnswer(result);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }
  return (
    <section className="market-desk" aria-labelledby="market-desk-title">
      <div className="market-desk-title">
        <MessageCircle size={20} strokeWidth={1.6} />
        <div>
          <h2 id="market-desk-title">Ask the market desk</h2>
          <p>
            Prices, input costs, transport and weather—with the source attached.
          </p>
        </div>
        <Link to="/assistant">
          Farm guidance
          <ArrowRight size={15} />
        </Link>
      </div>
      <form onSubmit={submit} aria-busy={busy}>
        <label className="sr-only" htmlFor="market-question">
          Your market question
        </label>
        <input
          id="market-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What are transport costs near my farm?"
          maxLength={600}
          required
          disabled={!online}
        />
        <Button
          type="submit"
          busy={busy}
          disabled={!online || !question.trim()}
        >
          Ask
          <ArrowRight size={16} />
        </Button>
      </form>
      <div className="market-desk-suggestions">
        {[
          {
            label: "Input costs",
            question: `What are farm input costs${district ? ` in ${district}` : ""}?`,
          },
          {
            label: "Transport & storage",
            question: `What transport and storage services are available${district ? ` in ${district}` : ""}?`,
          },
          {
            label: "Find buyers",
            question: `Who is buying ${crop || "produce"}${district ? ` near ${district}` : ""}?`,
          },
        ].map((item) => (
          <button
            type="button"
            key={item.label}
            disabled={!online || busy}
            onClick={() => void ask(item.question)}
          >
            {item.label}
            <ArrowRight size={12} />
          </button>
        ))}
      </div>
      {error ? <ErrorMessage message={error} /> : null}
      {answer ? (
        <div
          className={`market-desk-answer${answer.available ? "" : " unavailable"}`}
          role="status"
        >
          <p>{answer.answer}</p>
          {answer.sources.length ? (
            <ul>
              {answer.sources.map((source, index) => {
                const href = source.url
                  ? safeMarketSource(source.url)
                  : undefined;
                return (
                  <li key={`${source.title}-${index}`}>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {source.title}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span>{source.title}</span>
                    )}
                    {source.observedAt ? (
                      <span> · {date(source.observedAt)}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
