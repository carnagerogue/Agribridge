import { z } from "zod";
import type { Queryable } from "./db.js";
import { lessons, type Lesson } from "./lessons.js";
import { ApiError, type User } from "./security.js";
import { audit } from "./store.js";

export type EditorialLesson = Lesson & {
  version: number;
  updatedAt: string | null;
  reviewerName: string | null;
  reviewerQualification: string | null;
  reviewNotes: string;
  reviewedAt: string | null;
  reviewRecordedBy: string | null;
  reviewAttestation: boolean;
};
type Edition = {
  lesson_id: string;
  data: Omit<EditorialLesson, "version" | "updatedAt">;
  version: number;
  updated_at: Date | string;
};
export const publicLessons = () =>
  lessons.map((lesson) => ({
    ...lesson,
    version: 1,
    updatedAt: null,
    reviewerName: null,
    reviewerQualification: null,
    reviewNotes: "",
    reviewedAt: null,
    reviewRecordedBy: null,
    reviewAttestation: false,
  }));
export async function getLessons(
  db: Queryable,
  tenantId: string,
): Promise<EditorialLesson[]> {
  const { rows } = await db.query<Edition>(
    `SELECT lesson_id,data,version,updated_at FROM lesson_editions WHERE tenant_id=$1`,
    [tenantId],
  );
  const byId = new Map(rows.map((row) => [row.lesson_id, row]));
  return publicLessons().map((lesson) => {
    const row = byId.get(lesson.id);
    return row
      ? {
          ...row.data,
          id: lesson.id,
          version: row.version,
          updatedAt: new Date(row.updated_at).toISOString(),
        }
      : lesson;
  });
}
export async function getLesson(db: Queryable, tenantId: string, id: string) {
  const lesson = (await getLessons(db, tenantId)).find(
    (item) => item.id === id,
  );
  if (!lesson) throw new ApiError(404, "NOT_FOUND", "Field guide not found.");
  return lesson;
}
const text = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);
const sourceDomains = [
  "agriculture.go.ug",
  "naro.go.ug",
  "fao.org",
  "who.int",
  "mwe.go.ug",
  "open-meteo.com",
];
const sourceUrl = z
  .string()
  .url()
  .max(1000)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      sourceDomains.some(
        (domain) =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    );
  }, "Use an HTTPS link to an approved official agricultural, health or weather source.");
const quizSchema = z
  .object({
    question: text(5, 400),
    options: z.array(text(1, 250)).min(2).max(6),
    answerIndex: z.number().int().min(0).max(5),
    explanation: text(10, 1000),
  })
  .strict()
  .refine(
    (quiz) => quiz.answerIndex < quiz.options.length,
    "The answer must refer to one of the options.",
  );
const contentSchema = z
  .object({
    title: text(5, 160),
    summary: text(10, 500),
    durationMinutes: z.number().int().min(1).max(120),
    level: text(2, 80),
    sections: z
      .array(z.object({ heading: text(3, 160), body: text(20, 3500) }).strict())
      .min(1)
      .max(8),
    quiz: quizSchema,
    sourceTitle: text(3, 200),
    sourceUrl,
  })
  .strict();
export const lessonEditSchema = contentSchema
  .partial()
  .extend({
    version: z.number().int().positive(),
    reviewStatus: z.enum(["draft", "reviewed"]).optional(),
    reviewerName: text(3, 100).optional(),
    reviewerQualification: text(5, 200).optional(),
    reviewNotes: z.string().trim().max(3000).optional(),
    reviewConfirmed: z.boolean().optional(),
  })
  .strict();

export async function editLesson(
  db: Queryable,
  user: User,
  id: string,
  raw: unknown,
): Promise<EditorialLesson> {
  const input = lessonEditSchema.parse(raw);
  const old = await getLesson(db, user.organizationId, id);
  if (input.version !== old.version)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This field guide changed. Refresh before recording your review.",
    );
  const {
    version: _version,
    reviewStatus,
    reviewerName,
    reviewerQualification,
    reviewNotes,
    reviewConfirmed,
    ...content
  } = input;
  if (
    !Object.keys(content).length &&
    reviewStatus === undefined &&
    reviewNotes === undefined
  )
    throw new ApiError(
      400,
      "EMPTY_UPDATE",
      "Edit the content or choose a review action.",
    );
  const reviewed = reviewStatus === "reviewed";
  if (
    reviewed &&
    (!reviewConfirmed ||
      !reviewerName ||
      !reviewerQualification ||
      !reviewNotes ||
      reviewNotes.length < 10)
  )
    throw new ApiError(
      400,
      "REVIEW_ATTESTATION_REQUIRED",
      "Record the reviewer’s name, relevant qualification, review notes, and explicit confirmation before approving this field guide.",
    );
  const merged = contentSchema.parse({
    ...Object.fromEntries(
      Object.keys(contentSchema.shape).map((key) => [
        key,
        old[key as keyof EditorialLesson],
      ]),
    ),
    ...content,
  });
  const next: EditorialLesson = {
    ...old,
    ...merged,
    reviewStatus: reviewed ? "reviewed" : "draft",
    reviewerName: reviewed ? reviewerName! : null,
    reviewerQualification: reviewed ? reviewerQualification! : null,
    reviewNotes: reviewNotes ?? "",
    reviewedAt: reviewed ? new Date().toISOString() : null,
    reviewRecordedBy: reviewed ? user.name : null,
    reviewAttestation: reviewed,
    version: old.version + 1,
    updatedAt: new Date().toISOString(),
  };
  const { version, updatedAt, ...data } = next;
  const result = await db.query<Edition>(
    `INSERT INTO lesson_editions(tenant_id,lesson_id,data,version) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(tenant_id,lesson_id) DO UPDATE SET data=EXCLUDED.data,version=EXCLUDED.version,updated_at=now() WHERE lesson_editions.version=$5 RETURNING lesson_id,data,version,updated_at`,
    [user.organizationId, id, JSON.stringify(data), version, old.version],
  );
  if (!result.rows.length)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This field guide changed. Refresh before recording your review.",
    );
  await db.query(
    `INSERT INTO lesson_history(tenant_id,lesson_id,version,data,actor_id) VALUES($1,$2,$3,$4::jsonb,$5)`,
    [user.organizationId, id, version, JSON.stringify(data), user.id],
  );
  await audit(
    db,
    user,
    reviewed ? "lesson.review_recorded" : "lesson.draft_saved",
    "lessons",
    id,
  );
  return {
    ...data,
    version,
    updatedAt: new Date(result.rows[0].updated_at).toISOString(),
  };
}
