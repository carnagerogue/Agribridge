import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Bot, Check, Compass, Sprout, Users } from "lucide-react";
import { useApp } from "../context/AppContext";
import {
  assistantGuideLink,
  workspaceGuide,
  workspaceJourney,
} from "../lib/workspace-guide";
import { Button, Modal } from "./ui";
import "../styles/workspace-guide.css";

export function WorkspaceGuide() {
  const { user } = useApp();
  const { pathname } = useLocation();
  const guide = workspaceGuide(pathname, user?.role);
  if (!guide) return null;
  return <SectionGuide key={pathname} guide={guide} />;
}

function SectionGuide({
  guide,
}: {
  guide: NonNullable<ReturnType<typeof workspaceGuide>>;
}) {
  const [open, setOpen] = useState(false);
  const { online } = useApp();
  return (
    <>
      <aside className="workspace-guide-bar" aria-label="Help for this page">
        <span className="guide-icon">
          <Compass size={20} aria-hidden="true" />
        </span>
        <div>
          <strong>A little guidance, whenever you need it.</strong>
          <p>{guide.introduction}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          Guide me <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </aside>
      {open && (
        <Modal
          title={guide.title}
          description={guide.introduction}
          onClose={() => setOpen(false)}
        >
          <div className="workspace-guide-content">
            <ol className="workspace-guide-steps">
              {guide.steps.map((step, index) => (
                <li key={step.title}>
                  <span aria-hidden="true">{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            {guide.route !== "/assistant" && (
              <div className="guide-ai">
                <Bot size={23} aria-hidden="true" />
                <div>
                  <strong>Want this explained another way?</strong>
                  <p>
                    {online
                      ? "Start with a suggested question. Review it before sending."
                      : "Reconnect to ask AI. These steps are available now."}
                  </p>
                  {online && (
                    <Link
                      to={assistantGuideLink(guide.question)}
                      onClick={() => setOpen(false)}
                      className="text-link"
                    >
                      Ask AI about this <ArrowRight size={16} />
                    </Link>
                  )}
                </div>
              </div>
            )}
            <div className="guide-footer">
              <span>No records change when you open a guide.</span>
              <Button onClick={() => setOpen(false)}>
                Got it, let’s begin
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function WorkspaceJourney() {
  const { data, user, online } = useApp();
  const staff = user?.role === "admin" || user?.role === "operator";
  const [track, setTrack] = useState<"farm" | "cooperative">("farm");
  const [expanded, setExpanded] = useState(() =>
    workspaceJourney(data, false).some((step) => !step.recorded),
  );
  const cooperative = staff && track === "cooperative";
  const steps = workspaceJourney(data, cooperative);
  const nextIndex = steps.findIndex((step) => !step.recorded);
  const next = steps[nextIndex < 0 ? 3 : nextIndex];
  if (!online) return null;
  return (
    <section className="guided-journey" aria-labelledby="journey-title">
      <div className="guided-journey-heading">
        <div>
          <span className="journey-eyebrow">YOUR PATH FORWARD</span>
          <h2 id="journey-title">Big possibilities. Small, clear steps.</h2>
          <p>
            {cooperative
              ? "Bring people, buyers and collections together."
              : "From knowing your land to knowing what it earns."}
          </p>
        </div>
        {staff && (
          <div
            className="journey-track"
            role="group"
            aria-label="Choose your journey"
          >
            <button
              type="button"
              aria-pressed={!cooperative}
              onClick={() => {
                setTrack("farm");
                setExpanded(true);
              }}
            >
              <Sprout size={16} />
              Farm journey
            </button>
            <button
              type="button"
              aria-pressed={cooperative}
              onClick={() => {
                setTrack("cooperative");
                setExpanded(true);
              }}
            >
              <Users size={16} />
              Cooperative journey
            </button>
          </div>
        )}
      </div>
      <button
        className="journey-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls="workspace-journey-steps"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "Hide the steps" : "Show the steps"}
      </button>
      <ol
        className="journey-stations"
        id="workspace-journey-steps"
        hidden={!expanded}
      >
        {steps.map((step, index) => (
          <li
            key={step.title}
            className={index === nextIndex ? "journey-next" : ""}
          >
            <Link to={step.to}>
              <span className="journey-station-number" aria-hidden="true">
                {step.recorded ? <Check size={18} /> : `0${index + 1}`}
              </span>
              <div>
                <small>
                  {step.recorded
                    ? "Record added"
                    : index === nextIndex
                      ? "Start here"
                      : `Step ${index + 1}`}
                </small>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </div>
              <ArrowRight
                size={17}
                className="journey-station-arrow"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ol>
      <div className="journey-next-action">
        <span>
          <strong>
            {nextIndex < 0
              ? "Your journey is taking shape."
              : `Next: ${next.title.toLowerCase()}.`}
          </strong>{" "}
          {nextIndex < 0
            ? "Return to your records as the work progresses."
            : "Open the section, then choose Guide me for the steps."}
        </span>
        <Link className="button" to={next.to}>
          {nextIndex < 0 ? "Review records" : "Take the next step"}
          <ArrowRight size={17} />
        </Link>
      </div>
      <p className="journey-evidence">
        Progress reflects records in this workspace. It does not verify quality,
        delivery or payment.
      </p>
    </section>
  );
}
