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
import LandingWhatsApp from "../components/LandingWhatsApp";

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
    expect(html).toContain("Good harvests.");
    expect(html).toContain("Meet good buyers.");
    expect(html).toContain("This is a sample, not live farm data.");
    expect(html).not.toMatch(/\d+\s*°C/);
    expect(html).toContain("monthly reference observations, not live quotes");
    expect(html).toContain("does not provide an active support number");
    expect(html).toContain('id="data-privacy"');
    expect(context.demoLogin).not.toHaveBeenCalled();
  });
  it("gives purchasing clients and farmers clear marketplace and conversation routes", () => {
    const html = render();
    expect(html).toContain('href="/buy"');
    expect(html).toContain("Buy produce");
    expect(html).toContain("Sell produce");
    expect(html).toContain('href="/whatsapp-demo?audience=farmer"');
    expect(html).toContain("Illustrative listings · not live inventory");
    expect(html).toContain("Seller accepts the terms");
    expect(html).toContain("For farmers &amp; cooperatives");
    expect(html).toContain("Farmer workspace");
    expect(html).toContain(
      'role="tablist" aria-label="Choose a WhatsApp experience"',
    );
    expect(html).toContain("I’m a buyer");
    expect(html).toContain("I’m a farmer");
  });
  it("shows a distinct buyer procurement conversation with truthful preview status", () => {
    const html = renderToStaticMarkup(
      h(MemoryRouter, null, h(LandingWhatsApp, { initialAudience: "buyer" })),
    );
    expect(html).toContain("buying 1,000 kg of white maize");
    expect(html).toContain("Source your produce");
    expect(html).toContain("Sample supply match");
    expect(html).toContain("not a live supplier offer");
    expect(html).toContain('href="/whatsapp-demo?audience=buyer"');
    expect(html).toContain('href="/buy"');
    expect(html.match(/class="lwh-bubble /g)).toHaveLength(3);
    expect(html).toContain("Mock preview · no messages sent");
  });
  it("uses four explicit stage buttons, an inline menu and responsive image assets", () => {
    const html = render();
    expect(
      html.match(/id="landing-stage-(prepare|grow|harvest|sell)"/g),
    ).toHaveLength(4);
    expect(html).toMatch(/id="landing-stage-grow"[^>]*aria-pressed="true"/);
    expect(html).toContain("Pause animations");
    expect(html).toContain('aria-controls="landing-mobile-menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("agribridge-fields-640.webp 640w");
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
