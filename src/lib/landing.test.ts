import { describe, expect, it, vi } from "vitest";
import { enterLandingDemo, landingEntry, landingStages } from "./landing";

describe("public landing entry", () => {
  it("always returns authenticated users to their current workspace", () => {
    expect(landingEntry(true, true)).toEqual({
      kind: "workspace",
      label: "Open workspace",
      to: "/",
    });
    expect(landingEntry(true, false).kind).toBe("workspace");
  });
  it("offers sample access only in explicit demo mode", () => {
    expect(landingEntry(false, true).kind).toBe("demo");
    expect(landingEntry(false, false)).toEqual({
      kind: "signin",
      label: "Sign in",
      to: "/login",
    });
  });
  it("waits for a successful demo session before entering the workspace", async () => {
    let complete!: () => void;
    const login = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const enter = vi.fn();
    const pending = enterLandingDemo(login, enter);
    expect(login).toHaveBeenCalledOnce();
    expect(enter).not.toHaveBeenCalled();
    complete();
    await pending;
    expect(enter).toHaveBeenCalledOnce();
  });
  it("leaves navigation unchanged when a demo cannot start", async () => {
    const enter = vi.fn();
    await expect(
      enterLandingDemo(() => Promise.reject(new Error("Offline")), enter),
    ).rejects.toThrow("Offline");
    expect(enter).not.toHaveBeenCalled();
  });
  it("provides four distinct manual chapters with honest sample context", () => {
    expect(landingStages.map((stage) => stage.label)).toEqual([
      "Prepare",
      "Grow",
      "Harvest",
      "Sell",
    ]);
    expect(new Set(landingStages.map((stage) => stage.id)).size).toBe(4);
    for (const stage of landingStages) {
      expect(stage.title).toBeTruthy();
      expect(stage.task).toBeTruthy();
      expect(stage.note).toBeTruthy();
    }
    expect(landingStages[2].note).toContain("not certification");
    expect(landingStages[3].note).toContain("not live buyer offers");
  });
});
