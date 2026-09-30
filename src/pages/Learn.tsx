import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  ExternalLink,
  GraduationCap,
  Download,
  ChevronDown,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import {
  Badge,
  Button,
  Empty,
  ErrorMessage,
  Notice,
  PageHeader,
  SearchInput,
} from "../components/ui";
import { request } from "../lib/api";
import type { Progress } from "../types";
import {
  FAO_ACCESS_HELP_URL,
  FAO_CATALOGUE_URL,
  FAO_TERMS_URL,
  LEARNING_SOURCES_CHECKED_ON,
  learningCheckedDate,
  learningDuration,
  learningLinkHref,
  learningTopics,
  resolveLearningTopic,
  resolveLearningView,
  resourcesForTopic,
  type LearningResource,
  type LearningView,
} from "../lib/learning-resources";
import "../styles/learning-resources.css";

export default function Learn() {
  const { online } = useApp();
  const [params, setParams] = useSearchParams();
  const view = resolveLearningView(params);
  const topic = resolveLearningTopic(params.get("topic"));
  const resources = resourcesForTopic(topic);

  function changeView(nextView: LearningView) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (nextView === "guides") next.set("view", "guides");
      else {
        next.delete("view");
        next.delete("crop");
      }
      return next;
    });
  }

  return (
    <div className="learn-workspace">
      <PageHeader
        title="Learn"
        description="Choose a topic. Find a useful next step for your farm."
      />
      <div
        className="learning-view-switch"
        role="group"
        aria-label="Learning options"
      >
        <button
          type="button"
          aria-pressed={view === "fao"}
          aria-controls="learning-view-content"
          onClick={() => changeView("fao")}
        >
          Learn with FAO
        </button>
        <button
          type="button"
          aria-pressed={view === "guides"}
          aria-controls="learning-view-content"
          onClick={() => changeView("guides")}
        >
          Short field guides
        </button>
      </div>
      <div id="learning-view-content">
        {view === "guides" ? (
          <ShortFieldGuides />
        ) : (
          <section className="fao-learning" aria-label="FAO learning resources">
            <p className="learning-site-note">
              FAO opens on another website. Courses need a free FAO account; use
              a larger screen when possible.
            </p>
            {!online && (
              <Notice>
                FAO resources need a connection. Choose Short field guides to
                read any guides saved on this device.
              </Notice>
            )}
            <div
              className="learning-topic-picker"
              role="group"
              aria-label="Choose a learning topic"
            >
              {learningTopics.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={topic === item.id}
                  aria-controls="learning-topic-resources"
                  onClick={() =>
                    setParams((current) => {
                      const next = new URLSearchParams(current);
                      next.delete("view");
                      next.delete("crop");
                      next.set("topic", item.id);
                      return next;
                    })
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div id="learning-topic-resources" key={topic}>
              {resources.recommended && (
                <ResourceCard
                  resource={resources.recommended}
                  online={online}
                />
              )}
              {resources.more.length > 0 && (
                <details className="learning-more">
                  <summary>
                    More learning <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  <div className="learning-more-list">
                    {resources.more.map((resource) => (
                      <ResourceCard
                        key={resource.id}
                        resource={resource}
                        online={online}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
            <details className="learning-about">
              <summary>
                About these resources{" "}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>
                These are independent links to the Food and Agriculture
                Organization of the United Nations (FAO), not a partnership.
                Agribridge does not track your FAO course completion or issue
                FAO certificates.
              </p>
              <p>
                Resource details checked{" "}
                <time dateTime={LEARNING_SOURCES_CHECKED_ON}>
                  {learningCheckedDate(LEARNING_SOURCES_CHECKED_ON)}
                </time>
                . Availability and download sizes can change. General learning
                does not replace advice for your own field.
              </p>
              <div className="learning-reference-links">
                <ExternalLearningLink
                  url={FAO_CATALOGUE_URL}
                  online={online}
                  label="Browse FAO catalogue"
                />
                <ExternalLearningLink
                  url={FAO_ACCESS_HELP_URL}
                  online={online}
                  label="FAO access help"
                />
                <ExternalLearningLink
                  url={FAO_TERMS_URL}
                  online={online}
                  label="FAO terms of use"
                />
              </div>
            </details>
          </section>
        )}
      </div>
    </div>
  );
}

function ExternalLearningLink({
  url,
  online,
  label,
  primary = false,
}: {
  url: string;
  online: boolean;
  label: string;
  primary?: boolean;
}) {
  const href = learningLinkHref(url, online);
  const className = primary
    ? "button button-primary learning-external"
    : "text-link learning-external";
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {label}
      <ExternalLink size={17} aria-hidden="true" />
      <span className="sr-only"> (opens another website in a new tab)</span>
    </a>
  ) : (
    <button
      type="button"
      disabled
      className={className}
      title="Reconnect to open this FAO resource"
    >
      {label}
      <ExternalLink size={17} aria-hidden="true" />
    </button>
  );
}

function ResourceCard({
  resource,
  online,
}: {
  resource: LearningResource;
  online: boolean;
}) {
  return (
    <article
      className="learning-resource"
      aria-labelledby={`resource-${resource.id}`}
    >
      <h2 id={`resource-${resource.id}`}>{resource.title}</h2>
      <p className="learning-resource-meta">
        {resource.provider} · {resource.language} ·{" "}
        {resource.format === "pdf"
          ? `PDF · ${resource.downloadMb} MB`
          : learningDuration(resource.durationMinutes)}
      </p>
      <p className="learning-resource-summary">{resource.summary}</p>
      <p className="learning-resource-access">
        {resource.requiresAccount
          ? "Free FAO account required"
          : "No account needed"}
        {resource.advanced ? " · More technical" : ""}
      </p>
      {resource.caution && (
        <p className="learning-resource-caution">{resource.caution}</p>
      )}
      <ExternalLearningLink
        url={resource.url}
        online={online}
        label={resource.format === "pdf" ? "Open PDF on FAO" : "Open on FAO"}
        primary
      />
      <details className="learning-access-details">
        <summary>
          Access & download details <ChevronDown size={18} aria-hidden="true" />
        </summary>
        {resource.format === "course" ? (
          <>
            <p>
              Free registration on FAO needs an email address and email
              confirmation. Mobile data charges may apply. A larger screen is
              recommended; FAO advises against taking these courses on screens
              smaller than 7 inches.
            </p>
            <p>
              FAO lists a {resource.downloadMb} MB course download for{" "}
              <strong>Windows computers only</strong>. It is not an offline
              phone course and is not downloaded by Agribridge. Look for the
              download option after signing in on FAO.
            </p>
            <p>
              The course may open in a popup window. If it does not open, check
              your browser’s popup setting for FAO.
            </p>
          </>
        ) : (
          <p>
            This PDF is about {resource.downloadMb} MB. Download it from FAO
            when you have enough data, then use your device’s PDF reader to read
            it offline. Agribridge does not save this file for you.
          </p>
        )}
        <p>
          {resource.language} version.{" "}
          {resource.otherLanguages.length > 0
            ? `FAO also lists ${resource.otherLanguages.join(", ")}.`
            : "No other language versions verified for this link."}{" "}
          These external resources are not translated by Agribridge.
        </p>
        <p>
          Published {resource.publishedYear}. Source checked{" "}
          <time dateTime={resource.sourceCheckedOn}>
            {learningCheckedDate(resource.sourceCheckedOn)}
          </time>
          .
        </p>
      </details>
    </article>
  );
}

function ShortFieldGuides() {
  const { data, offlineEnabled } = useApp();
  const [params, setParams] = useSearchParams();
  const crop = params.get("crop") ?? "All crops";
  const [query, setQuery] = useState("");
  const lessons = data.lessons.filter(
    (l) =>
      (crop === "All crops" || l.crop === crop) &&
      `${l.title} ${l.summary} ${l.crop}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const completed = data.progress.filter((p) => p.completed).length;
  return (
    <section
      className="local-guide-library"
      aria-labelledby="short-guides-title"
    >
      <div className="local-guide-heading">
        <h2 id="short-guides-title">Short field guides</h2>
        <span className="learning-progress">
          <GraduationCap size={22} />
          {completed} of {data.lessons.length} guides completed
        </span>
      </div>
      <div className="learning-intro">
        <BookOpen size={34} strokeWidth={1.4} />
        <div>
          <h3>Read in the field</h3>
          <p>
            These guides are from your team. With offline access enabled,
            syncing saves them on this device. FAO courses are separate.
          </p>
        </div>
        <Link className="text-link" to="/settings">
          <Download size={16} />
          {offlineEnabled ? "Manage offline access" : "Set up offline access"}
          <ArrowRight size={16} />
        </Link>
      </div>
      <div className="toolbar">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="What would you like to learn?"
        />
        <select
          aria-label="Filter lessons by crop"
          value={crop}
          onChange={(e) =>
            setParams(
              e.target.value === "All crops"
                ? { view: "guides" }
                : { view: "guides", crop: e.target.value },
            )
          }
        >
          <option>All crops</option>
          {[...new Set(data.lessons.map((l) => l.crop))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="lesson-grid">
        {lessons.map((lesson, i) => {
          const done = data.progress.find(
            (p) => p.lessonId === lesson.id,
          )?.completed;
          return (
            <Link
              className="lesson-card"
              key={lesson.id}
              to={`/learn/${lesson.id}`}
            >
              <div className={`lesson-cover cover-${i % 4}`}>
                <span className="lesson-cover-label">{lesson.crop}</span>
                <BookOpen size={45} strokeWidth={1.2} />
                <span className="lesson-cover-number">0{i + 1}</span>
              </div>
              <div className="lesson-card-body">
                <div className="lesson-meta">
                  <span>
                    <Clock3 size={14} />
                    {lesson.durationMinutes} min read
                  </span>
                  {done && (
                    <Badge tone="green">
                      <CheckCircle2 size={12} />
                      Completed
                    </Badge>
                  )}
                  <Badge
                    tone={
                      lesson.reviewStatus === "reviewed" ? "green" : "amber"
                    }
                  >
                    {lesson.reviewStatus === "reviewed"
                      ? "Reviewed"
                      : "Draft guide"}
                  </Badge>
                </div>
                <h2>{lesson.title}</h2>
                <p>{lesson.summary}</p>
                <span className="text-link">
                  {done ? "Read again" : "Open field guide"}
                  <ArrowRight size={16} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      {!lessons.length && (
        <Empty
          icon={BookOpen}
          title={
            query || crop !== "All crops"
              ? "No matching guides"
              : "More knowledge is on the way."
          }
          body={
            query || crop !== "All crops"
              ? "Try another crop or search, or view all available guides."
              : "Your team has not added any field guides yet. Ask your extension officer for help."
          }
          action={
            query || crop !== "All crops" ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setParams({ view: "guides" });
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}
      <p className="source-note">
        Guides marked draft are awaiting local agronomist review. Their
        practical scope and source are shown inside each guide.
      </p>
    </section>
  );
}
export function LessonReader() {
  const { id } = useParams();
  return <LessonContent key={id} id={id} />;
}

function LessonContent({ id }: { id: string | undefined }) {
  const { data, refresh, online, notify } = useApp();
  const lesson = data.lessons.find((l) => l.id === id);
  const [answer, setAnswer] = useState<number | null>(null),
    [result, setResult] = useState<{
      completed: boolean;
      explanation?: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true);
  const submitting = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  if (!lesson)
    return (
      <Empty
        title="This guide is not available."
        body="Return to the learning library to choose another guide."
        action={
          <Link to="/learn?view=guides" className="button button-primary">
            Back to learning
          </Link>
        }
      />
    );
  async function submit() {
    if (answer === null || !lesson || !online || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await request<Progress & { explanation?: string }>(
        `/api/progress/${lesson.id}`,
        "PUT",
        { answerIndex: answer },
        crypto.randomUUID(),
      );
      if (alive.current) {
        setResult({ completed: res.completed, explanation: res.explanation });
        if (res.completed)
          notify("Well done. Your learning progress is saved.");
      }
      try {
        await refresh();
      } catch {
        if (alive.current)
          notify(
            "Your answer is saved. The learning list could not refresh; reconnect to update it.",
          );
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      submitting.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="reader">
      <Link className="text-link back-link" to="/learn?view=guides">
        <ArrowLeft size={16} />
        Back to learning
      </Link>
      <div className="reader-meta">
        <Badge tone="green">{lesson.crop}</Badge>
        <span>
          <Clock3 size={15} />
          {lesson.durationMinutes} min read
        </span>
        <span>{lesson.level}</span>
      </div>
      <h1>{lesson.title}</h1>
      <p className="reader-summary">{lesson.summary}</p>
      {lesson.reviewStatus === "draft" && (
        <Notice tone="warning">
          Draft field guide. Local agronomist review is pending; this is general
          learning, not a site-specific planting or treatment prescription.
        </Notice>
      )}
      <article>
        {lesson.sections.map((section, i) => (
          <section key={i}>
            <span className="reader-number">0{i + 1}</span>
            <div>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </div>
          </section>
        ))}
      </article>
      <div className="lesson-source">
        <span className="small-label">SOURCE & FURTHER READING</span>
        <a href={lesson.sourceUrl} target="_blank" rel="noreferrer">
          {lesson.sourceTitle}
          <ExternalLink size={16} />
        </a>
      </div>
      <section className="quiz">
        <span className="round-icon">
          <GraduationCap size={26} />
        </span>
        <h2>A quick check before you go.</h2>
        <p>{lesson.quiz.question}</p>
        <fieldset disabled={busy} aria-busy={busy}>
          <legend className="sr-only">Choose one answer</legend>
          {lesson.quiz.options.map((option, i) => (
            <label
              key={i}
              className={`quiz-option ${answer === i ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="answer"
                value={i}
                checked={answer === i}
                onChange={() => {
                  setAnswer(i);
                  setResult(null);
                }}
              />
              {option}
            </label>
          ))}
        </fieldset>
        {error && <ErrorMessage message={error} />}{" "}
        {result && (
          <Notice tone={result.completed ? "success" : "warning"}>
            {result.completed
              ? "That’s right. Your progress is saved."
              : "Not quite. Read the guide again and try another answer."}
            {result.explanation && <p>{result.explanation}</p>}
          </Notice>
        )}
        <Button
          busy={busy}
          disabled={answer === null || !online}
          onClick={() => void submit()}
        >
          Check my answer
          <ArrowRight size={16} />
        </Button>
        {!online && (
          <p className="muted">
            You can read offline. Reconnect to save quiz progress.
          </p>
        )}
      </section>
    </div>
  );
}
