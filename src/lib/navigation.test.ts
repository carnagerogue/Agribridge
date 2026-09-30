import { describe, expect, it } from "vitest";
import {
  CORE_NAVIGATION,
  activeNavigationGroup,
  navigationFor,
  navigationLabel,
  routeMatches,
} from "./navigation";

describe("simple navigation", () => {
  it("keeps exactly the same five core destinations for every role", () => {
    expect(CORE_NAVIGATION.map((item) => item.label)).toEqual([
      "Home",
      "Farms",
      "Weather",
      "Prices",
      "Learn",
    ]);
    expect(CORE_NAVIGATION.map((item) => item.to)).toEqual([
      "/",
      "/farms",
      "/weather",
      "/markets",
      "/learn",
    ]);
    for (const role of ["farmer", "operator", "admin"] as const) {
      expect(navigationFor(role).core).toEqual(CORE_NAVIGATION);
    }
  });
  it("keeps advanced farm routes separate from the primary choices", () => {
    expect(navigationFor("farmer").more.map((item) => item.to)).toEqual([
      "/seasons",
      "/harvest",
      "/community",
      "/assistant",
    ]);
    expect(
      navigationFor("farmer").more.every(
        (item) => !CORE_NAVIGATION.some((core) => core.to === item.to),
      ),
    ).toBe(true);
  });
  it("never shows cooperative routes for farmers or missing identities", () => {
    for (const role of ["farmer", null, undefined] as const) {
      expect(navigationFor(role).cooperative).toEqual([]);
      expect(activeNavigationGroup("/crm", role)).toBeNull();
      expect(navigationLabel("/admin", role)).toBe("Agribridge");
    }
  });
  it("preserves the existing staff navigation permissions", () => {
    for (const role of ["operator", "admin"] as const) {
      expect(navigationFor(role).cooperative.map((item) => item.to)).toEqual([
        "/crm",
        "/trade",
        "/messages",
        "/admin",
      ]);
    }
  });
  it("starts groups closed on home and other primary destinations", () => {
    for (const item of CORE_NAVIGATION) {
      expect(activeNavigationGroup(item.to, "operator")).toBeNull();
    }
    expect(activeNavigationGroup("/settings", "operator")).toBeNull();
  });
  it("opens the relevant group for authorized deep links", () => {
    expect(activeNavigationGroup("/harvest", "farmer")).toBe("more");
    expect(activeNavigationGroup("/assistant", "operator")).toBe("more");
    expect(activeNavigationGroup("/crm/contact", "operator")).toBe(
      "cooperative",
    );
    expect(activeNavigationGroup("/messages", "admin")).toBe("cooperative");
  });
  it("does not match lookalike route prefixes", () => {
    expect(routeMatches("/farmstead", "/farms")).toBe(false);
    expect(routeMatches("/crm-export", "/crm")).toBe(false);
    expect(routeMatches("/learn/maize", "/learn")).toBe(true);
    expect(routeMatches("/weather", "/")).toBe(false);
    expect(activeNavigationGroup("/administer", "admin")).toBeNull();
  });
  it("uses concise labels for primary and nested routes", () => {
    expect(navigationLabel("/", "operator")).toBe("Home");
    expect(navigationLabel("/markets", "farmer")).toBe("Prices");
    expect(navigationLabel("/learn/maize", "farmer")).toBe("Learn");
    expect(navigationLabel("/settings", "farmer")).toBe(
      "Settings & connection",
    );
    expect(navigationLabel("/not-found", "operator")).toBe("Agribridge");
  });
});
