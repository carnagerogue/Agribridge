import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCheck,
  ChevronRight,
  CloudSun,
  CreditCard,
  Handshake,
  Headphones,
  Leaf,
  MapPin,
  MessageCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  Sprout,
  Truck,
} from "lucide-react";
import {
  createDemoState,
  demoChoices,
  demoProfileSummary,
  demoScenarios,
  demoVoiceExample,
  reduceDemo,
  type DemoAction,
  type DemoScenario,
} from "../lib/whatsapp-demo";
import "../styles/whatsapp-demo.css";

const scenarioIcons = {
  signup: Building2,
  buyers: Handshake,
  prices: Leaf,
  weather: CloudSun,
  inputs: Sprout,
  logistics: Truck,
  payment: CreditCard,
};

export default function WhatsAppDemo({
  platformHref,
}: { platformHref?: string } = {}) {
  const [state, dispatch] = useReducer(reduceDemo, undefined, () =>
    createDemoState(),
  );
  const [input, setInput] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const lg = state.language === "lg";
  const choices = demoChoices(state);
  const signupSteps = [
    "name",
    "businessName",
    "community",
    "crop",
    "variety",
    "land",
    "quantity",
    "harvest",
    "review",
    "complete",
  ];
  const progress = Math.min(9, signupSteps.indexOf(state.step) + 1);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [state.messages]);

  function act(action: DemoAction) {
    setInput("");
    dispatch(action);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (input.trim()) act({ type: "reply", value: input });
  }
  function choose(scenario: DemoScenario) {
    act({ type: "scenario", scenario });
  }

  return (
    <div className="whatsapp-demo">
      <a className="wd-skip" href="#demo-conversation">
        Skip to example conversation
      </a>
      <header className="wd-header">
        <a
          className="wd-brand"
          href={platformHref || "#"}
          aria-label="Agribridge"
        >
          <Sprout size={29} strokeWidth={1.7} />
          Agribridge
        </a>
        <div>
          <span className="wd-header-label">
            <span />
            Interactive preview
          </span>
          {platformHref ? (
            <a className="wd-back" href={platformHref}>
              <ArrowLeft size={14} />
              Back to the platform
            </a>
          ) : null}
        </div>
      </header>
      <main className="wd-layout">
        <div className="wd-guide">
          <section className="wd-intro">
            <span className="wd-eyebrow">
              <MessageCircle size={15} />
              The market, one conversation away.
            </span>
            <h1>
              From your farm.
              <br />
              To your next buyer.
            </h1>
            <p>
              See how a farmer could register a business, explore market
              opportunities and follow payment updates through WhatsApp.
            </p>
            <div className="wd-demo-disclosure">
              <ShieldCheck size={17} />
              <span>
                <strong>A working, scripted demonstration.</strong> Every price,
                buyer, forecast and payment below is fictional. No account,
                message or payment leaves this page.
              </span>
            </div>
          </section>
          <section
            className="wd-scenarios"
            aria-label="Choose a conversation example"
          >
            <h2>Choose something to try</h2>
            <div>
              {demoScenarios.map((scenario) => {
                const Icon = scenarioIcons[scenario.id];
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    aria-pressed={state.scenario === scenario.id}
                    className={state.scenario === scenario.id ? "active" : ""}
                    onClick={() => choose(scenario.id)}
                  >
                    <span className="wd-scenario-icon">
                      <Icon size={19} strokeWidth={1.7} />
                    </span>
                    <span>
                      <strong>{lg ? scenario.lg : scenario.en}</strong>
                      <small>{scenario.description}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                );
              })}
            </div>
          </section>
          <section className="wd-explainer">
            <h2>A connection to a market.</h2>
            <p>
              Farmers and cooperatives remain the sellers. Agribridge helps
              connect their produce with clients and coordinate the next steps.
              Clients would pay sellers directly through an integrated provider.
            </p>
            <div>
              <span>
                <Check size={14} />
                Source and date with every real quote
              </span>
              <span>
                <Check size={14} />
                Clear quality and collection terms
              </span>
              <span>
                <Check size={14} />A person when a conversation needs help
              </span>
            </div>
            <p className="wd-language-note">
              English and Luganda are preview languages here. Luganda wording
              needs native-speaker review before field use.
            </p>
          </section>
        </div>
        <section
          className="wd-showcase"
          aria-label="Try the WhatsApp experience"
        >
          <div className="wd-preview-tools">
            <div
              className="wd-language-switch"
              role="group"
              aria-label="Conversation language"
            >
              <button
                type="button"
                aria-pressed={!lg}
                onClick={() => act({ type: "language", language: "en" })}
              >
                English
              </button>
              <button
                type="button"
                aria-pressed={lg}
                onClick={() => act({ type: "language", language: "lg" })}
              >
                Luganda <small>preview</small>
              </button>
            </div>
            <button
              className="wd-reset"
              type="button"
              onClick={() => act({ type: "reset" })}
            >
              <RotateCcw size={14} />
              Reset demo
            </button>
          </div>
          <div className="wd-phone">
            <div className="wd-chat-header">
              <span className="wd-chat-avatar">
                <Sprout size={28} strokeWidth={1.5} />
              </span>
              <div>
                <strong>
                  Agribridge
                  <span>Demo</span>
                </strong>
                <small>Farmer & market support · scripted preview</small>
              </div>
              <MessageCircle size={21} strokeWidth={1.6} />
            </div>
            <div className="wd-chat-notice">
              Sample conversation · no real WhatsApp connection
            </div>
            <div
              ref={log}
              id="demo-conversation"
              className="wd-messages"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label="Scripted WhatsApp conversation"
              tabIndex={0}
              lang={lg ? "lg" : "en"}
            >
              <div className="wd-date-label">
                {lg ? "Eby'okulabirako byokka" : "For illustration only"}
              </div>
              {state.messages.map((message) => (
                <article
                  key={message.id}
                  className={`wd-message wd-message-${message.sender}${message.kind ? ` wd-message-${message.kind}` : ""}`}
                  aria-label={
                    message.sender === "farmer"
                      ? lg
                        ? "Omulimi"
                        : "Farmer"
                      : "Agribridge"
                  }
                >
                  {message.kind === "voice" ? (
                    <span className="wd-voice-label">
                      <Headphones size={16} />
                      {lg
                        ? "Eddoboozi ery'okulabirako · ebiwandiiko"
                        : "Scripted voice-note transcript"}
                    </span>
                  ) : null}
                  {message.kind === "profile" ? (
                    <span className="wd-message-label">
                      <Building2 size={15} />
                      {lg
                        ? "Ebikwata ku nnimiro eby'okulabirako"
                        : "Check your sample profile"}
                    </span>
                  ) : null}
                  {message.kind === "offer" ? (
                    <span className="wd-message-label">
                      <Handshake size={15} />
                      {lg
                        ? "Ekiweebwayo eky'okulabirako"
                        : "Sample offer · not published"}
                    </span>
                  ) : null}
                  {message.kind === "payment" ? (
                    <span
                      className={`wd-payment-badge ${message.paymentStatus}`}
                    >
                      <CreditCard size={15} />
                      {message.paymentStatus === "confirmed"
                        ? lg
                          ? "Ekakasiddwa · demo"
                          : "Confirmed · demo"
                        : lg
                          ? "Ekkiriziddwa · demo"
                          : "Approved · demo"}
                    </span>
                  ) : null}
                  <p>{message.text}</p>
                  <span className="wd-message-foot">
                    {message.sender === "farmer" ? (
                      <CheckCheck size={13} aria-label="Shown in this demo" />
                    ) : (
                      <span>Agribridge · demo</span>
                    )}
                  </span>
                </article>
              ))}
            </div>
            <div className="wd-chat-controls" lang={lg ? "lg" : "en"}>
              <div
                className="wd-quick-replies"
                aria-label={
                  lg ? "Eby'okuddamu eby'okulabirako" : "Sample replies"
                }
              >
                {choices.map((choice, index) => (
                  <button
                    type="button"
                    key={`${state.scenario}-${state.step}-${index}`}
                    onClick={() => act(choice.action)}
                  >
                    {choice.label}
                    <ArrowRight size={13} />
                  </button>
                ))}
              </div>
              <form onSubmit={submit} className="wd-compose">
                <label htmlFor="demo-reply" className="wd-sr-only">
                  {lg
                    ? "Wandiika eky'okuddamu eky'okulabirako"
                    : "Type a sample reply"}
                </label>
                <input
                  id="demo-reply"
                  autoComplete="off"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  maxLength={160}
                  placeholder={
                    lg ? "Wandiika eky'okulabirako…" : "Type a sample reply…"
                  }
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label={lg ? "Laga eky'okuddamu" : "Send demo reply"}
                >
                  <Send size={19} />
                </button>
              </form>
              <button
                type="button"
                className="wd-voice-example"
                onClick={() =>
                  act({
                    type: "reply",
                    value: demoVoiceExample(state),
                    voice: true,
                  })
                }
              >
                <Headphones size={15} />
                {lg
                  ? "Gezaako ebiwandiiko by'eddoboozi ery'okulabirako"
                  : "Try a scripted voice-note example"}
              </button>
              <p className="wd-voice-note">
                {lg
                  ? "Ebiwandiiko byokka. Tewali kukwata ddoboozi, kulizannya oba kulikyusa mu biwandiiko."
                  : "Transcript only. No microphone, audio playback or speech recognition is used."}
              </p>
            </div>
          </div>
          <section className="wd-profile-preview" aria-live="polite">
            <div>
              <span className="wd-profile-icon">
                {state.offerCreated ? (
                  <Handshake size={20} />
                ) : (
                  <Building2 size={20} />
                )}
              </span>
              <div>
                <h2>
                  {state.offerCreated
                    ? "Your sample offer"
                    : state.profile.confirmed
                      ? "Your confirmed sample profile"
                      : "Your sample business, taking shape"}
                </h2>
                <p>
                  {state.profile.confirmed
                    ? "Stored only in this page's temporary demo state."
                    : "Use the quick replies or made-up details. No real phone number is needed."}
                </p>
              </div>
              {state.profile.confirmed ? (
                <span className="wd-profile-status">
                  <Check size={13} />
                  Demo
                </span>
              ) : null}
            </div>
            {Object.keys(state.profile).length ? (
              <details>
                <summary>
                  {state.profile.businessName ||
                    state.profile.name ||
                    "View sample details"}
                  <ChevronRight size={14} />
                </summary>
                <p>{demoProfileSummary(state.profile, state.language)}</p>
              </details>
            ) : null}
            {state.scenario === "signup" && !state.profile.confirmed ? (
              <div className="wd-progress">
                <label htmlFor="demo-progress">
                  Example signup · step {progress} of 9
                </label>
                <progress id="demo-progress" max={9} value={progress} />
              </div>
            ) : null}
            {state.offerCreated ? (
              <p className="wd-offer-note">
                <Check size={14} />A sample offer was created from your
                conversation. It has not been published or sent to a buyer.
              </p>
            ) : null}
          </section>
        </section>
      </main>
      <footer className="wd-footer">
        <span>
          <Sprout size={15} />
          Rooted in Uganda. Connected to opportunity.
        </span>
        <span>
          Demo only · no live prices, forecasts, messages or transfers
        </span>
      </footer>
    </div>
  );
}
