import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  user: null as { id: string; role: string } | null,
  demo: true,
  online: true,
  demoLogin: vi.fn(),
}));
vi.mock("../context/AppContext", () => ({ useApp: () => context }));
import Landing from "./Landing";

function render() {
  return renderToStaticMarkup(h(MemoryRouter, null, h(Landing)));
}
beforeEach(() => {
  context.user = null;
  context.demo = true;
  context.online = true;
  context.demoLogin.mockReset();
});

describe("public landing markup", () => {
  it("has sample-only previews and real source/readiness disclosures", () => {
    const html = render();
    expect(html).toContain("A stronger season.");
    expect(html).toContain("One step at a time.");
    expect(html).toContain("Sample task");
    expect(html).not.toMatch(/\d+\s*°C/);
    expect(html).toContain("monthly reference observations, not live quotes");
    expect(html).toContain("There is no public WhatsApp number");
    expect(html).toContain('id="data-privacy"');
    expect(html).toContain("a larger screen is recommended");
    expect(context.demoLogin).not.toHaveBeenCalled();
  });
  it("uses four explicit stage buttons, an inline menu and responsive image assets", () => {
    const html = render();
    expect(html.match(/aria-pressed=/g)).toHaveLength(4);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-controls="landing-mobile-menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("agribridge-landscape-640.webp 640w");
    expect(html).toContain('width="1536"');
    expect(html).toContain('height="1024"');
  });
  it("does not offer role switching to an authenticated visitor", () => {
    context.user = { id: "current-user", role: "operator" };
    const html = render();
    expect(html).toContain("Open workspace");
    expect(html).not.toContain("Try farmer demo");
    expect(html).not.toContain("Try cooperative demo");
    expect(context.demoLogin).not.toHaveBeenCalled();
  });
  it("does not expose demo actions outside demo mode and disables them offline", () => {
    context.demo = false;
    expect(render()).not.toContain("Try farmer demo");
    context.demo = true;
    context.online = false;
    const html = render();
    expect(html).toContain("You’re offline");
    expect(html).toContain('disabled=""');
    expect(context.demoLogin).not.toHaveBeenCalled();
  });
});
