import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ExternalLink,
  Leaf,
  LoaderCircle,
  Menu,
  Pause,
  Play,
  Plus,
  Sprout,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { FAO_CATALOGUE_URL } from "../lib/learning-resources";
import {
  enterLandingDemo,
  landingEntry,
  landingStages,
  landingStory,
} from "../lib/landing";
import { CinematicLandscape } from "../components/CinematicLandscape";
import { useLandingMotion } from "../lib/useLandingMotion";
import "../styles/landing.css";

const navigation = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#learning", label: "Learning" },
  { href: "#cooperatives", label: "For cooperatives" },
];
const secondTasks = [
  "Estimate seed and input costs",
  "Update your crop records",
  "Review collection details",
  "Record your sale",
];

function SeasonPreview({ stage }: { stage: number }) {
  const [completed, setCompleted] = useState<number[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const tasks = [landingStages[stage].task, secondTasks[stage]];
  const visibleTasks = tasks
    .map((title, index) => ({ title, index }))
    .filter((task) => completed.includes(task.index) === showCompleted);
  return (
    <figure className="lp-product-scene">
      <div className="lp-product-window">
        <div className="lp-product-brand">
          <span>
            <Sprout size={21} /> Agribridge
          </span>
          <small>Illustrative preview</small>
        </div>
        <h4>Your day, in focus.</h4>
        <div className="lp-preview-filters" aria-label="Filter sample tasks">
          <button
            aria-pressed={!showCompleted}
            onClick={() => setShowCompleted(false)}
          >
            All pending <span>{2 - completed.length}</span>
          </button>
          <button
            aria-pressed={showCompleted}
            onClick={() => setShowCompleted(true)}
          >
            Completed <span>{completed.length}</span>
          </button>
        </div>
        <div className="lp-preview-tasks" aria-live="polite">
          {visibleTasks.map((task) => (
            <button
              key={task.index}
              className="lp-sample-task"
              onClick={() =>
                setCompleted((current) =>
                  current.includes(task.index)
                    ? current.filter((index) => index !== task.index)
                    : [...current, task.index],
                )
              }
              aria-label={`${showCompleted ? "Reopen" : "Complete"} sample task: ${task.title}`}
            >
              <span className={showCompleted ? "is-complete" : ""}>
                {showCompleted && <Check size={15} />}
              </span>
              <span>{task.title}</span>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {!visibleTasks.length && (
            <p className="lp-preview-empty">
              {showCompleted
                ? "Complete a sample task to see it here."
                : "All done. A little progress goes a long way."}
            </p>
          )}
        </div>
        <div className="lp-preview-note">
          <Leaf size={22} />
          <span>One clear next step.</span>
        </div>
        <p className="lp-preview-guidance">{landingStages[stage].note}</p>
      </div>
      <figcaption>
        Try completing a task. This is a sample, not live farm data.
      </figcaption>
    </figure>
  );
}

export default function Landing() {
  const { user, demo, demoLogin, online } = useApp();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const [motionPaused, setMotionPaused] = useState(false);
  useLandingMotion(rootRef, motionPaused);
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState(1);
  const [heroScene, setHeroScene] = useState(0);
  const narrative = landingStory[heroScene];
  const [busy, setBusy] = useState<"farmer" | "operator" | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const entry = landingEntry(Boolean(user), demo);
  const chapter = landingStages[stage];
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
        {busy === "farmer" ? (
          <LoaderCircle size={18} className="spin" aria-hidden="true" />
        ) : null}
        {entry.label}
        <ArrowUpRight size={18} aria-hidden="true" />
      </button>
    ) : (
      <Link className={`lp-button ${className}`} to={entry.to}>
        {entry.label}
        <ArrowUpRight size={18} aria-hidden="true" />
      </Link>
    );
  }
  function closeMenu() {
    setMenuOpen(false);
  }
  return (
    <div className="landing-page" ref={rootRef}>
      <div className="lp-scroll-progress" aria-hidden="true" />
      <a className="skip-link" href="#landing-main">
        Skip to content
      </a>
      <div className="lp-opening">
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
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
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
              closeMenu();
              menuRef.current?.focus();
            }
          }}
        >
          {navigation.map((item) => (
            <a key={item.href} href={item.href} onClick={closeMenu}>
              {item.label}
              <ArrowRight size={17} />
            </a>
          ))}
          <Link to={user ? "/" : "/login"} onClick={closeMenu}>
            {user ? "Open workspace" : "Sign in"}
            <ArrowRight size={17} />
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
            You’re offline. You can explore this page; reconnect to sign in or
            open a demo.
          </p>
        )}
      </div>
      <main id="landing-main" tabIndex={-1}>
        <div className="lp-film-story" ref={storyRef}>
          <section className="lp-hero" aria-labelledby="landing-title">
            <div className="lp-hero-copy">
              <h1 id="landing-title" key={narrative.id}>
                {narrative.title}
                <br />
                <em>{narrative.emphasis}</em>
              </h1>
              <p className="lp-intro" key={`${narrative.id}-description`}>
                {narrative.description}
              </p>
              <div className="lp-hero-actions">
                {primaryAction()}
                <a className="lp-text-link" href="#how-it-works">
                  See how it works <ArrowRight size={19} />
                </a>
              </div>
              <p className="lp-hero-footnote">
                Built around the way you farm. Uganda.
              </p>
              {entry.kind === "demo" && (
                <p className="lp-entry-note">
                  Explore with sample records. No payment required.
                </p>
              )}
            </div>
            <CinematicLandscape
              paused={motionPaused}
              story={storyRef}
              onSceneChange={setHeroScene}
            />
            <div className="lp-hero-controls">
              <button
                className="lp-motion-toggle"
                aria-pressed={motionPaused}
                onClick={() => setMotionPaused((value) => !value)}
              >
                {motionPaused ? <Play size={15} /> : <Pause size={15} />}
                <span>
                  {motionPaused ? "Resume animations" : "Pause animations"}
                </span>
              </button>
              <a
                className="lp-scroll-cue"
                href="#how-it-works"
                aria-label="Discover how Agribridge works"
              >
                <ArrowDown size={25} />
              </a>
            </div>
          </section>
        </div>
        <div className="lp-principles">
          <div className="lp-width">
            <a href="#how-it-works">
              <small>01</small>
              <span>Plan with purpose</span>
              <ArrowDown size={18} />
            </a>
            <a href="#learning">
              <small>02</small>
              <span>Grow with clarity</span>
              <ArrowDown size={18} />
            </a>
            <a href="#cooperatives">
              <small>03</small>
              <span>Move forward together</span>
              <ArrowDown size={18} />
            </a>
          </div>
        </div>
        <section
          className="lp-journey lp-width lp-section"
          id="how-it-works"
          aria-labelledby="journey-title"
        >
          <div className="lp-section-heading">
            <h2 id="journey-title">
              Every part of your
              <br />
              season, connected.
            </h2>
            <p>
              Less scattered information. More clarity about what comes next.
            </p>
          </div>
          <div
            className="lp-stage-selector"
            role="group"
            aria-label="Explore a farming stage"
          >
            {landingStages.map((item, index) => (
              <button
                key={item.id}
                id={`landing-stage-${item.id}`}
                type="button"
                aria-pressed={stage === index}
                aria-controls="landing-stage-preview"
                onClick={() => setStage(index)}
              >
                <span>0{index + 1}</span>
                {item.label}
              </button>
            ))}
          </div>
          <div
            className="lp-journey-scene"
            id="landing-stage-preview"
            aria-labelledby={`landing-stage-${chapter.id}`}
          >
            <div
              key={chapter.id}
              className="lp-chapter-copy"
              aria-live="polite"
              aria-atomic="true"
            >
              <p className="lp-section-label">
                0{stage + 1} / {chapter.label}
              </p>
              <h3>{chapter.title}</h3>
              <p>{chapter.body}</p>
              <div className="lp-chapter-action">
                {primaryAction("lp-button-outline")}
              </div>
            </div>
            <SeasonPreview key={chapter.id} stage={stage} />
          </div>
        </section>
        <section
          className="lp-learning lp-section"
          id="learning"
          aria-labelledby="learning-title"
        >
          <div className="lp-width lp-learning-grid">
            <div>
              <h2 id="learning-title">
                A little knowledge.
                <br />A stronger next step.
              </h2>
              <p>
                Short field guides when you need them. Deeper learning when you
                have time.
              </p>
            </div>
            <div className="lp-learning-links">
              <Link to="/learn?view=guides">
                <span>
                  <strong>Short field guides</strong>
                  <small>
                    Practical reading, with sources and review status.
                  </small>
                </span>
                <ArrowUpRight size={28} />
              </Link>
              <a
                href={FAO_CATALOGUE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>
                  <strong>Explore FAO learning</strong>
                  <small>
                    Opens FAO’s website. Courses need an account and a
                    connection.
                  </small>
                </span>
                <ExternalLink size={24} />
              </a>
              <p className="lp-small">
                Independent links to FAO resources. Not a partnership.
              </p>
            </div>
          </div>
        </section>
        <section
          className="lp-cooperative"
          id="cooperatives"
          aria-labelledby="cooperative-title"
        >
          <picture className="lp-cooperative-image" aria-hidden="true">
            <source
              media="(max-width: 760px)"
              srcSet="/images/agribridge-dawn-640.webp"
            />
            <img
              src="/images/agribridge-dawn-1536.webp"
              alt=""
              loading="lazy"
              width={1536}
              height={1024}
            />
          </picture>
          <div className="lp-width lp-section lp-cooperative-grid">
            <div className="lp-cooperative-intro">
              <p className="lp-section-label">FOR COOPERATIVES</p>
              <h2 id="cooperative-title">
                Behind every farm,
                <br />a connected team.
              </h2>
              <p>
                A shared view of farmer relationships, harvest collections and
                the work that needs attention.
              </p>
              {!user && demo ? (
                <button
                  className="lp-button"
                  disabled={!!busy || !online}
                  onClick={() => void tryDemo("operator")}
                >
                  {busy === "operator" && (
                    <LoaderCircle className="spin" size={18} />
                  )}
                  Try cooperative demo <ArrowUpRight size={18} />
                </button>
              ) : (
                <Link
                  className="lp-button"
                  to={user ? (user.role === "farmer" ? "/" : "/crm") : "/login"}
                >
                  {user?.role === "farmer"
                    ? "Open your workspace"
                    : "Explore cooperative tools"}
                  <ArrowUpRight size={18} />
                </Link>
              )}
            </div>
            <ol className="lp-cooperative-list">
              <li>
                <span>01</span>
                <div>
                  <h3>Keep people connected</h3>
                  <p>
                    Keep farmer relationships, support requests and next steps
                    together.
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Bring harvests together</h3>
                  <p>
                    Connect harvest lots, recorded quality checks and buyer
                    collection plans.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>See what needs attention</h3>
                  <p>
                    Give your team a clear view of follow-ups, open reports and
                    the tasks ahead.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>
        <section
          className="lp-faq lp-width lp-section"
          aria-labelledby="faq-title"
        >
          <div>
            <h2 id="faq-title">
              Good questions.
              <br />
              Clear answers.
            </h2>
            <p>A few things to know before you begin.</p>
          </div>
          <div className="lp-faq-list">
            <details>
              <summary>
                Where do weather and prices come from?
                <Plus size={21} />
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
                Check the market, unit and date before comparing.
              </p>
            </details>
            <details>
              <summary>
                What works offline?
                <Plus size={21} />
              </summary>
              <p>
                After you opt in on a trusted device and sync, selected farm
                records and short guides can be available offline. Supported
                farm and task changes can wait to sync. Forecasts, trade,
                messages, source refreshes and external courses need a
                connection.
              </p>
            </details>
            <details>
              <summary>
                How do I join Agribridge?
                <Plus size={21} />
              </summary>
              <p>
                Your cooperative or extension officer can help you get an
                account. If you already have one,{" "}
                <Link to={user ? "/" : "/login"}>
                  {user ? "open your workspace" : "sign in"}
                </Link>
                . Demo access, where available, uses sample records.
              </p>
            </details>
            <details>
              <summary>
                Can I reach support on a basic phone?
                <Plus size={21} />
              </summary>
              <p>
                WhatsApp, SMS and USSD channels need setup by your cooperative
                and a service provider. Choosing a preferred channel does not
                activate it. Ask your cooperative which channels are currently
                available; this page does not provide an active support number.
              </p>
            </details>
            <details>
              <summary>
                Does the assistant replace local advice?
                <Plus size={21} />
              </summary>
              <p>
                No. The optional assistant depends on configured service
                availability and can be wrong. It does not diagnose disease,
                prescribe treatments or guarantee outcomes. Check field
                decisions with a qualified local extension officer.
              </p>
            </details>
            <details id="data-privacy">
              <summary>
                How is my information handled?
                <Plus size={21} />
              </summary>
              <p>
                Farm and operational records belong to your workspace. Access
                depends on your account and organization. Only enable offline
                saving on a device you trust: browser storage is not encrypted
                by the workspace lock.
              </p>
              <p>
                Private notes, CRM contacts and support messages are excluded
                from offline snapshots. External services have their own privacy
                terms. Optional AI requests require consent; avoid sharing
                personal or sensitive information. For access, correction or
                deletion requests, contact the organization that created your
                account.
              </p>
            </details>
          </div>
        </section>
        <section className="lp-closing" aria-labelledby="closing-title">
          <div className="lp-width lp-closing-main">
            <h2 id="closing-title">
              Your next season
              <br />
              starts with one step.
            </h2>
            <div>
              {primaryAction("lp-button-dark")}
              {!user && demo && (
                <Link className="lp-closing-signin" to="/login">
                  Already have an account? Sign in
                </Link>
              )}
            </div>
          </div>
          <footer className="lp-footer lp-width">
            <Link to="/welcome" className="lp-wordmark">
              <Sprout size={32} strokeWidth={1.5} />
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
                Data & privacy
              </a>
            </nav>
            <p>Built around the way you farm. Uganda.</p>
          </footer>
        </section>
      </main>
    </div>
  );
}
