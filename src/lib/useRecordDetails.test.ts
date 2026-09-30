import { describe, expect, it, vi } from "vitest";
import { restoreRecordTarget, revealRecordTarget } from "./useRecordDetails";

function target(isConnected = true) {
  return { isConnected, focus: vi.fn(), scrollIntoView: vi.fn() };
}

describe("record detail focus", () => {
  it("focuses before scrolling with no intermediate browser jump", () => {
    const detail = target();
    expect(revealRecordTarget(detail)).toBe(true);
    expect(detail.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(detail.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "instant",
    });
    expect(detail.focus.mock.invocationCallOrder[0]).toBeLessThan(
      detail.scrollIntoView.mock.invocationCallOrder[0],
    );
  });

  it("returns to the opening row without changing the list", () => {
    const row = target(),
      list = target();
    restoreRecordTarget(row, list);
    expect(row.focus).toHaveBeenCalledOnce();
    expect(row.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "instant",
    });
    expect(list.focus).not.toHaveBeenCalled();
  });

  it("falls back to the list heading after the opening row is filtered out", () => {
    const row = target(false),
      list = target();
    restoreRecordTarget(row, list);
    expect(row.focus).not.toHaveBeenCalled();
    expect(list.focus).toHaveBeenCalledOnce();
  });

  it("safely ignores absent or unmounted destinations", () => {
    expect(revealRecordTarget(null)).toBe(false);
    const removed = target(false);
    expect(revealRecordTarget(removed)).toBe(false);
    expect(removed.focus).not.toHaveBeenCalled();
    expect(() => restoreRecordTarget(null, null)).not.toThrow();
  });
});
