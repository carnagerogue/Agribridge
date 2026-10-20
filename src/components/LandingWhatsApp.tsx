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
  MessageCircle,
  Sprout,
} from "lucide-react";
import "../styles/landing-whatsapp.css";

const journey = [
  {
    id: "business",
    shortTitle: "Register farm",
    title: "Start with your number",
    description:
      "Use your WhatsApp number and share your name, community and farm details.",
    farmer: "Hello! I’d like to register my farm.",
    team: "Welcome! Let’s set up your farm profile. What is your farm’s name, which community are you in, and what do you grow? You’ll review your details before confirming.",
  },
  {
    id: "buyers",
    shortTitle: "Find buyers",
    title: "Bring your harvest to market",
    description:
      "Share your produce, quantity and harvest window. Find potential buyers.",
    farmer: "I have 600 kg of white maize, ready in two weeks.",
    team: "Here’s a potential buyer for your maize. Shall we review their quality requirements, price and collection terms before making an introduction?",
  },
  {
    id: "information",
    shortTitle: "Ask & plan",
    title: "Ask before you decide",
    description: "Explore prices, weather, input costs, transport and storage.",
    farmer: "What should I know before I sell my maize?",
    team: "Let’s look at the price, market and date first. We can also check the forecast, seed costs, transport and storage. Which district or market are you planning for?",
  },
  {
    id: "payments",
    shortTitle: "Payment updates",
    title: "Stay in the loop on payment",
    description:
      "See the difference between approval and confirmed received funds.",
    farmer: "How will I know when my client has paid?",
    team: "You’d get an update when payment is approved, followed by a separate receipt after the provider confirms the transfer. Approval alone doesn’t mean the funds have arrived.",
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
            <p className="lp-section-label">THE WHATSAPP JOURNEY</p>
            <h2 id="landing-whatsapp-title">
              Your next market connection.
              <br />
              <em>A message away.</em>
            </h2>
          </div>
          <p>
            From a farmer’s first hello to a buyer conversation. A familiar way
            to share your harvest, ask questions and follow the sale.
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
              <div className="lwh-chat-header">
                <span className="lwh-avatar">
                  <Sprout size={24} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div>
                  <strong>Agribridge</strong>
                  <span>Farmer & market support</span>
                </div>
                <span className="lwh-sample-tag">SAMPLE</span>
              </div>
              <div
                className="lwh-conversation"
                aria-live="polite"
                aria-atomic="true"
              >
                <span className="lwh-chat-context">
                  Scripted conversation · {String(step + 1).padStart(2, "0")} /
                  04
                </span>
                <div className="lwh-bubble lwh-farmer">
                  <span className="lwh-sender">Sample farmer</span>
                  <p>{current.farmer}</p>
                  <CheckCheck size={14} aria-hidden="true" />
                </div>
                <div className="lwh-bubble lwh-team">
                  <span className="lwh-sender">
                    Agribridge · experience preview
                  </span>
                  <p>{current.team}</p>
                  <SampleCard step={step} />
                </div>
              </div>
              <div className="lwh-chat-footer">
                <MessageCircle size={16} aria-hidden="true" />
                <span>Explore the full scripted conversation in the demo</span>
              </div>
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
