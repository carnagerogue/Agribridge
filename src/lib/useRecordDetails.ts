import { useEffect, useRef } from "react";

type FocusTarget = Pick<
  HTMLElement,
  "isConnected" | "focus" | "scrollIntoView"
>;

/** Focus and scroll separately so a fixed header cannot obscure the destination. */
export function revealRecordTarget(
  target: FocusTarget | null,
  block: ScrollLogicalPosition = "start",
): boolean {
  if (!target?.isConnected) return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block, behavior: "instant" });
  return true;
}

export function restoreRecordTarget(
  origin: FocusTarget | null,
  list: FocusTarget | null,
) {
  if (!revealRecordTarget(origin, "center")) revealRecordTarget(list);
}

/** Preserve list state; move focus only after an explicit record-open action. */
export function useRecordDetails(
  select: (id: string) => void,
  stackedWidth = 1120,
) {
  const detailRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLHeadingElement>(null);
  const originRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  function openDetails(id: string, origin: HTMLElement) {
    select(id);
    originRef.current = origin;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    // The selected record commits before the next paint. Repeated selections
    // still navigate, and a second click cancels the first scheduled focus.
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (window.matchMedia(`(max-width: ${stackedWidth}px)`).matches)
        revealRecordTarget(detailRef.current);
    });
  }

  function backToList() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    restoreRecordTarget(originRef.current, listRef.current);
  }

  return { detailRef, listRef, openDetails, backToList };
}
