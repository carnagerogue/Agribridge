import { describe, expect, it } from "vitest";
import { preferencePayload } from "./Settings";
import { defaultSettings, settingsSchema } from "../../server/schemas";
import { onlineNotes } from "./Farms";

describe("connection preferences", () => {
  it("sends only editable fields after bootstrap adds persisted entity metadata", () => {
    const saved = {
      ...defaultSettings,
      language: "en" as const,
      preferredChannel: "sms" as const,
      id: "persisted-settings",
      version: 2,
      createdAt: "2026-09-28T00:00:00.000Z",
      updatedAt: "2026-09-28T00:00:00.000Z",
    };
    const first = preferencePayload(saved, { preferredChannel: "whatsapp" });
    expect(settingsSchema.safeParse(first).success).toBe(true);
    expect(Object.keys(first).sort()).toEqual([
      "language",
      "lowDataMode",
      "notifications",
      "preferredChannel",
    ]);
    const refreshed = { ...saved, ...first, version: 3 };
    const second = preferencePayload(refreshed, { lowDataMode: false });
    expect(settingsSchema.safeParse(second).success).toBe(true);
    expect(second).toEqual({
      language: "en",
      lowDataMode: false,
      preferredChannel: "whatsapp",
      notifications: false,
    });
  });
});

describe("offline note protection", () => {
  it("omits missing cached notes and unchanged online notes instead of erasing server data", () => {
    expect(onlineNotes("", "", false)).toEqual({});
    expect(onlineNotes("", "Private existing note", false)).toEqual({});
    expect(
      onlineNotes("Private existing note", "Private existing note", true),
    ).toEqual({});
    expect(onlineNotes("", undefined, true)).toEqual({});
  });
  it("preserves explicit online note changes, including intentional deletion", () => {
    expect(onlineNotes("Updated", "Previous", true)).toEqual({
      notes: "Updated",
    });
    expect(onlineNotes("", "Previous", true)).toEqual({ notes: "" });
  });
});
