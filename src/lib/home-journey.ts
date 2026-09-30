import type { Task } from "../types";
export const seasonSteps = [
  { id: "prepare", label: "Prepare" },
  { id: "grow", label: "Grow" },
  { id: "harvest", label: "Harvest" },
  { id: "sell", label: "Sell" },
] as const;
export type SeasonStep = (typeof seasonSteps)[number]["id"];
/** Navigation aid, not an inferred completion or crop-health score. */
export function nextFarmTask(tasks: Task[], farmId?: string) {
  if (!farmId) return undefined;
  return tasks
    .filter(
      (task) =>
        task.farmId === farmId &&
        task.status === "pending" &&
        task.category !== "follow_up",
    )
    .sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
    )[0];
}
