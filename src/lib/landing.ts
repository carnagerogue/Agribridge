export const landingStory = [
  {
    id: "fields",
    label: "Growing",
    title: "Good things",
    emphasis: "grow together.",
    description:
      "Your land. Your people. Your next step. One connected workspace for farmers and cooperatives.",
  },
  {
    id: "harvest",
    label: "Harvesting",
    title: "Every harvest,",
    emphasis: "accounted for.",
    description:
      "Record what you harvest, track quality checks and keep every lot connected to the farm it came from.",
  },
  {
    id: "transport",
    label: "Transporting",
    title: "Good harvests.",
    emphasis: "Going places.",
    description:
      "Bring farmers and collection teams together, with shared harvest records and coordinated pickup plans.",
  },
  {
    id: "market",
    label: "Selling",
    title: "Know your crop.",
    emphasis: "Know its value.",
    description:
      "Compare published reference prices, record your sales and plan your next step with more context.",
  },
] as const;

export const landingStages = [
  {
    id: "prepare",
    label: "Prepare",
    introduction: "Plan with real information.",
    title: "Give your season a clear start.",
    body: "Record your farm, choose a crop and work through the costs before you spend. A planting plan starts with your land and local advice—not a guessed date.",
    task: "Plan your next planting season",
    note: "Record your crop, planned costs and expected harvest.",
  },
  {
    id: "grow",
    label: "Grow",
    introduction: "Know what needs your attention.",
    title: "Know your next step.",
    body: "Keep farm records, check the district forecast and stay on top of everyday tasks. Small observations help you ask better questions when you need support.",
    task: "Walk the maize field",
    note: "Look for changes in your crop and record what you notice.",
  },
  {
    id: "harvest",
    label: "Harvest",
    introduction: "Keep quality connected to the field.",
    title: "Make every harvest traceable.",
    body: "Record each harvest lot, its quantity and the checks carried out. Keep collection plans connected to the farm the produce came from.",
    task: "Record a harvest lot",
    note: "Add the crop, harvest date and quantity. Quality checks are not certification.",
  },
  {
    id: "sell",
    label: "Sell",
    introduction: "Compare before you commit.",
    title: "Bring context to your next sale.",
    body: "Compare published prices by commodity, market, unit and observation month. Keep your own sale records so you can see what was sold and what was received.",
    task: "Check the market and unit",
    note: "Published observations are reference prices, not live buyer offers.",
  },
] as const;

export function landingEntry(authenticated: boolean, demo: boolean) {
  if (authenticated)
    return { kind: "workspace", label: "Open workspace", to: "/" } as const;
  if (demo)
    return { kind: "demo", label: "Try farmer demo", to: null } as const;
  return { kind: "signin", label: "Sign in", to: "/login" } as const;
}

export async function enterLandingDemo(
  login: () => Promise<void>,
  enter: () => void,
) {
  await login();
  enter();
}
