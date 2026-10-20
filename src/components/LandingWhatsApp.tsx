import { useState } from "react";
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
  Smile,
  Sprout,
} from "lucide-react";
import WhatsAppMark from "./WhatsAppMark";
import "../styles/landing-whatsapp.css";

const journey = [
  {
    id: "business",
    shortTitle: "Register farm",
    title: "Start with your number",
    description:
      "Use your WhatsApp number and share your name, community and farm details.",
    farmer: "Hello! I’d like to register my farm.",
    team: "Hello! What’s your name, where is your farm, and what do you grow?",
    followUp:
      "I’m Grace at Demo Farm in Kiwoko. We grow white maize on 3.5 acres.",
  },
  {
    id: "buyers",
    shortTitle: "Find buyers",
    title: "Bring your harvest to market",
    description:
      "Share your produce, quantity and harvest window. Find potential buyers.",
    farmer: "I have 600 kg of white maize, ready in two weeks.",
    team: "Here’s a potential buyer for your maize. Shall we review their quality requirements, price and collection terms before making an introduction?",
    followUp: "Yes, please. What quality does the buyer need?",
  },
  {
    id: "information",
    shortTitle: "Ask & plan",
    title: "Ask before you decide",
    description: "Explore prices, weather, input costs, transport and storage.",
    farmer: "What should I know before I sell my maize?",
    team: "Let’s look at the price, market and date first. We can also check the forecast, seed costs, transport and storage. Which district or market are you planning for?",
    followUp:
      "Kampala. Can we compare transport costs and the price of maize seed too?",
  },
  {
    id: "payments",
    shortTitle: "Payment updates",
    title: "Stay in the loop on payment",
    description:
      "See the difference between approval and confirmed received funds.",
    farmer: "How will I know when my client has paid?",
    team: "You’d get an update when payment is approved, followed by a separate receipt after the provider confirms the transfer. Approval alone doesn’t mean the funds have arrived.",
    followUp:
      "Please send the receipt to this WhatsApp number when the transfer is confirmed.",
  },
] as const;

function SampleCard({ step }: { step: number }) {
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
          Your WhatsApp number identifies the profile. Farm details need
          confirmation.
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
            3,000 <span>kg</span>
          </strong>
          <span>requested</span>
        </div>
        <p className="lwh-card-footnote">
          Your 600 kg could meet part of this request. Quality, price and
          delivery need agreement.
        </p>
      </div>
    );
  if (step === 2)
    return (
      <div className="lwh-sample-card">
        <span className="lwh-card-label">Sample market briefing</span>
        <div className="lwh-card-title">
          <CloudSun size={20} aria-hidden="true" />
          <strong>Before the farm gate</strong>
        </div>
        <dl className="lwh-briefing">
          <div>
            <dt>White maize</dt>
            <dd>UGX 1,550 / kg</dd>
          </div>
          <div>
            <dt>Rain forecast</dt>
            <dd>70% chance</dd>
          </div>
          <div>
            <dt>Maize seed</dt>
            <dd>UGX 45,000 / 2 kg</dd>
          </div>
          <div>
            <dt>Transport & storage</dt>
            <dd>Ask for a local quote</dd>
          </div>
        </dl>
        <p className="lwh-card-footnote">
          Fictional bulletin · 20 Oct 2026. Live answers would show their
          sources and dates.
        </p>
      </div>
    );
  return (
    <div className="lwh-sample-card">
      <span className="lwh-card-label">Sample payment events · DEMO-001</span>
      <div className="lwh-card-title">
        <strong>UGX 930,000</strong>
      </div>
      <ol className="lwh-payment-events">
        <li>
          <span>
            <Check size={12} aria-hidden="true" />
          </span>
          <div>
            <strong>Payment approved</strong>
            <small>Transfer awaiting confirmation</small>
          </div>
        </li>
        <li>
          <span>
            <CheckCheck size={13} aria-hidden="true" />
          </span>
          <div>
            <strong>Payment received</strong>
            <small>Example verified provider confirmation</small>
          </div>
        </li>
      </ol>
      <p className="lwh-card-footnote">
        Clients pay sellers through a payment provider. No money has moved in
        this preview.
      </p>
    </div>
  );
}

export function LandingWhatsApp() {
  const [step, setStep] = useState(0);
  const current = journey[step];

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
              <WhatsAppMark size={20} /> THE WHATSAPP EXPERIENCE
            </p>
            <h2 id="landing-whatsapp-title">
              See Agribridge on
              <br />
              <em>WhatsApp.</em>
            </h2>
          </div>
          <p>
            A preview of a real-world conversation: introduce your farm, find
            buyers and ask about the market. Explore the mock chat below.
          </p>
        </div>

        <div className="lwh-layout">
          <div className="lwh-guide">
            <div
              className="lwh-steps"
              role="group"
              aria-label="Explore the WhatsApp journey"
            >
              {journey.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  id={`landing-whatsapp-step-${item.id}`}
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
                English, Luganda and voice notes are planned.
                <br />
                <Link to="/whatsapp-demo">
                  Preview a scripted voice transcript{" "}
                  <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
                <span>No recording or transcription is active.</span>
              </p>
            </div>

            <div className="lwh-action">
              <p>Experience preview · WhatsApp connection coming soon</p>
              <Link className="lp-button" to="/whatsapp-demo">
                Try the conversation demo{" "}
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="lwh-preview-wrap">
            <div
              className="lwh-preview"
              id="landing-whatsapp-preview"
              role="region"
              aria-labelledby={`landing-whatsapp-step-${current.id}`}
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
                  <span>Farmer & market support</span>
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
                  Mock conversation · example{" "}
                  {String(step + 1).padStart(2, "0")} / 04
                </span>
                <div className="lwh-bubble lwh-farmer">
                  <span className="lwh-sender">You · sample farmer</span>
                  <p>{current.farmer}</p>
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
                  <span className="lwh-sender">You · sample farmer</span>
                  <p>{current.followUp}</p>
                  <span className="lwh-message-meta">
                    <span>09:43</span>
                    <CheckCheck size={14} aria-hidden="true" />
                  </span>
                </div>
                <div className="lwh-result">
                  <SampleCard step={step} />
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
              All conversations, businesses, buyers, prices, forecasts and
              payments shown here are fictional examples. No account, message or
              payment is created.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default LandingWhatsApp;
