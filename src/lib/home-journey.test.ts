import { describe, it, expect } from "vitest";
import { nextFarmTask, seasonSteps } from "./home-journey";
import type { Task } from "../types";
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  version: 1,
  createdAt: "",
  updatedAt: "",
  farmId: "farm-a",
  title: id,
  dueDate: "2026-09-29",
  category: "scouting",
  status: "pending",
  notes: "",
  ...extra,
});
describe("Farmer season guide", () => {
  it("has four navigation stages, without inferred completion", () => {
    expect(seasonSteps.map((step) => step.id)).toEqual([
      "prepare",
      "grow",
      "harvest",
      "sell",
    ]);
  });
  it("uses only the selected farm's pending field tasks", () => {
    expect(
      nextFarmTask(
        [
          task("other", { farmId: "farm-b" }),
          task("complete", { status: "completed" }),
          task("crm", { category: "follow_up" }),
          task("field"),
        ],
        "farm-a",
      )?.id,
    ).toBe("field");
  });
  it("selects the earliest task without mutating source records", () => {
    const tasks = [
      task("later", { dueDate: "2026-10-02" }),
      task("soon", { dueDate: "2026-09-30" }),
    ];
    expect(nextFarmTask(tasks, "farm-a")?.id).toBe("soon");
    expect(tasks[0].id).toBe("later");
  });
  it("does not substitute a cooperative-wide task when a farm is absent", () => {
    expect(nextFarmTask([task("field")])).toBeUndefined();
    expect(nextFarmTask([task("field")], "missing")).toBeUndefined();
  });
});
