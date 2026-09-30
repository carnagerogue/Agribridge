import { describe, expect, it, vi } from "vitest";
import { createElement as h, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createPortal } from "react-dom";
import { Button, Modal, PageHeader, focusableElements, trapFocus } from "./ui";

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  createPortal: vi.fn((children: ReactNode) => children),
}));

function focusFixture(count = 3) {
  const document = { activeElement: null as unknown };
  const elements = Array.from({ length: count }, () => ({
    tabIndex: 0,
    closest: vi.fn(() => null as unknown),
    getClientRects: vi.fn(() => [{}]),
    focus: vi.fn(),
  }));
  const container = {
    querySelectorAll: vi.fn(() => elements),
    ownerDocument: document,
    focus: vi.fn(),
  };
  const key = (shiftKey = false, key = "Tab") =>
    ({ key, shiftKey, preventDefault: vi.fn() }) as unknown as KeyboardEvent;
  return {
    document,
    elements,
    container: container as unknown as HTMLElement,
    key,
  };
}

describe("shared dialog and navigation focus", () => {
  it("excludes hidden, inert and programmatic-only targets", () => {
    const { container, elements } = focusFixture(4);
    elements[1].tabIndex = -1;
    elements[2].closest.mockReturnValue({ inert: true });
    elements[3].getClientRects.mockReturnValue([]);
    expect(focusableElements(container)).toEqual([elements[0]]);
  });
  it("wraps forward from the last target and backward from the first", () => {
    const { container, elements, document, key } = focusFixture();
    document.activeElement = elements[2];
    const forward = key();
    trapFocus(forward, container);
    expect(elements[0].focus).toHaveBeenCalledOnce();
    expect(forward.preventDefault).toHaveBeenCalledOnce();
    document.activeElement = elements[0];
    const backward = key(true);
    trapFocus(backward, container);
    expect(elements[2].focus).toHaveBeenCalledOnce();
    expect(backward.preventDefault).toHaveBeenCalledOnce();
  });
  it("recovers escaped focus in the correct tab direction", () => {
    const { container, elements, key } = focusFixture();
    trapFocus(key(), container);
    expect(elements[0].focus).toHaveBeenCalledOnce();
    trapFocus(key(true), container);
    expect(elements[2].focus).toHaveBeenCalledOnce();
  });
  it("keeps focus on the dialog when every action is disabled or hidden", () => {
    const { container, key } = focusFixture(0);
    const event = key();
    trapFocus(event, container);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(container.focus).toHaveBeenCalledOnce();
  });
  it("preserves normal movement within the dialog and ignores other keys", () => {
    const { container, elements, document, key } = focusFixture();
    document.activeElement = elements[1];
    const tab = key();
    trapFocus(tab, container);
    expect(tab.preventDefault).not.toHaveBeenCalled();
    const escape = key(false, "Escape");
    trapFocus(escape, container);
    expect(escape.preventDefault).not.toHaveBeenCalled();
  });
});

describe("shared responsive component semantics", () => {
  it("targets document.body for the client dialog instead of its query container", () => {
    const body = {};
    vi.stubGlobal("document", { body });
    try {
      const html = renderToStaticMarkup(
        h(Modal, {
          title: "Client dialog",
          onClose: () => {},
          children: "Form remains inside the dialog provider",
        }),
      );
      expect(createPortal).toHaveBeenLastCalledWith(expect.anything(), body);
      expect(html).toContain("Form remains inside the dialog provider");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("keeps a labeled page action in its own flexible wrapper", () => {
    const html = renderToStaticMarkup(
      h(PageHeader, {
        title: "Markets",
        description: "Compare the same unit.",
        action: h(Button, { children: "Record a local price" }),
      }),
    );
    expect(html).toContain('class="page-heading-copy"');
    expect(html).toContain('class="page-heading-actions"');
    expect(html).toContain("Record a local price</button>");
  });
  it("gives simultaneous dialogs distinct accessible title and description IDs", () => {
    const html = renderToStaticMarkup(
      h(
        Fragment,
        null,
        h(Modal, {
          title: "First",
          description: "First details",
          onClose: () => {},
          children: "One",
        }),
        h(Modal, {
          title: "Second",
          description: "Second details",
          onClose: () => {},
          children: "Two",
        }),
      ),
    );
    const titleIds = Array.from(
      html.matchAll(/aria-labelledby="([^"]+)"/g),
      (match) => match[1],
    );
    const descriptionIds = Array.from(
      html.matchAll(/aria-describedby="([^"]+)"/g),
      (match) => match[1],
    );
    expect(new Set([...titleIds, ...descriptionIds]).size).toBe(4);
    for (const id of [...titleIds, ...descriptionIds])
      expect(html).toContain(`id="${id}"`);
  });
  it("disables a busy action without replacing its visible label", () => {
    const html = renderToStaticMarkup(
      h(Button, { busy: true, children: "Save changes" }),
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain("Save changes</button>");
  });
});
