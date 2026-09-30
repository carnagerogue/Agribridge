import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ExternalLink,
  FilePenLine,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { request } from "../lib/api";
import { dateTime } from "../lib/format";
import type { Lesson } from "../types";
import {
  Badge,
  Button,
  Empty,
  ErrorMessage,
  Field,
  Form,
  Modal,
  Notice,
  Skeleton,
  fieldText,
} from "./ui";

type EditorialLesson = Lesson & {
  version: number;
  updatedAt: string | null;
  reviewerName: string | null;
  reviewerQualification: string | null;
  reviewNotes: string;
  reviewedAt: string | null;
  reviewRecordedBy: string | null;
  reviewAttestation: boolean;
};
type Editor = { lesson: EditorialLesson; mode: "edit" | "review" | "withdraw" };

export default function LessonEditorial({
  revision = 0,
}: {
  revision?: number;
}) {
  const { user, online, mutate, notify } = useApp();
  const [lessons, setLessons] = useState<EditorialLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const close = useCallback(() => setEditor(null), []);

  useEffect(() => {
    let active = true;
    if (!online || user?.role !== "admin") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    void request<EditorialLesson[]>("/api/admin/lessons")
      .then((guides) => {
        if (active) setLessons(guides);
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load field-guide reviews.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [online, user?.id, user?.role, revision, reload]);

  async function save(form: FormData) {
    if (!editor || !online)
      throw new Error("Reconnect before changing field guides.");
    const { lesson, mode } = editor;
    const body =
      mode === "edit"
        ? {
            version: lesson.version,
            title: fieldText(form, "title"),
            summary: fieldText(form, "summary"),
            sourceTitle: fieldText(form, "sourceTitle"),
            sourceUrl: fieldText(form, "sourceUrl"),
            sections: lesson.sections.map((_, index) => ({
              heading: fieldText(form, `heading-${index}`),
              body: fieldText(form, `body-${index}`),
            })),
            reviewStatus: "draft",
            reviewNotes: fieldText(form, "reviewNotes"),
          }
        : mode === "review"
          ? {
              version: lesson.version,
              reviewStatus: "reviewed",
              reviewerName: fieldText(form, "reviewerName"),
              reviewerQualification: fieldText(form, "reviewerQualification"),
              reviewNotes: fieldText(form, "reviewNotes"),
              reviewConfirmed: form.get("reviewConfirmed") === "on",
            }
          : {
              version: lesson.version,
              reviewStatus: "draft",
              reviewNotes: fieldText(form, "reviewNotes"),
            };
    const updated = await mutate<EditorialLesson>(
      `/api/admin/lessons/${lesson.id}`,
      "PUT",
      body,
    );
    if ("queued" in updated) return;
    setLessons((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    close();
    notify(
      mode === "review"
        ? "Review recorded for this organization. The source and reviewer remain visible."
        : "Draft saved. This guide is excluded from production AI guidance until reviewed.",
    );
  }

  if (user?.role !== "admin") return null;
  return (
    <>
      <section
        className="panel op-team lesson-editorial"
        aria-labelledby="lesson-editorial-title"
      >
        <div className="panel-header">
          <div>
            <h2 id="lesson-editorial-title">Field guides & review</h2>
            <p className="muted">
              Edit learning content and record qualified local review.
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={!online}
            busy={loading}
            onClick={() => setReload((value) => value + 1)}
          >
            <RotateCcw size={16} />
            Refresh guides
          </Button>
        </div>
        {error && (
          <div className="op-panel-error">
            <ErrorMessage message={error} />
          </div>
        )}
        {!online && (
          <div className="op-panel-error">
            <Notice>
              Reconnect to edit or review guides. Review records are not saved
              offline.
            </Notice>
          </div>
        )}
        {loading && !lessons.length ? (
          <Skeleton />
        ) : lessons.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Field guide</th>
                  <th>Review status</th>
                  <th>Source & version</th>
                  <th>
                    <span className="sr-only">Editorial actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((lesson) => (
                  <tr key={lesson.id}>
                    <td>
                      <Link className="text-link" to={`/learn/${lesson.id}`}>
                        {lesson.title}
                        <BookOpen size={14} />
                      </Link>
                      <small className="op-cell-secondary">
                        {lesson.crop} · {lesson.durationMinutes} min read
                      </small>
                    </td>
                    <td>
                      <Badge
                        tone={
                          lesson.reviewStatus === "reviewed" ? "green" : "amber"
                        }
                      >
                        {lesson.reviewStatus === "reviewed"
                          ? "Review recorded"
                          : "Awaiting review"}
                      </Badge>
                      {lesson.reviewedAt && (
                        <small className="op-cell-secondary">
                          {lesson.reviewerName}
                          <br />
                          {dateTime(lesson.reviewedAt)}
                        </small>
                      )}
                    </td>
                    <td>
                      <a
                        href={lesson.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-link"
                      >
                        Official source
                        <ExternalLink size={13} />
                      </a>
                      <small className="op-cell-secondary">
                        Version {lesson.version}
                        {lesson.updatedAt
                          ? ` · ${dateTime(lesson.updatedAt)}`
                          : " · Initial draft"}
                      </small>
                    </td>
                    <td>
                      <div className="lesson-editorial-actions">
                        <Button
                          variant="ghost"
                          disabled={!online}
                          onClick={() => setEditor({ lesson, mode: "edit" })}
                          aria-label={`Edit ${lesson.title}`}
                        >
                          <FilePenLine size={15} />
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={!online}
                          onClick={() => setEditor({ lesson, mode: "review" })}
                          aria-label={`Record review for ${lesson.title}`}
                        >
                          Record review
                        </Button>
                        {lesson.reviewStatus === "reviewed" && (
                          <Button
                            variant="ghost"
                            disabled={!online}
                            onClick={() =>
                              setEditor({ lesson, mode: "withdraw" })
                            }
                            aria-label={`Return ${lesson.title} to draft`}
                          >
                            Return to draft
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading && !error ? (
          <Empty
            icon={BookOpen}
            title="No field guides loaded"
            body="Refresh when connected to view your organization's learning content."
          />
        ) : null}
        <div className="op-panel-note">
          <ShieldCheck size={16} />
          <span>
            Reviews apply to this organization. A recorded review is your team's
            attestation, not independent verification of professional
            credentials. Content changes require a new review before production
            AI can use the guide.
          </span>
        </div>
      </section>
      {editor && (
        <Modal
          title={
            editor.mode === "edit"
              ? "Edit field guide"
              : editor.mode === "review"
                ? "Record a qualified review"
                : "Return guide to draft?"
          }
          description={editor.lesson.title}
          onClose={close}
          wide={editor.mode !== "withdraw"}
        >
          <Form
            key={`${editor.lesson.id}:${editor.mode}`}
            onSubmit={save}
            onCancel={close}
            submitLabel={
              editor.mode === "edit"
                ? "Save draft"
                : editor.mode === "review"
                  ? "Record review"
                  : "Return to draft"
            }
          >
            {editor.mode === "edit" ? (
              <>
                <div className="op-full">
                  <Notice>
                    Saving changes returns this guide to draft and removes its
                    prior review. Review the wording and source before approving
                    a new version.
                  </Notice>
                </div>
                <div className="op-full">
                  <Field label="Guide title">
                    <input
                      name="title"
                      defaultValue={editor.lesson.title}
                      minLength={5}
                      maxLength={160}
                      required
                    />
                  </Field>
                </div>
                <div className="op-full">
                  <Field label="Short summary">
                    <textarea
                      name="summary"
                      defaultValue={editor.lesson.summary}
                      rows={3}
                      minLength={10}
                      maxLength={500}
                      required
                    />
                  </Field>
                </div>
                {editor.lesson.sections.map((section, index) => (
                  <fieldset
                    className="lesson-editorial-section op-full"
                    key={index}
                  >
                    <legend>Section {index + 1}</legend>
                    <Field label="Section heading">
                      <input
                        name={`heading-${index}`}
                        defaultValue={section.heading}
                        minLength={3}
                        maxLength={160}
                        required
                      />
                    </Field>
                    <Field label="Section content">
                      <textarea
                        name={`body-${index}`}
                        defaultValue={section.body}
                        rows={5}
                        minLength={20}
                        maxLength={3500}
                        required
                      />
                    </Field>
                  </fieldset>
                ))}
                <Field label="Source title">
                  <input
                    name="sourceTitle"
                    defaultValue={editor.lesson.sourceTitle}
                    minLength={3}
                    maxLength={200}
                    required
                  />
                </Field>
                <Field
                  label="Official source URL"
                  hint="Use an approved government, agricultural research, WHO or FAO source."
                >
                  <input
                    type="url"
                    name="sourceUrl"
                    defaultValue={editor.lesson.sourceUrl}
                    maxLength={1000}
                    required
                  />
                </Field>
                <div className="op-full">
                  <Field
                    label="Editorial notes"
                    hint="Describe what changed and what still needs review."
                  >
                    <textarea name="reviewNotes" rows={3} maxLength={3000} />
                  </Field>
                </div>
              </>
            ) : editor.mode === "review" ? (
              <>
                <div className="op-full">
                  <Notice tone="warning">
                    Only record a review that has actually been completed by a
                    qualified person. This makes the current version available
                    to your organization's production AI and USSD learning
                    service.
                  </Notice>
                </div>
                <div className="op-full lesson-editorial-reference">
                  <strong>
                    Version {editor.lesson.version}: {editor.lesson.title}
                  </strong>
                  <p>{editor.lesson.summary}</p>
                  <a
                    className="text-link"
                    href={editor.lesson.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open official source
                    <ExternalLink size={14} />
                  </a>
                </div>
                <Field label="Reviewer's full name">
                  <input
                    name="reviewerName"
                    minLength={3}
                    maxLength={100}
                    required
                    autoComplete="off"
                  />
                </Field>
                <Field label="Relevant qualification or role">
                  <input
                    name="reviewerQualification"
                    minLength={5}
                    maxLength={200}
                    required
                    placeholder="e.g. District agricultural extension officer"
                  />
                </Field>
                <div className="op-full">
                  <Field
                    label="Review notes"
                    hint="Record the scope, local applicability, source checks and any limits identified."
                  >
                    <textarea
                      name="reviewNotes"
                      rows={4}
                      minLength={10}
                      maxLength={3000}
                      required
                    />
                  </Field>
                </div>
                <label className="consent-checkbox op-full">
                  <input type="checkbox" name="reviewConfirmed" required />
                  <span>
                    I confirm the named qualified reviewer assessed this exact
                    version, including the source and quiz, and approved it for
                    this organization's intended use. I am recording a real
                    review.
                  </span>
                </label>
              </>
            ) : (
              <>
                <div className="op-full">
                  <Notice tone="warning">
                    This guide will remain readable as a draft. It will be
                    removed from production AI guidance and USSD lessons until a
                    new review is recorded.
                  </Notice>
                </div>
                <div className="op-full">
                  <Field label="Reason for returning to draft">
                    <textarea name="reviewNotes" rows={3} maxLength={3000} />
                  </Field>
                </div>
              </>
            )}
          </Form>
        </Modal>
      )}
    </>
  );
}
