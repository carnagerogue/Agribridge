import { describe, expect, it } from "vitest";
import { compareTasks, findLinkedTask } from "./Farms";
import type { Task } from "../types";

describe("farm task priority", () => {
  it("places pending work first, earliest due first, with stable title ordering", () => {
    const tasks = [
      { id: "done", title: "Done", status: "completed", dueDate: "2026-01-01" },
      { id: "later", title: "Later", status: "pending", dueDate: "2026-10-10" },
      {
        id: "today-b",
        title: "Water",
        status: "pending",
        dueDate: "2026-10-01",
      },
      {
        id: "overdue",
        title: "Overdue",
        status: "pending",
        dueDate: "2026-09-29",
      },
      {
        id: "today-a",
        title: "Scout",
        status: "pending",
        dueDate: "2026-10-01",
      },
    ] as Task[];
    expect([...tasks].sort(compareTasks).map((task) => task.id)).toEqual([
      "overdue",
      "today-a",
      "today-b",
      "later",
      "done",
    ]);
    expect(tasks[0].id).toBe("done");
  });
});

describe("Home task links", () => {
  const tasks = [
    { id: "task-1", title: "Check the field" },
    { id: "task-10", title: "Record planting" },
  ] as Task[];

  it("selects the exact loaded task without filtering or changing the list", () => {
    expect(findLinkedTask(tasks, "task-1")).toBe(tasks[0]);
    expect(findLinkedTask(tasks, "task-10")).toBe(tasks[1]);
    expect(tasks.map((task) => task.id)).toEqual(["task-1", "task-10"]);
  });

  it("never substitutes another task for a missing, partial, or malformed ID", () => {
    for (const id of [
      null,
      "",
      "task",
      "TASK-1",
      "task-1 ",
      "missing",
      '[id="task-1"]',
    ]) {
      expect(findLinkedTask(tasks, id)).toBeUndefined();
    }
    expect(findLinkedTask([], "task-1")).toBeUndefined();
  });
});
