import { describe, expect, it } from "vitest";
import {
  LOCAL_ACCESS_LOCK,
  LOCAL_LOGOUT_LOCK,
  applyQueuedUpdates,
  locallySignedOut,
  persistAccessLock,
  persistLocalLogout,
  safeData,
} from "./AppContext";
import type { Bootstrap, User } from "../types";
import type { QueuedMutation } from "../lib/offline";

const farmer: User = {
  id: "user",
  organizationId: "tenant",
  name: "Farmer",
  organizationName: "Farm group",
  role: "farmer",
};
const base = {
  id: "record",
  version: 1,
  createdAt: "2026-09-28T00:00:00Z",
  updatedAt: "2026-09-28T00:00:00Z",
};
const privateData = {
  farms: [
    {
      ...base,
      name: "North",
      district: "Mbale",
      latitude: 1.08,
      longitude: 34.18,
      areaAcres: 2,
      crop: "maize",
      plantedAt: "",
      ownerName: "Farmer",
      stage: "planning",
      notes: "Private caller phone",
      secret: "unknown farm field",
    },
  ],
  tasks: ["general", "scouting", "planting", "follow_up", "support"].map(
    (category) => ({
      ...base,
      id: category,
      farmId: "record",
      title: "Field work",
      dueDate: "",
      category,
      status: "pending",
      notes: "Callback +256700123456",
    }),
  ),
  contacts: [{ name: "Private contact" }],
  offers: [{ private: true }],
  deals: [{ private: true }],
  reports: [{ private: true }],
  messages: [{ body: "private message" }],
  marketPrices: [
    {
      ...base,
      crop: "maize",
      market: "Mbale",
      district: "Mbale",
      priceUgx: 1000,
      unit: "kg",
      observedAt: "",
      source: "Reported",
      status: "reported",
      callerPhone: "private",
    },
  ],
  lessons: [
    {
      id: "lesson",
      crop: "maize",
      title: "Lesson",
      summary: "Summary",
      durationMinutes: 5,
      level: "beginner",
      sections: [{ heading: "Step", body: "Content", hidden: "private" }],
      quiz: { question: "Question", options: ["A", "B"], answerIndex: 1 },
      sourceTitle: "MAAIF",
      sourceUrl: "https://www.agriculture.go.ug/",
      reviewStatus: "reviewed",
      private: true,
    },
  ],
  progress: [
    {
      id: "progress",
      lessonId: "lesson",
      completed: true,
      score: 1,
      private: true,
    },
  ],
  settings: {
    language: "en",
    lowDataMode: true,
    preferredChannel: "sms",
    notifications: false,
    private: true,
  },
  csrfToken: "must never persist",
  privateExtra: "never persist",
} as unknown as Bootstrap;

describe("offline snapshot privacy", () => {
  it("retains farmer field essentials, learning and freshness without private free text", () => {
    const result = safeData(privateData, farmer);
    expect(result.farms).toHaveLength(1);
    expect(result.farms[0].notes).toBe("");
    expect(result.tasks.map((task) => task.category)).toEqual([
      "general",
      "scouting",
      "planting",
    ]);
    expect(result.tasks.every((task) => task.notes === "")).toBe(true);
    expect(result.lessons[0].title).toBe("Lesson");
    expect(result.lessons[0].quiz).toEqual({
      question: "Question",
      options: ["A", "B"],
    });
    expect(result.marketPrices).toHaveLength(1);
    expect(result.progress).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(
      /private|secret|Callback|csrfToken|callerPhone|unknown farm field/i,
    );
    expect(
      result.contacts.concat(
        result.offers as never[],
        result.deals as never[],
        result.reports as never[],
        result.messages as never[],
      ),
    ).toEqual([]);
  });

  it.each(["operator", "admin"] as const)(
    "excludes organization-wide operational records for %s",
    (role) => {
      const result = safeData(privateData, { ...farmer, role });
      expect(result.farms).toEqual([]);
      expect(result.tasks).toEqual([]);
      expect(result.lessons).toHaveLength(1);
      expect(result.contacts).toEqual([]);
      expect(result.messages).toEqual([]);
    },
  );
});

describe("local logout lock", () => {
  it("locks cached access independently of destructive logout", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    persistAccessLock(storage);
    expect(values.get(LOCAL_ACCESS_LOCK)).toBe("true");
    expect(values.has(LOCAL_LOGOUT_LOCK)).toBe(false);
    expect(locallySignedOut(storage)).toBe(true);
  });
  it("persists logout across reloads until explicit sign-in removes the flag", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    expect(locallySignedOut(storage)).toBe(false);
    persistLocalLogout(storage);
    expect(values.get(LOCAL_LOGOUT_LOCK)).toBe("true");
    expect(locallySignedOut(storage)).toBe(true);
    values.delete(LOCAL_LOGOUT_LOCK);
    expect(locallySignedOut(storage)).toBe(false);
  });

  it("fails closed when browser cannot read the local lock", () => {
    expect(
      locallySignedOut({
        getItem() {
          throw new Error("storage disabled");
        },
      }),
    ).toBe(true);
    expect(() =>
      persistLocalLogout({
        setItem() {
          throw new Error("storage disabled");
        },
      }),
    ).toThrow("storage disabled");
  });
});

describe("pending field display", () => {
  const queued = {
    scope: "tenant:user",
    path: "/api/farms/record",
    method: "PATCH",
    body: {
      version: 1,
      name: "Updated farm",
      notes: "Never display",
      ownerName: "Never replace",
    },
    idempotencyKey: "key",
    sequence: 1,
    status: "pending",
    attempts: 0,
    createdAt: "",
    updatedAt: "",
    nextAttemptAt: null,
  } as QueuedMutation;
  it("shows local edits without mutating snapshots, private fields or server versions", () => {
    const result = applyQueuedUpdates(privateData, [queued]);
    expect(result.farms[0].name).toBe("Updated farm");
    expect(result.farms[0].notes).toBe(privateData.farms[0].notes);
    expect(result.farms[0].ownerName).toBe(privateData.farms[0].ownerName);
    expect(result.farms[0].version).toBe(1);
    expect(privateData.farms[0].name).toBe("North");
  });
  it("does not overlay conflicts, newer server records, or manufacture new farm IDs", () => {
    expect(
      applyQueuedUpdates(privateData, [{ ...queued, status: "conflict" }])
        .farms[0].name,
    ).toBe("North");
    expect(
      applyQueuedUpdates(privateData, [
        { ...queued, body: { version: 0, name: "Old" } },
      ]).farms[0].name,
    ).toBe("North");
    expect(
      applyQueuedUpdates(privateData, [
        { ...queued, method: "POST", path: "/api/farms" },
      ]).farms,
    ).toHaveLength(1);
  });
});
