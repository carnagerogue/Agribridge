import { describe, expect, it } from "vitest";
import {
  FAO_ACCESS_HELP_URL,
  FAO_CATALOGUE_URL,
  FAO_TERMS_URL,
  LEARNING_SOURCES_CHECKED_ON,
  isAllowedLearningUrl,
  learningCheckedDate,
  learningDuration,
  learningLinkHref,
  learningResources,
  learningTopics,
  resolveLearningTopic,
  resolveLearningView,
  resourcesForTopic,
} from "./learning-resources";

describe("curated FAO resource safety", () => {
  it("uses unique, checked, HTTPS primary-source destinations only", () => {
    expect(new Set(learningResources.map((resource) => resource.id)).size).toBe(
      5,
    );
    expect(
      new Set(learningResources.map((resource) => resource.url)).size,
    ).toBe(5);
    for (const resource of learningResources) {
      const url = new URL(resource.url);
      expect(url.protocol).toBe("https:");
      expect(["elearning.fao.org", "openknowledge.fao.org"]).toContain(
        url.hostname,
      );
      expect(isAllowedLearningUrl(resource.url)).toBe(true);
      expect(resource.sourceCheckedOn).toBe(LEARNING_SOURCES_CHECKED_ON);
      expect(resource.provider).toBe("FAO");
      expect(resource.language).toBe("English");
      expect(resource.summary.length).toBeLessThan(180);
    }
  });

  it("rejects script URLs, lookalike hosts and unreviewed paths or query changes", () => {
    for (const url of [
      "javascript:alert(1)",
      "https://elearning.fao.org.evil.test/course/view.php?id=435",
      "https://elearning.fao.org@evil.test/course/view.php?id=435",
      "http://elearning.fao.org/course/view.php?id=435",
      "https://elearning.fao.org/course/view.php?id=999",
      "https://elearning.fao.org/course/view.php?id=435&redirect=https://evil.test",
    ])
      expect(isAllowedLearningUrl(url)).toBe(false);
  });

  it("provides no external href while offline, including help and catalogue", () => {
    const urls = [
      ...learningResources.map((resource) => resource.url),
      FAO_CATALOGUE_URL,
      FAO_ACCESS_HELP_URL,
      FAO_TERMS_URL,
    ];
    for (const url of urls) {
      expect(learningLinkHref(url, false)).toBeUndefined();
      expect(learningLinkHref(url, true)).toBe(url);
    }
    expect(learningLinkHref("https://example.com", true)).toBeUndefined();
  });

  it("does not promise offline phone courses or a measured reading time for the PDF", () => {
    for (const course of learningResources.filter(
      (resource) => resource.format === "course",
    )) {
      expect(course.requiresAccount).toBe(true);
      expect(course.downloadPlatform).toBe("windows");
      expect(course.durationMinutes).toBeGreaterThan(0);
    }
    const pdf = learningResources.find(
      (resource) => resource.id === "fall-armyworm",
    )!;
    expect(pdf).toMatchObject({
      format: "pdf",
      requiresAccount: false,
      durationMinutes: null,
      downloadMb: 7.2,
      publishedYear: 2018,
      downloadPlatform: "pdf-reader",
    });
    expect(pdf.caution).toContain("not a diagnosis");
  });
});

describe("learning navigation and topic filters", () => {
  it("offers one relevant recommendation and separate, non-duplicated extras per topic", () => {
    for (const topic of learningTopics) {
      const result = resourcesForTopic(topic.id);
      expect(result.recommended?.id).toBe(topic.recommendedId);
      expect(result.recommended?.topics).toContain(topic.id);
      expect(result.recommended?.advanced).not.toBe(true);
      for (const extra of result.more) {
        expect(extra.id).not.toBe(topic.recommendedId);
        expect(extra.topics).toContain(topic.id);
      }
    }
    expect(resourcesForTopic("harvest-storage").more).toEqual([]);
  });

  it("defaults to soil and water and ignores unknown query topics", () => {
    expect(resolveLearningTopic(null)).toBe("soil-water");
    expect(resolveLearningTopic("unreviewed-topic")).toBe("soil-water");
    expect(resolveLearningTopic("https://example.com")).toBe("soil-water");
    expect(resolveLearningTopic("protect-crops")).toBe("protect-crops");
  });

  it("preserves existing crop deep links into short guides", () => {
    expect(resolveLearningView(new URLSearchParams())).toBe("fao");
    expect(
      resolveLearningView(new URLSearchParams("topic=protect-crops")),
    ).toBe("fao");
    expect(resolveLearningView(new URLSearchParams("view=guides"))).toBe(
      "guides",
    );
    expect(
      resolveLearningView(new URLSearchParams("crop=Maize&topic=soil-water")),
    ).toBe("guides");
    expect(resolveLearningView(new URLSearchParams("crop=&view=fao"))).toBe(
      "guides",
    );
  });

  it("displays published durations without inventing a PDF reading estimate", () => {
    expect(learningDuration(45)).toBe("45 minutes");
    expect(learningDuration(90)).toBe("1 hour 30 minutes");
    expect(learningDuration(120)).toBe("2 hours");
    expect(learningDuration(150)).toBe("2 hours 30 minutes");
    expect(learningDuration(null)).toBe("Reference guide");
    expect(learningCheckedDate("2026-09-29")).toBe("29 September 2026");
  });
});
