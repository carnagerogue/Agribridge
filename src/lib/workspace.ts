import type { Bootstrap, Role, Task } from "../types";
import { navigationFor } from "./navigation";

export type AgendaFilter = "pending" | "today" | "overdue" | "completed";
export function agendaTasks(
  tasks: Task[],
  filter: AgendaFilter,
  day: string,
  farmId = "",
) {
  return tasks
    .filter((task) => {
      if (farmId && task.farmId !== farmId) return false;
      if (filter === "completed") return task.status === "completed";
      if (task.status !== "pending") return false;
      if (filter === "today") return task.dueDate.slice(0, 10) === day;
      if (filter === "overdue")
        return !!task.dueDate && task.dueDate.slice(0, 10) < day;
      return true;
    })
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title),
    );
}

export type WorkspaceResult = {
  key: string;
  title: string;
  detail: string;
  to: string;
  kind: string;
};
export function searchWorkspace(
  data: Bootstrap,
  role: Role | undefined,
  query: string,
): WorkspaceResult[] {
  const navigation = navigationFor(role);
  const pages = [
    ...navigation.core,
    ...navigation.more,
    ...navigation.cooperative,
  ].map((item) => ({
    key: item.to,
    title: item.label,
    detail: "Open workspace tool",
    to: item.to,
    kind: "Tool",
  }));
  const term = query.trim().toLocaleLowerCase();
  if (!term) return pages;
  const results = [
    ...pages,
    ...data.farms.map((farm) => ({
      key: `farm:${farm.id}`,
      title: farm.name,
      detail: `${farm.crop} · ${farm.district}`,
      to: `/farms?farm=${encodeURIComponent(farm.id)}`,
      kind: "Farm",
    })),
    ...data.tasks.map((task) => ({
      key: `task:${task.id}`,
      title: task.title,
      detail: `${task.status} · ${data.farms.find((farm) => farm.id === task.farmId)?.name || "General task"}`,
      to: `/farms?tasks=1&task=${encodeURIComponent(task.id)}`,
      kind: "Task",
    })),
  ];
  return results
    .filter((result) => {
      const text =
        `${result.title} ${result.detail} ${result.kind}`.toLocaleLowerCase();
      return term.split(/\s+/).every((word) => text.includes(word));
    })
    .slice(0, 30);
}
