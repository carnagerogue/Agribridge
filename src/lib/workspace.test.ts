import { describe, expect, it } from "vitest";
import { agendaTasks, searchWorkspace } from "./workspace";
import type { Bootstrap, Task } from "../types";

const tasks = [
  {
    id: "old",
    title: "Scout beans",
    farmId: "beans",
    dueDate: "2026-10-09",
    status: "pending",
  },
  {
    id: "today",
    title: "Water maize",
    farmId: "maize",
    dueDate: "2026-10-10",
    status: "pending",
  },
  {
    id: "done",
    title: "Plant beans",
    farmId: "beans",
    dueDate: "2026-10-08",
    status: "completed",
  },
  {
    id: "future",
    title: "Harvest beans",
    farmId: "beans",
    dueDate: "2026-10-12",
    status: "pending",
  },
] as Task[];
describe("workspace agenda", () => {
  it("separates overdue, today and completed without losing general pending work", () => {
    expect(
      agendaTasks(tasks, "pending", "2026-10-10").map((t) => t.id),
    ).toEqual(["old", "today", "future"]);
    expect(
      agendaTasks(tasks, "overdue", "2026-10-10").map((t) => t.id),
    ).toEqual(["old"]);
    expect(agendaTasks(tasks, "today", "2026-10-10").map((t) => t.id)).toEqual([
      "today",
    ]);
    expect(
      agendaTasks(tasks, "completed", "2026-10-10").map((t) => t.id),
    ).toEqual(["done"]);
  });
  it("scopes every view to the selected farm and leaves source order unchanged", () => {
    expect(
      agendaTasks(tasks, "pending", "2026-10-10", "beans").map((t) => t.id),
    ).toEqual(["old", "future"]);
    expect(agendaTasks(tasks, "today", "2026-10-10", "beans")).toEqual([]);
    expect(tasks[0].id).toBe("old");
  });
  it("moves completed tasks out of all pending views", () => {
    const updated = tasks.map((t) =>
      t.id === "old" ? { ...t, status: "completed" as const } : t,
    );
    expect(agendaTasks(updated, "overdue", "2026-10-10")).toEqual([]);
  });
});
const data = {
  farms: [
    { id: "beans", name: "Home garden", crop: "Beans", district: "Nakaseke" },
  ],
  tasks,
} as Bootstrap;
describe("workspace search", () => {
  it("limits tool navigation by the current role", () => {
    expect(searchWorkspace(data, "farmer", "CRM")).toEqual([]);
    expect(searchWorkspace(data, "operator", "CRM")[0].to).toBe("/crm");
  });
  it("finds records by crop or title and links to exact records", () => {
    expect(searchWorkspace(data, "farmer", "  NAKASEKE  ")[0].to).toBe(
      "/farms?farm=beans",
    );
    expect(searchWorkspace(data, "farmer", "Scout")[0].to).toBe(
      "/farms?tasks=1&task=old",
    );
  });
  it("shows tools on empty query and gives an honest empty result", () => {
    expect(
      searchWorkspace(data, "farmer", "").every(
        (result) => result.kind === "Tool",
      ),
    ).toBe(true);
    expect(searchWorkspace(data, "farmer", "zzzzzz")).toEqual([]);
  });
});
