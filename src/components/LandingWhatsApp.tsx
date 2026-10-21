import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  CloudSun,
  Headphones,
  Leaf,
  MapPin,
  Mic,
  MoreVertical,
  Phone,
  ShoppingBasket,
  Smile,
  Sprout,
} from "lucide-react";
import WhatsAppMark from "./WhatsAppMark";
import "../styles/landing-whatsapp.css";

type Audience = "farmer" | "buyer";
type JourneyStep = {
  id: string;
  shortTitle: string;
  title: string;
  description: string;
  sender: string;
  team: string;
  followUp: string;
};
const farmerJourney: readonly JourneyStep[] = [
  {
    id: "business",
    shortTitle: "Register farm",
    title: "Start with your number",
    description: "Introduce your farm, community and the produce you grow.",
    sender: "Hello! I’d like to register my farm.",
    team: "Welcome to Agribridge. What’s your name, where is your farm, and what do you grow?",
    followUp:
      "I’m Grace at Demo Farm in Kiwoko. We grow white maize on 3.5 acres.",
  },
  {
    id: "buyers",
    shortTitle: "Find buyers",
    title: "Bring your harvest to market",
    description:
      "Share your available quantity, harvest window and preferred collection terms.",
    sender: "I have 600 kg of white maize, ready in two weeks.",
    team: "Let’s introduce that supply to potential buyers. What price are you asking, and can a buyer collect from Kiwoko?",
    followUp:
      "Please list it for collection. I’ll review the buyer’s request before accepting.",
  },
  {
    id: "information",
    shortTitle: "Ask & plan",
    title: "Ask before you decide",
    description:
      "Check dated reference prices, district forecasts and practical farming guidance.",
    sender: "What should I know before I sell my maize?",
    team: "Start with the market, unit and observation date. Then compare the buyer’s terms and transport costs. Which market are you planning for?",
    followUp:
      "Kampala. Please help me compare my collection and delivery options.",
  },
  {
    id: "payments",
    shortTitle: "Agree & collect",
    title: "Know where your order stands",
    description:
      "Confirm terms with the buyer and keep payment approval separate from received funds.",
    sender:
      "I’ve accepted the sample buyer’s request. Has the payment arrived?",
    team: "The example payment is still awaiting provider confirmation. Approval is not a receipt. The buyer would pay you through a payment provider after the order terms are agreed.",
    followUp:
      "Understood. Please confirm the collection time and tell me when receipt is verified.",
  },
];
const buyerJourney: readonly JourneyStep[] = [
  {
    id: "supply",
    shortTitle: "Find produce",
    title: "Tell us what you need",
    description:
      "Source produce for your shop, kitchen, processing business or purchasing team.",
    sender:
      "Hello, I’m buying 1,000 kg of white maize for our food business in Kampala.",
    team: "I can help you explore sample supply. When do you need it, and will you collect or request delivery?",
    followUp:
      "Next week, delivered to Kampala. Please show the available suppliers and their terms.",
  },
  {
    id: "request",
    shortTitle: "Request order",
    title: "Make a clear purchase request",
    description:
      "Choose supply and share quantity, delivery location and the date you need it.",
    sender: "I’d like to request 1,000 kg from the sample cooperative.",
    team: "Your sample request records 1,000 kg of white maize for Kampala next week. The seller must confirm availability, quality, price and delivery costs before an order is accepted.",
    followUp:
      "That’s right. Please ask the seller to confirm the total price and delivery arrangements.",
  },
  {
    id: "agreement",
    shortTitle: "Agree terms",
    title: "Agree directly with the seller",
    description:
      "Review the offer and wait for seller acceptance before treating a request as confirmed.",
    sender: "The sample seller’s offer works for us. What happens next?",
    team: "Review the crop specification, agreed quantity, final price and collection or delivery terms together. In this example the seller has accepted those terms; live confirmation would be recorded against your order.",
    followUp:
      "Please keep the agreed delivery date with the order and show me the payment status.",
  },
  {
    id: "payment",
    shortTitle: "Payment & pickup",
    title: "Follow payment and collection",
    description:
      "Pay the seller through a provider, then follow confirmation and the agreed handover.",
    sender: "I’ve approved the example payment. Is our order paid?",
    team: "Not yet. Payment is pending until the provider confirms receipt. Agribridge would show that confirmation separately and keep the agreed collection or delivery plan with your order.",
    followUp:
      "Thanks. Keep it pending until confirmation, then send the receipt and handover details.",
  },
];

function SampleCard({ audience, step }: { audience: Audience; step: number }) {
  if (step === 3)
    return (
      <div className="lwh-sample-card">
        <span className="lwh-card-label">Sample payment events · DEMO-001</span>
        <div className="lwh-card-title">
          <strong>Provider confirmation pending</strong>
        </div>
        <ol className="lwh-payment-events">
          <li>
            <span>
              <Check size={12} aria-hidden="true" />
            </span>
            <div>
              <strong>Payment approved</strong>
              <small>Approval recorded in this fictional example</small>
            </div>
          </li>
          <li className="lwh-payment-pending">
            <span>…</span>
            <div>
              <strong>Awaiting confirmed receipt</strong>
              <small>
                No received-funds status without provider confirmation
              </small>
            </div>
          </li>
        </ol>
        <p className="lwh-card-footnote">
          Clients would pay sellers through a payment provider. No money has
          moved. Provider checkout is not active in this preview.
        </p>
      </div>
    );
  if (audience === "buyer") {
    const cards = [
      {
        label: "Sample supply match",
        title: "White maize · sample cooperative",
        fields: [
          ["Origin", "Nakaseke"],
          ["Your requirement", "1,000 kg"],
          ["Next step", "Ask seller to confirm supply"],
        ],
        note: "An illustrative match, not a live supplier offer. Availability and quality need confirmation.",
      },
      {
        label: "Sample purchase request",
        title: "Order request · DEMO-BUY-001",
        fields: [
          ["Produce", "White maize · 1,000 kg"],
          ["Destination", "Kampala · next week"],
          ["Status", "Awaiting seller acceptance"],
        ],
        note: "A request does not reserve stock or confirm a sale. Review the seller’s offer first.",
      },
      {
        label: "Sample agreed order",
        title: "Terms accepted · example only",
        fields: [
          ["Quantity", "1,000 kg white maize"],
          ["Handover", "Delivery to Kampala"],
          ["Payment", "Not yet confirmed"],
        ],
        note: "A fictional accepted order. No real contract, payment or delivery has been created.",
      },
    ][step];
    return (
      <div className="lwh-sample-card">
        <span className="lwh-card-label">{cards.label}</span>
        <div className="lwh-card-title">
          <ShoppingBasket size={19} aria-hidden="true" />
          <strong>{cards.title}</strong>
        </div>
        <dl className="lwh-briefing">
          {cards.fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="lwh-card-footnote">{cards.note}</p>
      </div>
    );
  }
  if (step === 0)
    return (
      <div className="lwh-sample-card">
        <span className="lwh-card-label">Sample business profile</span>
        <div className="lwh-card-title">
          <Sprout size={20} aria-hidden="true" />
          <strong>Demo Farm</strong>
        </div>
        <p className="lwh-location">
          <MapPin size={13} aria-hidden="true" /> Kiwoko, Nakaseke
        </p>
        <dl className="lwh-profile-fields">
          <div>
            <dt>Produce</dt>
            <dd>White maize</dd>
          </div>
          <div>
            <dt>Farm size</dt>
            <dd>3.5 acres</dd>
          </div>
        </dl>
        <p className="lwh-card-footnote">
          Profile details are fictional. A phone number alone does not verify a
          farm or account.
        </p>
      </div>
    );
  if (step === 1)
    return (
      <div className="lwh-sample-card">
        <span className="lwh-card-label">Sample buyer request</span>
        <div className="lwh-card-title">
          <Leaf size={20} aria-hidden="true" />
          <strong>White maize wanted</strong>
        </div>
        <p className="lwh-location">
          <MapPin size={13} aria-hidden="true" /> Example food buyer · Kampala
        </p>
        <div className="lwh-volume">
          <strong>
            600 <span>kg</span>
          </strong>
          <span>offered for collection</span>
        </div>
        <p className="lwh-card-footnote">
          An introduction is not an accepted order. The farmer and buyer must
          agree quantity, quality, price and handover.
        </p>
      </div>
    );
  return (
    <div className="lwh-sample-card">
      <span className="lwh-card-label">Sample market briefing</span>
      <div className="lwh-card-title">
        <CloudSun size={20} aria-hidden="true" />
        <strong>Before the farm gate</strong>
      </div>
      <dl className="lwh-briefing">
        <div>
          <dt>Market prices</dt>
          <dd>Check source, unit & date</dd>
        </div>
        <div>
          <dt>District forecast</dt>
          <dd>Check before collection</dd>
        </div>
        <div>
          <dt>Transport & storage</dt>
          <dd>Request a local quote</dd>
        </div>
      </dl>
      <p className="lwh-card-footnote">
        Illustrative briefing. Live answers would show their sources and dates;
        unavailable information would be labelled.
      </p>
    </div>
  );
}

export function LandingWhatsApp({
  initialAudience = "farmer",
}: {
  initialAudience?: Audience;
}) {
  const [audience, setAudience] = useState<Audience>(initialAudience);
  const [step, setStep] = useState(0);
  const audienceRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const journey = audience === "farmer" ? farmerJourney : buyerJourney;
  const current = journey[step];
  const stepId = (id: string) =>
    `landing-whatsapp-${audience === "buyer" ? "buyer-" : ""}step-${id}`;
  function selectAudience(next: Audience) {
    setAudience(next);
    setStep(0);
  }

  return (
    <section
      className="lwh-section lp-section"
      id="how-it-works"
      aria-labelledby="landing-whatsapp-title"
    >
      <div className="lp-width">
        <div className="lwh-heading">
          <div>
            <p className="lp-section-label lwh-eyebrow">
              <WhatsAppMark size={20} /> TWO SIDES. ONE CONVERSATION.
            </p>
            <h2 id="landing-whatsapp-title">
              Meet your next
              <br />
              <em>buyer. Or supplier.</em>
            </h2>
          </div>
          <p>
            Farmers bring the harvest. Purchasing clients bring the demand. See
            how each side could use WhatsApp to find a match and agree the next
            step.
          </p>
        </div>
        <div
          className="lwh-audiences"
          role="tablist"
          aria-label="Choose a WhatsApp experience"
        >
          {(["farmer", "buyer"] as const).map((item, index) => (
            <button
              key={item}
              ref={(element) => {
                audienceRefs.current[index] = element;
              }}
              id={`landing-whatsapp-audience-${item}`}
              type="button"
              role="tab"
              aria-selected={audience === item}
              aria-controls="landing-whatsapp-audience-panel"
              tabIndex={audience === item ? 0 : -1}
              onClick={() => selectAudience(item)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 1
                      : 1 - index;
                selectAudience(next === 0 ? "farmer" : "buyer");
                audienceRefs.current[next]?.focus();
              }}
            >
              {item === "farmer" ? (
                <Sprout size={19} aria-hidden="true" />
              ) : (
                <ShoppingBasket size={19} aria-hidden="true" />
              )}
              {item === "farmer" ? "I’m a farmer" : "I’m a buyer"}
              <span>
                {item === "farmer"
                  ? "Sell your produce"
                  : "Source your produce"}
              </span>
            </button>
          ))}
        </div>
        <div
          className="lwh-layout"
          role="tabpanel"
          id="landing-whatsapp-audience-panel"
          aria-labelledby={`landing-whatsapp-audience-${audience}`}
        >
          <div className="lwh-guide">
            <div
              className="lwh-steps"
              role="group"
              aria-label="Explore the WhatsApp journey"
            >
              {journey.map((item, index) => (
                <button
                  key={`${audience}-${item.id}`}
                  type="button"
                  id={stepId(item.id)}
                  aria-label={`${index + 1}. ${item.shortTitle}: ${item.title}`}
                  aria-pressed={step === index}
                  aria-controls="landing-whatsapp-preview"
                  onClick={() => setStep(index)}
                >
                  <span className="lwh-step-number">0{index + 1}</span>
                  <span className="lwh-step-copy">
                    <strong className="lwh-step-title">{item.title}</strong>
                    <strong className="lwh-step-compact">
                      {item.shortTitle}
                    </strong>
                    <span>{item.description}</span>
                  </span>
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
            <p className="lwh-mobile-step-description" aria-live="polite">
              {current.description}
            </p>
            <div className="lwh-inclusion">
              <Headphones size={18} aria-hidden="true" />
              <p>
                English, Luganda and voice conversations are planned.
                <br />
                <span>
                  This preview uses scripted English. No recording or
                  transcription is active.
                </span>
              </p>
            </div>
            <div className="lwh-action">
              <p>Experience preview · WhatsApp connection coming soon</p>
              <Link
                className="lp-button"
                to={`/whatsapp-demo?audience=${audience}`}
              >
                <WhatsAppMark size={19} />
                Try the {audience} conversation{" "}
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              {audience === "buyer" && (
                <Link className="lwh-web-option" to="/buy">
                  Prefer the web? Browse produce <ArrowRight size={14} />
                </Link>
              )}
            </div>
          </div>
          <div className="lwh-preview-wrap">
            <div
              className="lwh-preview"
              id="landing-whatsapp-preview"
              role="region"
              aria-labelledby={stepId(current.id)}
            >
              <div className="lwh-whatsapp-brand">
                <WhatsAppMark size={23} />
                <strong>WhatsApp</strong>
                <span>Mock conversation</span>
              </div>
              <div className="lwh-chat-header">
                <span className="lwh-avatar">
                  <Sprout size={24} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div className="lwh-contact">
                  <strong>Agribridge</strong>
                  <span>
                    {audience === "farmer"
                      ? "Farmer & market support"
                      : "Produce sourcing & orders"}
                  </span>
                </div>
                <div className="lwh-chat-tools" aria-hidden="true">
                  <Phone size={17} />
                  <MoreVertical size={19} />
                </div>
              </div>
              <div
                className="lwh-conversation"
                aria-live="polite"
                aria-atomic="true"
              >
                <span className="lwh-chat-context">
                  {audience === "farmer" ? "Farmer" : "Buyer"} mock conversation
                  · {String(step + 1).padStart(2, "0")} / 04
                </span>
                <div className="lwh-bubble lwh-farmer">
                  <span className="lwh-sender">You · sample {audience}</span>
                  <p>{current.sender}</p>
                  <span className="lwh-message-meta">
                    <span>09:41</span>
                    <CheckCheck size={14} aria-hidden="true" />
                  </span>
                </div>
                <div className="lwh-bubble lwh-team">
                  <span className="lwh-sender">Agribridge</span>
                  <p>{current.team}</p>
                  <span className="lwh-message-meta">
                    <span>09:42</span>
                  </span>
                </div>
                <div className="lwh-bubble lwh-farmer">
                  <span className="lwh-sender">You · sample {audience}</span>
                  <p>{current.followUp}</p>
                  <span className="lwh-message-meta">
                    <span>09:43</span>
                    <CheckCheck size={14} aria-hidden="true" />
                  </span>
                </div>
                <div className="lwh-result">
                  <SampleCard audience={audience} step={step} />
                </div>
              </div>
              <div className="lwh-compose-preview" aria-hidden="true">
                <span>
                  <Smile size={19} />
                  <span>Message</span>
                </span>
                <Mic size={20} />
              </div>
              <p className="lwh-mock-note">Mock preview · no messages sent</p>
            </div>
            <p className="lwh-preview-caption">
              All conversations, suppliers, buyers and orders shown here are
              fictional examples. No account, live order, message or payment is
              created.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
export default LandingWhatsApp;
