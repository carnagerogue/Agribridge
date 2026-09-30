import { describe, expect, it } from "vitest";
import {
  inboxConnectionFailure,
  privateStateAfterReadFailure,
  duplicatesAcceptedReply,
  prepareReplyAttempt,
  replyAvailability,
  replyNeedsConfirmation,
  replyStatusDetail,
  type InboxReply,
  type WhatsAppInboxItem,
} from "./WhatsAppInbox";
import { ApiError } from "../lib/api";

const now = Date.parse("2026-09-29T09:00:00Z");
const incoming: WhatsAppInboxItem = {
  id: "incoming",
  from: "+256700000000",
  body: "How do I prepare a maize record?",
  contentType: "text",
  command: "message",
  occurredAt: "2026-09-29T08:00:00Z",
  receivedAt: "2026-09-29T08:00:01Z",
  contact: null,
  replyWindowExpiresAt: "2026-09-30T08:00:00Z",
  canReply: true,
  replyBlockedReason: null,
  replies: [],
  sample: false,
};
const sent: InboxReply = {
  id: "reply",
  body: "Keep a dated record.",
  createdAt: "2026-09-29T08:30:00Z",
  status: "sent",
  deliveryUncertain: false,
  error: null,
  sample: false,
};

describe("WhatsApp support reply controls", () => {
  it("recognises API unreachability even when the browser still reports online", () => {
    expect(inboxConnectionFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(
      inboxConnectionFailure(new DOMException("Timed out", "TimeoutError")),
    ).toBe(true);
    expect(
      inboxConnectionFailure(new ApiError(503, "UNAVAILABLE", "Unavailable")),
    ).toBe(true);
    expect(
      inboxConnectionFailure(
        new ApiError(400, "INVALID_CURSOR", "Invalid cursor"),
      ),
    ).toBe(false);
  });

  it("clears read data and drafts while retaining only the unchanged unresolved request in memory", () => {
    const original = {
      ...prepareReplyAttempt(
        incoming,
        "Pending original reply",
        undefined,
        now,
      ),
      state: "unknown" as const,
    };
    const resolved = {
      ...original,
      inboxId: "resolved",
      state: "resolved" as const,
      body: "Old private reply",
      reply: sent,
    };
    const result = privateStateAfterReadFailure({
      incoming: original,
      resolved,
    });
    expect(result.page.items).toEqual([]);
    expect(result.page.nextCursor).toBeNull();
    expect(result.drafts).toEqual({});
    expect(Object.keys(result.attempts)).toEqual(["incoming"]);
    expect(result.attempts.incoming).toBe(original);
    expect(result.attempts.incoming.key).toBe(original.key);
    expect(result.attempts.incoming.body).toBe(original.body);
    expect(JSON.stringify(result)).not.toContain("Old private reply");
  });

  it("allows requested support without requiring the sender to be a CRM contact", () => {
    expect(replyAvailability(incoming, now).allowed).toBe(true);
    const attempt = prepareReplyAttempt(
      incoming,
      "  Keep a dated record.  ",
      undefined,
      now,
    );
    expect(attempt.body).toBe("Keep a dated record.");
    expect(attempt.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(attempt.inboxId).toBe(incoming.id);
  });

  it.each([
    { sample: true },
    { command: "stop" as const },
    { canReply: false },
    { replyBlockedReason: "not_configured" as const },
    { replyBlockedReason: "stopped" as const },
    { replyBlockedReason: "expired" as const },
    { replyWindowExpiresAt: null },
    { replyBlockedReason: "reply_unresolved" as const },
    { replyWindowExpiresAt: "2026-09-29T09:00:00Z" },
    { replyWindowExpiresAt: "invalid" },
  ])(
    "fails closed on blocked, sample, expired, or unknown-window conversations: %j",
    (changes) => {
      const item = { ...incoming, ...changes };
      expect(replyAvailability(item, now).allowed).toBe(false);
      expect(() =>
        prepareReplyAttempt(item, "Reply", undefined, now),
      ).toThrow();
    },
  );

  it("does not call expired retained text a readable question or fetch unsupported media", () => {
    expect(replyAvailability({ ...incoming, body: null }, now).allowed).toBe(
      false,
    );
    expect(
      replyAvailability(
        { ...incoming, contentType: "unsupported", body: null },
        now,
      ).allowed,
    ).toBe(true);
  });

  it("keeps ambiguous recovery tied to the original text/key even after the window expires", () => {
    const original = {
      ...prepareReplyAttempt(incoming, "Original reply", undefined, now),
      state: "unknown" as const,
    };
    const recovery = prepareReplyAttempt(
      { ...incoming, canReply: false },
      "Changed text must not be sent",
      original,
      now + 48 * 60 * 60 * 1000,
    );
    expect(recovery.key).toBe(original.key);
    expect(recovery.body).toBe(original.body);
    expect(recovery.inboxId).toBe(original.inboxId);
    expect(() =>
      prepareReplyAttempt(
        { ...incoming, id: "another" },
        "Reply",
        original,
        now,
      ),
    ).toThrow();
    expect(() => prepareReplyAttempt(incoming, "Reply", recovery, now)).toThrow(
      "already being checked",
    );
  });

  it("blocks fresh sends while previous delivery is ambiguous and never describes sent as delivered", () => {
    const uncertain = {
      ...sent,
      status: "failed" as const,
      deliveryUncertain: true,
    };
    expect(replyNeedsConfirmation(uncertain)).toBe(true);
    expect(
      replyAvailability({ ...incoming, replies: [uncertain] }, now).allowed,
    ).toBe(false);
    expect(replyStatusDetail(sent)).toContain("not yet confirmed");
    expect(replyStatusDetail(uncertain)).toContain("do not resend");
    expect(replyNeedsConfirmation({ ...uncertain, status: "delivered" })).toBe(
      false,
    );
  });

  it("rejects duplicate accepted text, blank and overlong replies", () => {
    const answered = { ...incoming, replies: [sent] };
    expect(duplicatesAcceptedReply(answered, " Keep a dated record. ")).toBe(
      true,
    );
    expect(() =>
      prepareReplyAttempt(answered, "Keep a dated record.", undefined, now),
    ).toThrow("same reply");
    expect(() => prepareReplyAttempt(incoming, " ", undefined, now)).toThrow();
    expect(() =>
      prepareReplyAttempt(incoming, "x".repeat(1601), undefined, now),
    ).toThrow();
    expect(
      duplicatesAcceptedReply(
        { ...incoming, replies: [{ ...sent, status: "failed" }] },
        sent.body!,
      ),
    ).toBe(false);
  });
});
