import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  Clock3,
  Leaf,
  Plus,
  Sprout,
  Users,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { Button, Notice, Skeleton } from "../components/ui";
import { date, dueLabel, label, number, today } from "../lib/format";
import { agendaTasks, type AgendaFilter } from "../lib/workspace";
import { FarmEditor, TaskEditor } from "./Farms";
import { HomeWeather } from "../components/HomeData";
import type { Task } from "../types";
import "../styles/home-journey.css";

const filters: { id: AgendaFilter; label: string }[] = [
  { id: "pending", label: "All pending" },
  { id: "today", label: "Today" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];
export default function Home() {
  const { user } = useApp();
  return <WorkspaceHome key={`${user?.organizationId}:${user?.id}`} />;
}
function WorkspaceHome() {
  const {
    data,
    user,
    queue,
    mutate,
    loading,
    lastSync,
    online,
    error: workspaceError,
    refresh,
  } = useApp();
  const [editor, setEditor] = useState<"farm" | "task" | null>(null);
  const [farmId, setFarmId] = useState("");
  const [filter, setFilter] = useState<AgendaFilter>("pending");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [day, setDay] = useState(today);
  useEffect(() => {
    const timer = window.setInterval(() => setDay(today()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const staff = user?.role === "admin" || user?.role === "operator";
  const selectedFarm = data.farms.find((farm) => farm.id === farmId);
  const weatherFarm = selectedFarm || data.farms[0];
  const pending = agendaTasks(data.tasks, "pending", day, farmId);
  const dueToday = agendaTasks(data.tasks, "today", day, farmId);
  const tasks = agendaTasks(data.tasks, filter, day, farmId);
  const farms = selectedFarm ? [selectedFarm] : data.farms;
  const seasons = data.seasons.filter(
    (season) =>
      season.status === "active" && (!farmId || season.farmId === farmId),
  );
  const collections = data.collections
    .filter((collection) =>
      ["planning", "confirmed"].includes(collection.status),
    )
    .sort((a, b) => a.collectionDate.localeCompare(b.collectionDate));
  const followUps = data.contacts.filter(
    (contact) => contact.stage === "follow_up",
  );
  const reports = data.reports.filter((report) => report.status !== "resolved");
  async function toggleTask(task: Task) {
    setBusy(task.id);
    setError("");
    try {
      await mutate(
        `/api/tasks/${task.id}`,
        "PATCH",
        {
          version: task.version,
          status: task.status === "completed" ? "pending" : "completed",
        },
        true,
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (loading || (!lastSync && !workspaceError)) return <Skeleton />;
  if (!lastSync || (staff && !online))
    return (
      <div className="workspace-panel agenda-empty">
        <Sprout size={30} />
        <h1>Let’s reconnect to your workspace.</h1>
        <p>
          {staff
            ? "Cooperative records need a connection. Reconnect to see your team's current workload."
            : "Your records could not be loaded. Reconnect and try again."}
        </p>
        <Button
          busy={refreshing}
          onClick={() => {
            setRefreshing(true);
            void refresh()
              .catch(() => {})
              .finally(() => setRefreshing(false));
          }}
        >
          Try again
        </Button>
        <Link className="text-link" to="/settings">
          Connection settings <ArrowRight size={16} />
        </Link>
      </div>
    );
  return (
    <div className="workspace-home">
      <header className="workspace-heading">
        <div>
          <span className="workspace-eyebrow">
            {staff ? "COOPERATIVE OVERVIEW" : "YOUR FARM WORKSPACE"}{" "}
            <span>· {date(day)}</span>
          </span>
          <h1>A good day to move forward.</h1>
          <p>
            Hello, {user?.name.split(" ")[0]}.{" "}
            {staff
              ? "Your farms, your team, your next step."
              : "A little planning. A better growing season."}
          </p>
        </div>
        <Button onClick={() => setEditor("task")}>
          <Plus size={18} /> Add task
        </Button>
      </header>
      {queue.length > 0 && (
        <Notice tone="warning">
          {queue.length} change{queue.length === 1 ? "" : "s"} saved on this
          device, awaiting server confirmation. New records appear after sync.{" "}
          <Link to="/settings">Review saved changes</Link>
        </Notice>
      )}
      <div className="workspace-scope">
        <span>
          <span className="live-dot" />
          {staff ? "Your cooperative at a glance" : "Your season at a glance"}
        </span>
        <label>
          <span>Farm</span>
          <select
            aria-label="Filter workspace by farm"
            value={farmId}
            onChange={(event) => setFarmId(event.target.value)}
          >
            <option value="">All farms</option>
            {data.farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="workspace-metrics" aria-label="Workspace summary">
        <Link to="/farms">
          <span className="metric-icon">
            <Sprout size={21} />
          </span>
          <span>
            <strong>{number(farms.length)}</strong>
            <small>{staff ? "Farms in view" : "Your farms"}</small>
          </span>
          <ArrowUpRight size={16} />
        </Link>
        <button onClick={() => setFilter("pending")}>
          <span className="metric-icon">
            <CheckCheck size={21} />
          </span>
          <span>
            <strong>{pending.length}</strong>
            <small>Open tasks</small>
          </span>
          <ArrowUpRight size={16} />
        </button>
        <button onClick={() => setFilter("today")}>
          <span className="metric-icon">
            <Clock3 size={21} />
          </span>
          <span>
            <strong>{dueToday.length}</strong>
            <small>Due today</small>
          </span>
          <ArrowUpRight size={16} />
        </button>
        <Link
          to={
            farmId ? `/seasons?farm=${encodeURIComponent(farmId)}` : "/seasons"
          }
        >
          <span className="metric-icon">
            <Leaf size={21} />
          </span>
          <span>
            <strong>{seasons.length}</strong>
            <small>Active seasons</small>
          </span>
          <ArrowUpRight size={16} />
        </Link>
      </div>
      {staff && (
        <section
          className="workspace-panel cooperative-priorities"
          aria-labelledby="team-title"
        >
          <div className="panel-heading">
            <div>
              <span className="workspace-eyebrow">
                ACROSS THE COOPERATIVE · ALL FARMS
              </span>
              <h2 id="team-title">
                <Users size={22} /> Team priorities
              </h2>
            </div>
            <Link className="text-link" to="/crm">
              Farmer relationships <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="priority-grid">
            <Link to="/harvest">
              <span className="priority-number">{collections.length}</span>
              <strong>Active collections</strong>
              <p>
                {collections[0]
                  ? `Next: ${collections[0].name} · ${date(collections[0].collectionDate)}`
                  : "Plan a collection and bring harvests together."}
              </p>
              <span className="text-link">
                Open harvest & collection <ArrowRight size={16} />
              </span>
            </Link>
            <Link to="/crm">
              <span className="priority-number">{followUps.length}</span>
              <strong>Farmer & contact follow-ups</strong>
              <p>
                Keep relationships moving with the people who need your
                attention.
              </p>
              <span className="text-link">
                Review contacts <ArrowRight size={16} />
              </span>
            </Link>
            <Link to="/community">
              <span className="priority-number">{reports.length}</span>
              <strong>Open community reports</strong>
              <p>Review crop concerns and help coordinate the next response.</p>
              <span className="text-link">
                Review reports <ArrowRight size={16} />
              </span>
            </Link>
          </div>
        </section>
      )}
      <div className="workspace-columns">
        <div className="workspace-primary">
          <section
            className="workspace-panel agenda-panel"
            aria-labelledby="agenda-title"
          >
            <div className="panel-heading">
              <div>
                <span className="workspace-eyebrow">ONE STEP AT A TIME</span>
                <h2 id="agenda-title">Today & upcoming</h2>
              </div>
              <Link className="text-link" to="/farms?tasks=1">
                All tasks <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="agenda-filters" aria-label="Filter tasks">
              {filters.map((item) => (
                <button
                  key={item.id}
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  <span>
                    {agendaTasks(data.tasks, item.id, day, farmId).length}
                  </span>
                </button>
              ))}
            </div>
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            <div className="agenda-list">
              {tasks.slice(0, 6).map((task) => {
                const waiting = queue.some(
                  (change) => change.path === `/api/tasks/${task.id}`,
                );
                const overdue =
                  task.status === "pending" && task.dueDate.slice(0, 10) < day;
                return (
                  <div className="agenda-row" key={task.id}>
                    <button
                      className={`task-check ${task.status === "completed" ? "is-complete" : ""}`}
                      aria-label={`${task.status === "completed" ? "Reopen" : "Complete"} ${task.title}`}
                      disabled={!!busy || waiting}
                      onClick={() => void toggleTask(task)}
                    >
                      {task.status === "completed" ? (
                        <Check size={16} />
                      ) : busy === task.id ? (
                        <span className="task-pulse" />
                      ) : null}
                    </button>
                    <Link
                      className="agenda-task"
                      to={`/farms?tasks=1&task=${encodeURIComponent(task.id)}`}
                    >
                      <strong>{task.title}</strong>
                      <small>
                        {data.farms.find((farm) => farm.id === task.farmId)
                          ?.name || "General task"}{" "}
                        <span>· {label(task.category)}</span>
                      </small>
                    </Link>
                    <span
                      className={`agenda-due ${overdue ? "is-overdue" : ""}`}
                    >
                      {waiting
                        ? "Awaiting sync"
                        : task.status === "completed"
                          ? "Completed"
                          : `${overdue ? "Overdue · " : ""}${dueLabel(task.dueDate)}`}
                    </span>
                  </div>
                );
              })}
              {!tasks.length && (
                <div className="agenda-empty">
                  <CheckCheck size={28} />
                  <h3>
                    {filter === "today"
                      ? "A clear day ahead."
                      : filter === "overdue"
                        ? "Nothing overdue."
                        : filter === "completed"
                          ? "Your progress starts here."
                          : "Ready for your next step."}
                  </h3>
                  <p>
                    {filter === "completed"
                      ? "Completed tasks will appear here."
                      : "Add a task to plan ahead, or check another view."}
                  </p>
                  <button
                    className="text-link"
                    onClick={() => setEditor("task")}
                  >
                    <Plus size={16} /> Plan a task
                  </button>
                </div>
              )}
            </div>
            {tasks.length > 6 && (
              <Link className="agenda-more" to="/farms?tasks=1">
                {tasks.length} tasks in this view · Open all tasks{" "}
                <ArrowRight size={16} />
              </Link>
            )}
          </section>
          <section className="workspace-panel" aria-labelledby="farms-title">
            <div className="panel-heading">
              <div>
                <span className="workspace-eyebrow">
                  ROOTED IN YOUR RECORDS
                </span>
                <h2 id="farms-title">
                  {staff ? "Farms in focus" : "Your farms"}
                </h2>
              </div>
              <button className="text-link" onClick={() => setEditor("farm")}>
                <Plus size={16} /> Add farm
              </button>
            </div>
            <div className="workspace-farms">
              {farms.slice(0, 4).map((farm) => (
                <Link
                  className="workspace-farm-row"
                  to={`/farms?farm=${encodeURIComponent(farm.id)}`}
                  key={farm.id}
                >
                  <span className="farm-symbol">
                    <Sprout size={24} />
                  </span>
                  <span>
                    <strong>{farm.name}</strong>
                    <small>
                      {farm.district} · {number(farm.areaAcres)} acres
                    </small>
                  </span>
                  <span className="farm-crop">
                    <strong>{farm.crop}</strong>
                    <small>{label(farm.stage)}</small>
                  </span>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
            </div>
            {!farms.length && (
              <div className="agenda-empty">
                <Sprout size={28} />
                <h3>Start with your first farm.</h3>
                <p>
                  Keep crop records, plan field work and track each season in
                  one place.
                </p>
                <Button onClick={() => setEditor("farm")}>
                  <Plus size={16} /> Add a farm
                </Button>
              </div>
            )}
            {farms.length > 4 && (
              <Link className="agenda-more" to="/farms">
                Explore all {farms.length} farms <ArrowRight size={16} />
              </Link>
            )}
          </section>
        </div>
        <aside className="workspace-rail" aria-label="Planning and conditions">
          <HomeWeather district={weatherFarm?.district} />
          <section className="season-callout">
            <span className="workspace-eyebrow">
              <CalendarDays size={17} /> SEASON PLANNER
            </span>
            <h2>Good harvests start with a plan.</h2>
            <p>Bring your crop calendar, costs and harvest goals together.</p>
            <Link
              className="button button-secondary"
              to={
                farmId
                  ? `/seasons?farm=${encodeURIComponent(farmId)}`
                  : "/seasons"
              }
            >
              Plan your season <ArrowRight size={16} />
            </Link>
            <div className="season-mini-path">
              <span>Prepare</span>
              <span>Grow</span>
              <span>Harvest</span>
              <span>Sell</span>
            </div>
          </section>
          <Link className="workspace-learning" to="/learn">
            <BookOpen size={23} />
            <span>
              <strong>Grow your knowledge</strong>
              <small>Practical guides for your next step</small>
            </span>
            <ArrowUpRight size={17} />
          </Link>
        </aside>
      </div>
      {editor === "farm" && <FarmEditor onClose={() => setEditor(null)} />}
      {editor === "task" && (
        <TaskEditor farmId={farmId} onClose={() => setEditor(null)} />
      )}
    </div>
  );
}
