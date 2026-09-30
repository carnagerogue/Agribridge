/** Manually checked public FAO metadata. No course content, media or quizzes are copied. */
export const LEARNING_SOURCES_CHECKED_ON = "2026-09-29";
export const FAO_CATALOGUE_URL = "https://elearning.fao.org/local/search/";
export const FAO_ACCESS_HELP_URL =
  "https://elearning.fao.org/mod/page/view.php?id=4556";
export const FAO_TERMS_URL = "https://www.fao.org/contact-us/terms/en/";

export const learningTopics = [
  { id: "soil-water", label: "Soil & water", recommendedId: "soil" },
  {
    id: "protect-crops",
    label: "Protect crops",
    recommendedId: "fall-armyworm",
  },
  {
    id: "harvest-storage",
    label: "Harvest & storage",
    recommendedId: "harvest",
  },
] as const;
export type LearningTopicId = (typeof learningTopics)[number]["id"];
export type LearningView = "fao" | "guides";

export type LearningResource = {
  id: string;
  title: string;
  summary: string;
  url: string;
  provider: "FAO";
  language: "English";
  otherLanguages: readonly string[];
  format: "course" | "pdf";
  durationMinutes: number | null;
  requiresAccount: boolean;
  publishedYear: number;
  downloadMb: number;
  downloadPlatform: "windows" | "pdf-reader";
  topics: readonly LearningTopicId[];
  advanced?: boolean;
  caution?: string;
  sourceCheckedOn: string;
};

export const learningResources: readonly LearningResource[] = [
  {
    id: "soil",
    title: "Climate-smart soil and land management",
    summary:
      "Explore ways to care for soil, reduce erosion and make better use of water on your land.",
    url: "https://elearning.fao.org/course/view.php?id=435",
    provider: "FAO",
    language: "English",
    otherLanguages: ["Arabic", "Spanish", "French"],
    format: "course",
    durationMinutes: 120,
    requiresAccount: true,
    publishedYear: 2018,
    downloadMb: 114.7,
    downloadPlatform: "windows",
    topics: ["soil-water"],
    sourceCheckedOn: LEARNING_SOURCES_CHECKED_ON,
  },
  {
    id: "water",
    title: "Water management for climate-smart agriculture",
    summary:
      "Understand how a changing climate affects water supplies and the choices available for managing farm water.",
    url: "https://elearning.fao.org/course/view.php?id=438",
    provider: "FAO",
    language: "English",
    otherLanguages: ["Arabic", "Spanish", "French"],
    format: "course",
    durationMinutes: 90,
    requiresAccount: true,
    publishedYear: 2018,
    downloadMb: 39,
    downloadPlatform: "windows",
    topics: ["soil-water"],
    sourceCheckedOn: LEARNING_SOURCES_CHECKED_ON,
  },
  {
    id: "fall-armyworm",
    title:
      "Integrated management of the Fall Armyworm on maize: A guide for farmer field schools in Africa",
    summary:
      "A field-training reference for learning about fall armyworm and discussing crop protection with an extension worker.",
    url: "https://openknowledge.fao.org/server/api/core/bitstreams/1e2f7c5b-d238-4410-a1e4-a2635cbb63f5/content",
    provider: "FAO",
    language: "English",
    otherLanguages: [],
    format: "pdf",
    durationMinutes: null,
    requiresAccount: false,
    publishedYear: 2018,
    downloadMb: 7.2,
    downloadPlatform: "pdf-reader",
    topics: ["protect-crops"],
    caution:
      "Published in 2018. This is a training reference, not a diagnosis or current Uganda pesticide advice.",
    sourceCheckedOn: LEARNING_SOURCES_CHECKED_ON,
  },
  {
    id: "harvest",
    title: "Farm machinery and equipment for harvest, post-harvest and storage",
    summary:
      "Compare small-scale equipment for handling maize and rice, and learn about options for storing grain.",
    url: "https://elearning.fao.org/course/view.php?id=906",
    provider: "FAO",
    language: "English",
    otherLanguages: ["French"],
    format: "course",
    durationMinutes: 45,
    requiresAccount: true,
    publishedYear: 2023,
    downloadMb: 25.8,
    downloadPlatform: "windows",
    topics: ["harvest-storage"],
    sourceCheckedOn: LEARNING_SOURCES_CHECKED_ON,
  },
  {
    id: "crop-production",
    title: "Climate-smart crop production",
    summary:
      "A longer, more technical introduction to crop-management choices across different farming systems.",
    url: "https://elearning.fao.org/course/view.php?id=436",
    provider: "FAO",
    language: "English",
    otherLanguages: ["Arabic", "Spanish", "French", "Chinese"],
    format: "course",
    durationMinutes: 150,
    requiresAccount: true,
    publishedYear: 2018,
    downloadMb: 113.6,
    downloadPlatform: "windows",
    topics: ["soil-water", "protect-crops"],
    advanced: true,
    sourceCheckedOn: LEARNING_SOURCES_CHECKED_ON,
  },
];

// Exact URLs only: query changes, tracking parameters, lookalike hosts and redirects
// supplied through app query parameters are never used as external destinations.
const allowedLearningUrls = new Set([
  "https://elearning.fao.org/course/view.php?id=435",
  "https://elearning.fao.org/course/view.php?id=438",
  "https://elearning.fao.org/course/view.php?id=906",
  "https://elearning.fao.org/course/view.php?id=436",
  "https://openknowledge.fao.org/server/api/core/bitstreams/1e2f7c5b-d238-4410-a1e4-a2635cbb63f5/content",
  FAO_CATALOGUE_URL,
  FAO_ACCESS_HELP_URL,
  FAO_TERMS_URL,
]);

export function isAllowedLearningUrl(url: string): boolean {
  return allowedLearningUrls.has(url);
}

export function learningLinkHref(
  url: string,
  online: boolean,
): string | undefined {
  return online && isAllowedLearningUrl(url) ? url : undefined;
}

export function resolveLearningTopic(value: string | null): LearningTopicId {
  return learningTopics.find((topic) => topic.id === value)?.id ?? "soil-water";
}

export function resolveLearningView(params: URLSearchParams): LearningView {
  return params.has("crop") || params.get("view") === "guides"
    ? "guides"
    : "fao";
}

export function resourcesForTopic(topic: LearningTopicId) {
  const recommendation = learningTopics.find(
    (item) => item.id === topic,
  )?.recommendedId;
  return {
    recommended: learningResources.find(
      (resource) => resource.id === recommendation,
    ),
    more: learningResources.filter(
      (resource) =>
        resource.id !== recommendation && resource.topics.includes(topic),
    ),
  };
}

export function learningDuration(minutes: number | null): string {
  if (minutes === null) return "Reference guide";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60),
    remainder = minutes % 60;
  return `${hours} ${hours === 1 ? "hour" : "hours"}${remainder ? ` ${remainder} minutes` : ""}`;
}

export function learningCheckedDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
