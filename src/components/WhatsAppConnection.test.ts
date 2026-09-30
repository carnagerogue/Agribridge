import { describe, expect, it } from "vitest";
import {
  whatsappChatLink,
  type WhatsAppConnectionState,
} from "./WhatsAppConnection";

const configured: WhatsAppConnectionState = {
  status: "configured",
  businessNumber: "+256700000000",
  chatUrl: "https://wa.me/256700000000",
  checklist: [],
  detail: "Setup only, not verified delivery.",
};
describe("WhatsApp farmer connection", () => {
  it("only opens the exact configured business number without prefilled personal data", () => {
    expect(whatsappChatLink(configured)).toBe("https://wa.me/256700000000");
    for (const chatUrl of [
      "https://example.com",
      "javascript:alert(1)",
      "https://wa.me/256700000001",
      "https://wa.me/256700000000?text=private",
      "https://wa.me.evil.test/256700000000",
    ])
      expect(whatsappChatLink({ ...configured, chatUrl })).toBeNull();
  });
  it("never presents demo or incomplete setup as a live number", () => {
    expect(whatsappChatLink({ ...configured, status: "demo" })).toBeNull();
    expect(
      whatsappChatLink({ ...configured, status: "not_configured" }),
    ).toBeNull();
    expect(
      whatsappChatLink({ ...configured, businessNumber: null }),
    ).toBeNull();
    expect(
      whatsappChatLink({ ...configured, businessNumber: "256700000000" }),
    ).toBeNull();
  });
});
