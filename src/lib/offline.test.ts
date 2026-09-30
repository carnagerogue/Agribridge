import { describe, expect, it } from "vitest";
import {
  blocksRecordMutation,
  deliveryOutcome,
  enqueueMutation,
  mutationPreview,
  retryDelay,
  retryUnchanged,
  validateOfflineMutation,
  type QueuedMutation,
} from "./offline";

const change: QueuedMutation = {
  scope: "tenant:user",
  path: "/api/tasks/task",
  method: "PATCH",
  body: { version: 2, status: "completed" },
  idempotencyKey: "same-key",
  sequence: 4,
  status: "failed",
  attempts: 8,
  retryable: true,
  createdAt: "2026-09-28T08:00:00Z",
  updatedAt: "2026-09-28T08:00:00Z",
  nextAttemptAt: null,
};

describe("offline delivery safety", () => {
  it("never queues account, staff, messaging, or assistant requests", async () => {
    for (const path of [
      "/api/auth/logout",
      "/api/admin/users",
      "/api/messages",
      "/api/channels/ussd",
      "/api/assistant",
      "/api/assistant/chat",
    ]) {
      await expect(
        enqueueMutation("tenant:user", {
          path,
          method: "POST",
          body: { text: "private" },
          idempotencyKey: "test",
        }),
      ).rejects.toThrow("cannot be saved for offline delivery");
    }
  });
  it("stops retrying validation/auth failures and requires conflict review", () => {
    expect(deliveryOutcome(409)).toBe("conflict");
    for (const status of [400, 401, 403, 404, 405, 413, 422])
      expect(deliveryOutcome(status)).toBe("failed");
    expect(deliveryOutcome(302)).toBe("failed");
  });

  it("retains transient failures and recognizes successful delivery", () => {
    for (const status of [0, 408, 425, 429, 500, 502, 503, 504])
      expect(deliveryOutcome(status)).toBe("retry");
    for (const status of [200, 201, 204])
      expect(deliveryOutcome(status)).toBe("success");
  });

  it("honors server retry windows and caps excessive retry-after values", () => {
    const now = Date.parse("2026-09-28T08:00:00.000Z");
    expect(retryDelay(1, "120", now)).toBe(120_000);
    expect(retryDelay(1, "Mon, 28 Sep 2026 08:02:00 GMT", now)).toBe(120_000);
    expect(retryDelay(1, "9999999999999", now)).toBe(86_400_000);
    expect(retryDelay(1, "invalid", now)).toBe(5_000);
    expect(retryDelay(1, "-20", now)).toBe(5_000);
  });

  it("increases network backoff without busy loops or unbounded delays", () => {
    expect(retryDelay(1)).toBe(5_000);
    expect(retryDelay(2)).toBe(10_000);
    expect(retryDelay(3)).toBe(20_000);
    expect(retryDelay(30)).toBe(1_800_000);
  });

  it("rejects private notes, unknown fields, and support follow-ups before touching browser storage", () => {
    for (const body of [
      { notes: "" },
      { notes: "Private detail" },
      { phone: "+256700123456" },
      { category: "follow_up" },
    ]) {
      expect(() => validateOfflineMutation({ ...change, body })).toThrow();
    }
    expect(() => validateOfflineMutation(change)).not.toThrow();
    expect(() =>
      validateOfflineMutation({ ...change, path: "/api/reports" }),
    ).toThrow();
  });

  it("blocks a second record edit but permits distinct records and independent creations", () => {
    expect(blocksRecordMutation(change, change)).toBe(true);
    expect(
      blocksRecordMutation(change, { ...change, path: "/api/tasks/another" }),
    ).toBe(false);
    expect(
      blocksRecordMutation(
        { path: "/api/farms", method: "POST" },
        { path: "/api/farms", method: "POST" },
      ),
    ).toBe(false);
  });

  it("resumes only transient failures with exactly the same key, body and FIFO sequence", () => {
    const next = retryUnchanged(change);
    expect(next.status).toBe("pending");
    expect(next.attempts).toBe(0);
    expect(next.body).toBe(change.body);
    expect(next.idempotencyKey).toBe(change.idempotencyKey);
    expect(next.sequence).toBe(change.sequence);
    expect(() => retryUnchanged({ ...change, status: "conflict" })).toThrow();
    expect(() => retryUnchanged({ ...change, retryable: false })).toThrow();
  });

  it("shows recovery fields without exposing private notes, owners or coordinates", () => {
    expect(
      mutationPreview({
        ...change,
        body: {
          title: "Check maize",
          status: "completed",
          notes: "Private note",
          ownerName: "Name",
          latitude: 1,
          longitude: 32,
        },
      }),
    ).toEqual([
      ["Task", "Check maize"],
      ["Status", "completed"],
    ]);
  });
});
