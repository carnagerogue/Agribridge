import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  GraduationCap,
  Leaf,
  LoaderCircle,
  Menu,
  PackageCheck,
  Sprout,
  Store,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { FAO_CATALOGUE_URL } from "../lib/learning-resources";
import { enterLandingDemo, landingEntry, landingStages } from "../lib/landing";
import "../styles/landing.css";

const stageIcons = [Sprout, Leaf, PackageCheck, Store];
const navigation = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#learning", label: "Learning" },
  { href: "#cooperatives", label: "For cooperatives" },
];

export default function Landing() {
  const { user, demo, demoLogin, online } = useApp();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState(1);
  const [busy, setBusy] = useState<"farmer" | "operator" | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const entry = landingEntry(Boolean(user), demo);
  const chapter = landingStages[stage];
  const ChapterIcon = stageIcons[stage];
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function tryDemo(role: "farmer" | "operator") {
    if (user || !demo || !online || inFlight.current) return;
    inFlight.current = true;
    setBusy(role);
    setError("");
    try {
      await enterLandingDemo(
        () => demoLogin(role),
        () => navigate("/", { replace: true }),
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The demo could not open. Please check your connection and try again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }
  function primaryAction(className = "") {
    return entry.kind === "demo" ? (
      <button
        type="button"
        className={`lp-button ${className}`}
        disabled={!!busy || !online}
        onClick={() => void tryDemo("farmer")}
      >
        {busy === "farmer" && (
          <LoaderCircle size={18} className="spin" aria-hidden="true" />
        )}
        {entry.label}
      </button>
    ) : (
      <Link className={`lp-button ${className}`} to={entry.to}>
        {entry.label}
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
    );
  }
  return (
    <div className="landing-page">
      <a className="skip-link" href="#landing-main">
        Skip to content
      </a>
      <header className="lp-header lp-width">
        <Link
          className="lp-wordmark"
          to="/welcome"
          aria-label="Agribridge introduction"
        >
          <Sprout size={34} strokeWidth={1.5} aria-hidden="true" />
          <span>Agribridge</span>
        </Link>
        <nav className="lp-desktop-nav" aria-label="About Agribridge">
          {navigation.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="lp-header-actions">
          {!user && demo && (
            <Link className="lp-sign-in" to="/login">
              Sign in
            </Link>
          )}
          {primaryAction("lp-header-cta")}
        </div>
        <button
          type="button"
          ref={menuRef}
          className="lp-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="landing-mobile-menu"
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? (
            <X size={22} aria-hidden="true" />
          ) : (
            <Menu size={22} aria-hidden="true" />
          )}
          <span>Menu</span>
        </button>
      </header>
      <nav
        className="lp-mobile-menu lp-width"
        id="landing-mobile-menu"
        aria-label="Mobile introduction navigation"
        hidden={!menuOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setMenuOpen(false);
            menuRef.current?.focus();
          }
        }}
      >
        {navigation.map((item) => (
          <a
            key={item.href}
            href={item.href}
            onClick={() => setMenuOpen(false)}
          >
            {item.label}
            <ArrowRight size={17} aria-hidden="true" />
          </a>
        ))}
        <Link to={user ? "/" : "/login"}>
          {user ? "Open workspace" : "Sign in"}
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </nav>
      {error && (
        <div
          className="lp-feedback lp-width"
          role="alert"
          ref={errorRef}
          tabIndex={-1}
        >
          <strong>Let’s try that again.</strong>
          <p>{error}</p>
        </div>
      )}
      {!online && (
        <p className="lp-offline lp-width" role="status">
          You’re offline. You can read this introduction; reconnect to sign in
          or open a demo.
        </p>
      )}
      <main id="landing-main" tabIndex={-1}>
        <section className="lp-hero" aria-labelledby="landing-title">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">Rooted in Uganda</p>
            <h1 id="landing-title">
              A stronger season.
              <br />
              One step at a time.
            </h1>
            <p className="lp-intro">
              From the first planting plan to the next sale. Your farms,
              weather, learning and market information, together.
            </p>
            <div className="lp-hero-actions">
              {primaryAction()}
              <a className="lp-text-link" href="#how-it-works">
                See how it works
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
            <p className="lp-small">
              {entry.kind === "demo"
                ? "Explore with sample farm records. No payment required."
                : entry.kind === "workspace"
                  ? "Your workspace is ready. Continue where you left off."
                  : "New here? Your cooperative or extension officer can help you get started."}
            </p>
          </div>
          <picture className="lp-hero-image">
            <source
              type="image/webp"
              srcSet="/images/agribridge-landscape-640.webp 640w, /images/agribridge-landscape-1024.webp 1024w, /images/agribridge-landscape-1536.webp 1536w"
              sizes="(max-width: 760px) 100vw, 58vw"
            />
            <img
              src="/images/agribridge-landscape-1024.webp"
              width={1536}
              height={1024}
              fetchPriority="high"
              decoding="async"
              alt="Illustrative landscape of green cultivated hills beside a lake at sunrise."
            />
          </picture>
        </section>

        <section
          className="lp-journey lp-width lp-section"
          id="how-it-works"
          aria-labelledby="journey-title"
        >
          <div className="lp-section-heading">
            <p className="lp-eyebrow">A simple path</p>
            <h2 id="journey-title">From planting to possibility.</h2>
            <p>Useful support at every step.</p>
          </div>
          <div
            className="lp-stage-selector"
            role="group"
            aria-label="Explore a farming stage"
          >
            {landingStages.map((item, index) => {
              const Icon = stageIcons[index];
              return (
                <button
                  key={item.id}
                  id={`landing-stage-${item.id}`}
                  type="button"
                  aria-pressed={stage === index}
                  aria-controls="landing-stage-preview"
                  onClick={() => setStage(index)}
                >
                  <span className="lp-stage-icon">
                    <Icon size={27} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <strong>{item.label}</strong>
                  <span>{item.introduction}</span>
                </button>
              );
            })}
          </div>
          <div
            className="lp-journey-scene"
            id="landing-stage-preview"
            aria-labelledby={`landing-stage-${chapter.id}`}
          >
            <div
              className="lp-chapter-copy"
              aria-live="polite"
              aria-atomic="true"
            >
              <p className="lp-eyebrow">{chapter.label}</p>
              <h3>{chapter.title}</h3>
              <p>{chapter.body}</p>
              <div className="lp-chapter-action">
                {primaryAction("lp-button-outline")}
              </div>
            </div>
            <figure className="lp-phone-scene">
              <div className="lp-phone">
                <div className="lp-phone-brand">
                  <Sprout size={22} aria-hidden="true" />
                  <span>Agribridge</span>
                  <span className="lp-preview-label">Preview</span>
                </div>
                <div className="lp-phone-body">
                  <p className="lp-phone-greeting">
                    Your season,
                    <br />
                    step by step.
                  </p>
                  <div className="lp-phone-stages" aria-hidden="true">
                    {landingStages.map((item, index) => (
                      <span
                        key={item.id}
                        className={index === stage ? "selected" : ""}
                      >
                        {index + 1}
                      </span>
                    ))}
                  </div>
                  <div className="lp-preview-task">
                    <ChapterIcon
                      size={34}
                      strokeWidth={1.4}
                      aria-hidden="true"
                    />
                    <p className="lp-small">Sample task</p>
                    <h4>{chapter.task}</h4>
                    <p>{chapter.note}</p>
                    <div className="lp-preview-next">
                      <Check size={17} aria-hidden="true" />
                      One clear next step
                    </div>
                  </div>
                  <p className="lp-phone-bottom">
                    <Sprout size={18} aria-hidden="true" />
                    Farms <BookOpen size={18} aria-hidden="true" />
                    Learn
                  </p>
                </div>
              </div>
              <figcaption>
                Illustrative app preview. Sample task—not live farm data.
              </figcaption>
            </figure>
          </div>
        </section>

        <section
          className="lp-learning lp-section"
          id="learning"
          aria-labelledby="learning-title"
        >
          <div className="lp-width lp-learning-grid">
            <div>
              <p className="lp-eyebrow">Learn</p>
              <h2 id="learning-title">
                Knowledge
                <br />
                that grows with you.
              </h2>
              <p>
                Start with a short field guide. Go deeper when you have the time
                and connection.
              </p>
            </div>
            <div className="lp-learning-links">
              <Link to="/learn?view=guides">
                <span className="lp-learning-icon">
                  <BookOpen size={26} aria-hidden="true" />
                </span>
                <span>
                  <strong>Short field guides</strong>
                  <small>
                    Read the source and review status of each guide.
                  </small>
                </span>
                <ArrowRight size={22} aria-hidden="true" />
              </Link>
              <a
                href={FAO_CATALOGUE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="lp-learning-icon">
                  <GraduationCap size={28} aria-hidden="true" />
                </span>
                <span>
                  <strong>Explore FAO learning</strong>
                  <small>
                    Opens on FAO’s website. Courses need a free account and a
                    connection; a larger screen is recommended.
                  </small>
                </span>
                <ExternalLink size={20} aria-hidden="true" />
              </a>
              <p className="lp-small">
                Independent links to FAO resources—not a partnership. Agribridge
                does not issue FAO certificates.
              </p>
            </div>
          </div>
        </section>

        <section
          className="lp-cooperative lp-width lp-section"
          id="cooperatives"
          aria-labelledby="cooperative-title"
        >
          <div className="lp-cooperative-intro">
            <p className="lp-eyebrow">For cooperatives</p>
            <h2 id="cooperative-title">
              Stronger farms.
              <br />
              Connected communities.
            </h2>
            <p>One shared workspace for the people supporting every season.</p>
            {!user && demo && (
              <button
                type="button"
                className="lp-text-link"
                disabled={!!busy || !online}
                onClick={() => void tryDemo("operator")}
              >
                {busy === "operator" ? (
                  <LoaderCircle className="spin" size={18} aria-hidden="true" />
                ) : (
                  <ArrowRight size={18} aria-hidden="true" />
                )}
                Try cooperative demo
              </button>
            )}
            {user && (
              <Link className="lp-text-link" to="/">
                Return to your workspace
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )}
          </div>
          <ol className="lp-cooperative-list">
            <li>
              <span>01</span>
              <div>
                <h3>Farmers &amp; follow-ups</h3>
                <p>
                  Keep farmer relationships, support requests and next steps
                  together.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Harvest &amp; trade</h3>
                <p>
                  Connect collections, recorded quality checks and buyer
                  conversations. Trade records are not payment processing.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Support beyond the app</h3>
                <p>
                  WhatsApp, SMS and USSD connections require service setup. No
                  public WhatsApp number is active yet.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section
          className="lp-faq lp-width lp-section"
          aria-labelledby="faq-title"
        >
          <div>
            <p className="lp-eyebrow">Clear information. Informed choices.</p>
            <h2 id="faq-title">Before you begin.</h2>
          </div>
          <div className="lp-faq-list">
            <details>
              <summary>
                Where do weather and prices come from?
                <ChevronDown size={19} aria-hidden="true" />
              </summary>
              <p>
                Weather comes from{" "}
                <a
                  href="https://open-meteo.com/en/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open-Meteo
                </a>{" "}
                model forecasts, not a sensor in your field. Published prices
                come from{" "}
                <a
                  href="https://data.humdata.org/dataset/wfp-food-prices-for-uganda"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WFP via HDX
                </a>
                . They are monthly reference observations, not live quotes.
                Dates, markets, units and coverage vary; check them before
                comparing.
              </p>
            </details>
            <details>
              <summary>
                What works with little or no connection?
                <ChevronDown size={19} aria-hidden="true" />
              </summary>
              <p>
                After you opt in on a trusted device and sync, selected farm
                records and short guides can be available offline. Supported
                farm and task changes can wait to sync. Forecasts,
                published-source refreshes, trade, messages and external FAO
                courses need a connection. Not every feature works offline.
              </p>
            </details>
            <details>
              <summary>
                Can I reach someone on WhatsApp or a basic phone?
                <ChevronDown size={19} aria-hidden="true" />
              </summary>
              <p>
                The platform supports WhatsApp, SMS and USSD integration, but
                each channel needs a provider account, an approved number or
                code, configuration and delivery testing. Choosing a preferred
                channel does not activate it. There is no public WhatsApp number
                to message yet.
              </p>
            </details>
            <details>
              <summary>
                Does the assistant replace an extension officer?
                <ChevronDown size={19} aria-hidden="true" />
              </summary>
              <p>
                No. AI assistance is optional and depends on configured service
                availability. It may be wrong. It does not diagnose crop disease
                or malaria, prescribe treatment, or guarantee planting and
                income outcomes. Check field decisions with a qualified local
                extension officer; seek medical help for health concerns.
              </p>
            </details>
            <details id="data-privacy">
              <summary>
                Your data and privacy
                <ChevronDown size={19} aria-hidden="true" />
              </summary>
              <p>
                Signing in associates farm, learning and operational records
                with your workspace. Access depends on your account and
                organization; a simple interface does not change those
                permissions. Only choose offline saving on a device you trust.
                Browser storage is not encrypted by the workspace lock and can
                be accessible to someone using the device.
              </p>
              <p>
                Private notes, CRM contacts and support messages are excluded
                from offline snapshots. External FAO links open another service
                with its own privacy terms. Optional AI requests require
                consent; do not submit personal or sensitive information. For
                access, correction or deletion requests, contact the
                organization that created your account. Production use requires
                a responsible operator, configured services and verified
                operational safeguards; this page does not claim SOC 2
                certification.
              </p>
            </details>
          </div>
        </section>

        <section className="lp-closing" aria-labelledby="closing-title">
          <div className="lp-width">
            <p className="lp-eyebrow">One useful step is a good beginning</p>
            <h2 id="closing-title">
              Start with one farm.
              <br />
              Grow with confidence.
            </h2>
            <p>
              {demo && !user
                ? "Explore the farmer experience with sample records."
                : "Your farms, learning and next steps, together."}
            </p>
            {primaryAction("lp-button-light")}
            {!user && demo && (
              <Link className="lp-closing-signin" to="/login">
                Sign in
              </Link>
            )}
          </div>
          <footer className="lp-footer lp-width">
            <Link to="/welcome" className="lp-wordmark">
              <Sprout size={28} strokeWidth={1.5} aria-hidden="true" />
              <span>Agribridge</span>
            </Link>
            <nav aria-label="Footer">
              {navigation.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
              <a
                href="#data-privacy"
                onClick={() => {
                  const disclosure = document.getElementById("data-privacy");
                  if (disclosure instanceof HTMLDetailsElement)
                    disclosure.open = true;
                }}
              >
                Data &amp; privacy
              </a>
            </nav>
            <p>Built around the way you farm. Uganda.</p>
          </footer>
        </section>
      </main>
    </div>
  );
}
