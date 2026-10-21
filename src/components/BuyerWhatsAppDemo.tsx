import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCheck,
  ChevronRight,
  CreditCard,
  Handshake,
  Headphones,
  MapPin,
  MessageCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  ShoppingBasket,
  Sprout,
  Truck,
} from "lucide-react";
import {
  buyerAmount,
  buyerDemoChoices,
  buyerProfileSummary,
  buyerSampleOffers,
  buyerVoiceExample,
  createBuyerDemoState,
  matchingBuyerDemoOffers,
  reduceBuyerDemo,
  type BuyerDemoAction,
} from "../lib/whatsapp-buyer-demo";
import "../styles/whatsapp-demo.css";
import "../styles/whatsapp-buyer-demo.css";

export default function BuyerWhatsAppDemo({
  platformHref,
  audienceControl,
}: {
  platformHref?: string;
  audienceControl?: ReactNode;
}) {
  const [state, dispatch] = useReducer(reduceBuyerDemo, undefined, () =>
    createBuyerDemoState(),
  );
  const [input, setInput] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const lg = state.language === "lg";
  const choices = buyerDemoChoices(state);
  const offers = matchingBuyerDemoOffers(state);
  const selected = buyerSampleOffers.find(
    (offer) => offer.id === state.selectedOfferId,
  );
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [state.messages]);
  const act = (action: BuyerDemoAction) => {
    setInput("");
    dispatch(action);
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    if (input.trim()) act({ type: "reply", value: input });
  }
  const journey = [
    {
      icon: Building2,
      title: "Introduce your business",
      text: "Who you buy for, where you need it, and when.",
    },
    {
      icon: ShoppingBasket,
      title: "Find the right produce",
      text: "Variety, quantity and quality before a conversation.",
    },
    {
      icon: Handshake,
      title: "Agree with the seller",
      text: "A real confirmation before any commitment.",
    },
    {
      icon: CreditCard,
      title: "Pay the seller directly",
      text: "Provider-confirmed updates, with Agribridge coordinating.",
    },
  ];
  return (
    <div className="whatsapp-demo wd-buyer-demo">
      <a className="wd-skip" href="#buyer-demo-conversation">
        Skip to buyer conversation
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
        {audienceControl}
        <div>
          <span className="wd-header-label">
            <span />
            Buyer preview
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
              Good sourcing starts with a conversation.
            </span>
            <h1>
              What you need.
              <br />
              From the right grower.
            </h1>
            <p>
              Buying for a shop, restaurant, processor or organisation? See how
              you could source produce and coordinate an order through WhatsApp.
            </p>
            <div className="wd-demo-disclosure">
              <ShieldCheck size={17} />
              <span>
                <strong>A scripted buyer demonstration.</strong> Every seller,
                offer, order and payment is fictional. No account, message,
                stock reservation or payment leaves this page.
              </span>
            </div>
          </section>
          <section className="wbd-journey" aria-label="Buyer journey">
            <h2>From a buying need to a clear next step</h2>
            {journey.map(({ icon: Icon, title, text }, index) => (
              <div key={title}>
                <span className="wbd-journey-icon">
                  <Icon size={19} strokeWidth={1.7} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
                <small>{index + 1}</small>
              </div>
            ))}
          </section>
          <section className="wd-explainer">
            <h2>One platform. Both sides of the market.</h2>
            <p>
              Farmers and cooperatives remain the sellers. Agribridge connects
              their available produce with client demand and helps the two sides
              agree the details.
            </p>
            <div>
              <span>
                <Check size={14} />
                Seller confirmation, not an assumed order
              </span>
              <span>
                <Check size={14} />
                Grade, delivery and charges need agreement
              </span>
              <span>
                <Check size={14} />
                Clients pay verified sellers directly
              </span>
            </div>
            <p className="wd-language-note">
              English and Luganda are preview languages. Luganda wording needs
              native-speaker review. This preview does not use live AI or
              speech.
            </p>
          </section>
        </div>
        <section
          className="wd-showcase"
          aria-label="Try the buyer WhatsApp experience"
        >
          <div className="wd-preview-tools">
            <div
              className="wd-language-switch"
              role="group"
              aria-label="Buyer conversation language"
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
              Reset buyer demo
            </button>
          </div>
          <div className="wd-phone">
            <div className="wd-chat-header">
              <span className="wd-chat-avatar">
                <ShoppingBasket size={26} strokeWidth={1.5} />
              </span>
              <div>
                <strong>
                  Agribridge<span>Demo</span>
                </strong>
                <small>Buyer & sourcing support · scripted preview</small>
              </div>
              <MessageCircle size={21} strokeWidth={1.6} />
            </div>
            <div className="wd-chat-notice">
              Sample buyer conversation · no real WhatsApp connection
            </div>
            <div
              ref={log}
              id="buyer-demo-conversation"
              className="wd-messages"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label="Scripted buyer WhatsApp conversation"
              tabIndex={0}
              lang={lg ? "lg" : "en"}
            >
              <div className="wd-date-label">
                {lg ? "Eby'okulabirako byokka" : "For illustration only"}
              </div>
              {state.messages.map((message) => (
                <article
                  key={message.id}
                  className={`wd-message wd-message-${message.sender === "buyer" ? "farmer" : "agribridge"}${message.kind ? ` wd-message-${message.kind}` : ""}`}
                  aria-label={
                    message.sender === "buyer" ? "Buyer" : "Agribridge"
                  }
                >
                  {message.kind === "voice" ? (
                    <span className="wd-voice-label">
                      <Headphones size={16} />
                      Scripted voice-note transcript
                    </span>
                  ) : null}
                  {message.kind === "review" ? (
                    <span className="wd-message-label">
                      <ShoppingBasket size={15} />
                      Sample details · check before continuing
                    </span>
                  ) : null}
                  {message.kind === "order" ? (
                    <span className="wd-message-label">
                      <Handshake size={15} />
                      Sample order · no actual commitment
                    </span>
                  ) : null}
                  {message.kind === "payment" ? (
                    <span className="wd-message-label">
                      <CreditCard size={15} />
                      Fictional payment event
                    </span>
                  ) : null}
                  <p>{message.text}</p>
                  <span className="wd-message-foot">
                    {message.sender === "buyer" ? (
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
                aria-label="Buyer sample replies"
              >
                {choices.map((choice, index) => (
                  <button
                    type="button"
                    key={`${state.step}-${index}`}
                    onClick={() => act(choice.action)}
                  >
                    {choice.label}
                    <ArrowRight size={13} />
                  </button>
                ))}
              </div>
              <form onSubmit={submit} className="wd-compose">
                <label htmlFor="buyer-demo-reply" className="wd-sr-only">
                  Type a sample buyer reply
                </label>
                <input
                  id="buyer-demo-reply"
                  autoComplete="off"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  maxLength={160}
                  disabled={state.stopped}
                  placeholder={
                    lg
                      ? "Wandiika eky'okulabirako…"
                      : "Type a sample buyer reply…"
                  }
                />
                <button
                  type="submit"
                  disabled={state.stopped || !input.trim()}
                  aria-label="Send buyer demo reply"
                >
                  <Send size={19} />
                </button>
              </form>
              <button
                type="button"
                className="wd-voice-example"
                disabled={state.stopped}
                onClick={() =>
                  act({
                    type: "reply",
                    value: buyerVoiceExample(state),
                    voice: true,
                  })
                }
              >
                <Headphones size={15} />
                Try a scripted buyer voice-note example
              </button>
              <p className="wd-voice-note">
                Transcript only. No microphone, audio playback or speech
                recognition is used.
              </p>
            </div>
          </div>
          {state.profile.confirmed && state.step === "offers" ? (
            <section
              className="wbd-offers"
              aria-label="Matching sample produce offers"
            >
              <h2>Example produce, ready for a conversation</h2>
              <p>
                Fictional availability. Quantity and crop only; quality and
                delivery remain to be confirmed.
              </p>
              {offers.length ? (
                offers.map((offer) => (
                  <article key={offer.id}>
                    <div>
                      <span>
                        <Sprout size={21} />
                      </span>
                      <div>
                        <h3>{offer.variety}</h3>
                        <p>{offer.seller}</p>
                      </div>
                    </div>
                    <dl>
                      <div>
                        <dt>Location</dt>
                        <dd>
                          <MapPin size={12} />
                          {offer.district}
                        </dd>
                      </div>
                      <div>
                        <dt>Sample stock</dt>
                        <dd>{buyerAmount(offer.availableKg)} kg</dd>
                      </div>
                      <div>
                        <dt>Example price</dt>
                        <dd>UGX {buyerAmount(offer.priceUgxPerKg)}/kg</dd>
                      </div>
                    </dl>
                    <p>{offer.quality}</p>
                    <button
                      type="button"
                      aria-pressed={selected?.id === offer.id}
                      disabled={state.stopped}
                      onClick={() =>
                        act({ type: "select-offer", id: offer.id })
                      }
                    >
                      {selected?.id === offer.id
                        ? "Sample offer selected"
                        : "Review sample offer"}
                      <ChevronRight size={14} />
                    </button>
                  </article>
                ))
              ) : (
                <p className="wbd-no-offers">
                  No fictional stock covers this request. The sourcing team
                  would help find supply; reset to try another example.
                </p>
              )}
            </section>
          ) : null}
          <section className="wd-profile-preview" aria-live="polite">
            <div>
              <span className="wd-profile-icon">
                <Building2 size={20} />
              </span>
              <div>
                <h2>
                  {state.profile.confirmed
                    ? "Your confirmed sample buying request"
                    : "Your sample buying request, taking shape"}
                </h2>
                <p>
                  Temporary browser memory only. Use made-up information; no
                  real phone, PIN or payment details are needed.
                </p>
              </div>
            </div>
            {Object.keys(state.profile).length ? (
              <details>
                <summary>
                  {state.profile.business ||
                    state.profile.name ||
                    "View sample request"}
                  <ChevronRight size={14} />
                </summary>
                <p>{buyerProfileSummary(state.profile, state.language)}</p>
              </details>
            ) : null}
            {[
              "requested",
              "accepted",
              "paymentApproved",
              "paymentConfirmed",
            ].includes(state.step) ? (
              <p className="wd-offer-note">
                <Truck size={14} />
                DEMO-BUY-001 ·{" "}
                {state.step === "requested"
                  ? "Request illustrated"
                  : state.step === "accepted"
                    ? "Seller confirmation illustrated"
                    : state.step === "paymentApproved"
                      ? "Approval illustrated; not received"
                      : "Provider confirmation illustrated"}
                . No actual order or transfer exists.
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
          Buyer demo only · no live sellers, orders, messages or transfers
        </span>
      </footer>
    </div>
  );
}
