import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Leaf,
  Plus,
  Sprout,
  Store,
  Sun,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { Button, Notice } from "../components/ui";
import { dueLabel, today } from "../lib/format";
import {
  nextFarmTask,
  seasonSteps,
  type SeasonStep,
} from "../lib/home-journey";
import { FarmEditor } from "./Farms";
import { HomeWeather } from "../components/HomeData";
import "../styles/home-journey.css";

const stepIcons = { prepare: Sprout, grow: Leaf, harvest: Sun, sell: Store };

export default function Home() {
  const { user } = useApp();
  return <FarmerHome key={`${user?.organizationId}:${user?.id}`} />;
}

function FarmerHome() {
  const { data, user, queue } = useApp();
  const [adding, setAdding] = useState(false);
  const [farmId, setFarmId] = useState("");
  const [chosenStep, setChosenStep] = useState<SeasonStep | null>(null);
  const farm = data.farms.find((item) => item.id === farmId) ?? data.farms[0];
  const step = chosenStep ?? (farm ? "grow" : "prepare");
  const task = nextFarmTask(data.tasks, farm?.id);
  const staff = user?.role !== "farmer";
  const overdue = task && task.dueDate.slice(0, 10) < today();
  const guide = {
    prepare: {
      title: farm
        ? "Give your season a good start."
        : "Start with your first farm.",
      body: farm
        ? "Plan your planting dates, costs and expected harvest. Keep your plan close as the season changes."
        : "Add a plot and its district. Then bring its tasks, forecast and learning together.",
      action: farm ? "Plan a season" : "Add a farm",
      route: "/seasons",
      learning: "/learn?topic=soil-water",
      learningLabel: "Learn about soil & water",
    },
    grow: {
      title: "Look after your crops.",
      body: task
        ? task.title
        : farm
          ? "No pending field tasks for this farm. Record the next thing you want to check or get done."
          : "Add a farm to keep its crop records and everyday tasks together.",
      action: task ? "Open task" : farm ? "Plan a farm task" : "Add a farm",
      route: task
        ? `/farms?tasks=1&task=${encodeURIComponent(task.id)}`
        : "/farms?tasks=1",
      learning: "/learn?topic=protect-crops",
      learningLabel: "Learn about protecting crops",
    },
    harvest: {
      title: "Make every harvest count.",
      body: "Record what you harvest, keep quality checks together and plan your collection. A clear record follows your produce.",
      action: "Open harvest records",
      route: "/harvest",
      learning: "/learn?topic=harvest-storage",
      learningLabel: "Learn about harvest & storage",
    },
    sell: {
      title: "Know more before you sell.",
      body: "Compare published prices by crop and market. Check the date, unit and price type before speaking with a buyer.",
      action: "Check prices",
      route: "/markets",
      learning: "/markets",
      learningLabel: "Monthly reference prices, not live buyer offers",
    },
  }[step];
  const Icon = stepIcons[step];
  return (
    <div className="farmer-home">
      <header className="journey-greeting">
        <h1>Hello, {user?.name.trim().split(/\s+/)[0] || "farmer"}.</h1>
        <p>Let’s grow a better season.</p>
      </header>
      {queue.length > 0 && (
        <Notice tone="warning">
          {queue.length} change{queue.length === 1 ? "" : "s"} saved on this
          device, awaiting confirmation.{" "}
          <Link to="/settings">Review and sync</Link>
        </Notice>
      )}
      {data.farms.length > 1 ? (
        <label className="journey-farm-selector">
          <span>{staff ? "Cooperative farm" : "Your farm"}</span>
          <select
            value={farm?.id ?? ""}
            onChange={(event) => setFarmId(event.target.value)}
          >
            {data.farms.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} · {item.district}
                {staff ? ` · ${item.ownerName}` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : farm ? (
        <p className="journey-farm-name">
          <Sprout size={16} aria-hidden="true" />
          {farm.name} · {farm.district}
          {staff ? ` · ${farm.ownerName}` : ""}
        </p>
      ) : null}
      <HomeWeather district={farm?.district} />
      <section className="season-journey" aria-labelledby="journey-title">
        <div className="journey-heading">
          <h2 id="journey-title">Your season, step by step.</h2>
          <p>Choose where you want to start.</p>
        </div>
        <div
          className="season-stops"
          role="group"
          aria-label="Choose a part of your season"
        >
          {seasonSteps.map((item, index) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={step === item.id}
              aria-controls="season-guide"
              onClick={() => setChosenStep(item.id)}
            >
              <span className="season-stop-number" aria-hidden="true">
                {index + 1}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div
          className="season-guide"
          id="season-guide"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="season-guide-title">
            <Icon size={24} strokeWidth={1.6} aria-hidden="true" />
            <h3>{guide.title}</h3>
          </div>
          <p className="season-guide-description">{guide.body}</p>
          {step === "grow" && task && (
            <p className={`season-task-context${overdue ? " is-overdue" : ""}`}>
              {farm?.name} · {overdue ? "Overdue · " : "Due "}
              {dueLabel(task.dueDate)}
              {queue.some((change) => change.path === `/api/tasks/${task.id}`)
                ? " · Change awaiting sync"
                : ""}
            </p>
          )}
          {!farm && (step === "prepare" || step === "grow") ? (
            <Button onClick={() => setAdding(true)}>
              <Plus size={18} />
              {guide.action}
            </Button>
          ) : (
            <Link className="button button-primary" to={guide.route}>
              {guide.action}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          )}
          {step === "grow" ? (
            <Link className="journey-secondary" to="/farms?tasks=1">
              See all farm tasks
              <ChevronRight size={16} />
            </Link>
          ) : step === "sell" ? (
            <p className="journey-reference-note">{guide.learningLabel}</p>
          ) : (
            <Link className="journey-secondary" to={guide.learning}>
              {guide.learningLabel}
              <ChevronRight size={16} />
            </Link>
          )}
        </div>
      </section>
      <nav className="journey-shortcuts" aria-label="Useful farming tools">
        <Link to="/markets">
          <Store size={24} strokeWidth={1.5} aria-hidden="true" />
          <span>
            <strong>Check prices</strong>
            <small>Published prices, with dates</small>
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </Link>
        <Link to="/learn">
          <BookOpen size={24} strokeWidth={1.5} aria-hidden="true" />
          <span>
            <strong>Learn farming skills</strong>
            <small>Field guides and FAO courses</small>
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </Link>
      </nav>
      {staff && (
        <Link to="/crm" className="journey-cooperative">
          Supporting your cooperative?
          <span>
            Open farmers & follow-ups
            <ArrowRight size={16} />
          </span>
        </Link>
      )}
      {adding && <FarmEditor onClose={() => setAdding(false)} />}
    </div>
  );
}
