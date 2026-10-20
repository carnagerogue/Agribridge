import { describe, expect, it } from "vitest";
import { navigationFor } from "./navigation";
import {
  assistantGuideLink,
  workspaceGuide,
  workspaceJourney,
} from "./workspace-guide";
import type { Bootstrap } from "../types";

const empty = {
  farms: [],
  seasons: [],
  lots: [],
  contacts: [],
  deals: [],
  collections: [],
} as unknown as Bootstrap;

describe("guided workspace", () => {
  it.each(["farmer", "operator", "admin"] as const)(
    "covers every visible destination for %s",
    (role) => {
      const navigation = navigationFor(role);
      for (const item of [
        ...navigation.core,
        ...navigation.more,
        ...navigation.cooperative,
        { to: "/settings" },
      ]) {
        const guide = workspaceGuide(item.to, role);
        expect(guide?.steps.length).toBeGreaterThanOrEqual(3);
        expect(guide?.question).toContain("Agribridge");
      }
    },
  );

  it("does not expose staff guidance to a farmer or an unknown user", () => {
    expect(workspaceGuide("/crm", "farmer")).toBeUndefined();
    expect(workspaceGuide("/admin")).toBeUndefined();
    expect(workspaceGuide("/unknown", "admin")).toBeUndefined();
  });

  it("starts an empty farm journey with a prerequisite instead of fictional progress", () => {
    const steps = workspaceJourney(empty, false);
    expect(steps.every((step) => !step.recorded)).toBe(true);
    expect(steps.every((step) => step.to === "/farms")).toBe(true);
  });

  it("does not count a plan as a harvested lot or a sale", () => {
    const data = {
      ...empty,
      farms: [{ id: "farm" }],
      seasons: [{ sales: [] }],
    } as unknown as Bootstrap;
    expect(workspaceJourney(data, false).map((step) => step.recorded)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(workspaceJourney(data, false)[2].to).toBe("/harvest");
  });

  it("keeps collection planning separate from actual dispatch", () => {
    const data = {
      ...empty,
      collections: [{ status: "planning" }],
    } as unknown as Bootstrap;
    expect(workspaceJourney(data, true).map((step) => step.recorded)).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(workspaceJourney(data, true)[2].to).toBe("/harvest?tab=collections");
  });

  it("prepares a bounded question without adding workspace records to its URL", () => {
    const guide = workspaceGuide("/seasons", "farmer")!;
    const url = new URL(
      assistantGuideLink(guide.question),
      "https://example.org",
    );
    expect(url.pathname).toBe("/assistant");
    expect([...url.searchParams.keys()]).toEqual(["question"]);
    expect(url.searchParams.get("question")).toBe(guide.question);
    expect(
      new URL(assistantGuideLink("a".repeat(900)), url).searchParams.get(
        "question",
      ),
    ).toHaveLength(600);
  });
});
