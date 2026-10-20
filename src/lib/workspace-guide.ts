import type { Bootstrap, Role } from "../types";
import { routeMatches } from "./navigation";

export type WorkspaceGuide = {
  route: string;
  title: string;
  introduction: string;
  steps: { title: string; detail: string }[];
  question: string;
  staff?: boolean;
};

// Public product instructions only. Personal workspace data never enters
// assistant links; a question is sent only after the person reviews it.
export const WORKSPACE_GUIDES: WorkspaceGuide[] = [
  {
    route: "/",
    title: "Your daily workspace",
    introduction:
      "One small step at a time, from your first farm to a recorded sale.",
    steps: [
      {
        title: "Start with what you know",
        detail:
          "Add a real farm. You can return to edit its details as your records improve.",
      },
      {
        title: "Choose your next job",
        detail:
          "Add a task with a clear title and due date. Mark it complete after the work is done.",
      },
      {
        title: "Build the full picture",
        detail:
          "Follow the farm or cooperative journey on Home. Each step opens the tool you need.",
      },
    ],
    question: "How do I get started in Agribridge, step by step?",
  },
  {
    route: "/farms",
    title: "Farms and daily tasks",
    introduction:
      "Give each plot a home, then plan the work that belongs to it.",
    steps: [
      {
        title: "Add your farm",
        detail:
          "Choose Add a farm. Enter the plot name, farmer, district, area and crop. Check the details before saving.",
      },
      {
        title: "Plan a small, clear task",
        detail:
          "Open Tasks, then Add a task. Choose a farm or a general task, describe the job and set a due date.",
      },
      {
        title: "Keep your record current",
        detail:
          "Mark work complete when it is done. Reopen a task if more work is needed. Open a farm to edit its details.",
      },
    ],
    question: "How do I use Agribridge to add a farm and plan daily tasks?",
  },
  {
    route: "/seasons",
    title: "A season you can follow",
    introduction:
      "Start with a farm and a harvest date. Build the budget as you go.",
    steps: [
      {
        title: "Create the plan",
        detail:
          "Add a farm first. Choose Plan a season, select the farm, name the season and set the expected harvest date.",
      },
      {
        title: "Separate plans from actual results",
        detail:
          "Enter expected yield, household reserve and estimated price. Add planned costs, then actual costs when known. Estimates are not guaranteed returns.",
      },
      {
        title: "Record the real outcome",
        detail:
          "Update the harvested weight. Use Record a sale to enter quantity, price and money received. Review the season totals before closing it.",
      },
    ],
    question:
      "How do I use Agribridge to plan a season and track costs, harvests and sales?",
  },
  {
    route: "/harvest",
    title: "From harvest to collection",
    introduction:
      "Keep every batch connected to its farm, quality review and buyer.",
    steps: [
      {
        title: "Record the batch",
        detail:
          "Choose Record harvest. Enter the farm, date, weight and storage location. A season link is optional; linked lots must fit within its recorded harvested weight.",
      },
      {
        title: "Get the quality reviewed",
        detail:
          "Record observations and test references without guessing results. Cooperative staff review quality before a lot can be accepted.",
      },
      {
        title: "Coordinate the collection",
        detail:
          "Cooperative staff open Buyer collections, plan a collection and allocate accepted lots. Check the manifest before dispatch. A collection is not a payment receipt.",
      },
    ],
    question:
      "How do I use Agribridge to record harvest lots and prepare a buyer collection?",
  },
  {
    route: "/weather",
    title: "Read the weather with confidence",
    introduction:
      "Check the district and forecast date before planning your day.",
    steps: [
      {
        title: "Choose the right place",
        detail: "Select the district or farm location you want to check.",
      },
      {
        title: "Look at the days ahead",
        detail:
          "Compare temperatures and forecast rain amounts. Check the source and update time; today's forecast may cover only part of the day.",
      },
      {
        title: "Check warnings separately",
        detail:
          "Read any official warnings. A forecast is not a guarantee, and no listed warning does not mean there is no risk.",
      },
    ],
    question:
      "How do I read the forecast dates, rain amounts and warning status in Agribridge?",
  },
  {
    route: "/markets",
    title: "Compare prices carefully",
    introduction:
      "Match the crop, market, date and unit before comparing prices.",
    steps: [
      {
        title: "Find your crop",
        detail:
          "Choose the exact crop and market, then show prices. Similar crop names may have different published series.",
      },
      {
        title: "Check what the number means",
        detail:
          "Read the observation date, unit and source. Monthly reference prices can be historical; they are not today's buyer quotes.",
      },
      {
        title: "Use a confirmed offer for decisions",
        detail:
          "Compare public references with your local records and buyer offers. Confirm the actual quantity, quality, price and terms with the buyer.",
      },
    ],
    question:
      "How do I compare public reference prices and local price records in Agribridge?",
  },
  {
    route: "/marketplace",
    title: "Connect your produce with buyer demand",
    introduction:
      "Set up your business, list what you have and follow each agreed next step.",
    steps: [
      {
        title: "Set up My business",
        detail:
          "Open My business and record your business details, district and crops. Keep contact information accurate and share only what you have permission to publish.",
      },
      {
        title: "List My produce",
        detail:
          "Open My produce and choose Add produce. Record the crop, quantity, quality and harvest availability. Update or pause the listing when those details change.",
      },
      {
        title: "Find a suitable buyer",
        detail:
          "Open Find buyers and compare requests with your crop, district, quantity and harvest dates. Offer matching produce, then confirm quality, price and collection terms with the buyer.",
      },
      {
        title: "Follow Orders & updates",
        detail:
          "Review order requests and record acceptance, cancellation or fulfillment when it happens. An accepted order is not proof of payment. Check the displayed payment and messaging connection status before relying on updates.",
      },
      {
        title: "Coordinate demand as a team",
        detail:
          "Cooperative staff can choose Add buyer request in Find buyers, review available produce and follow introductions. Use Harvest & collection to arrange accepted lots and a collection manifest when needed.",
      },
    ],
    question:
      "How do I use Agribridge Marketplace to set up my business, list produce, find buyers and follow orders?",
  },
  {
    route: "/learn",
    title: "Learn a little, use it well",
    introduction:
      "Choose a topic, check its source and take one useful next step.",
    steps: [
      {
        title: "Find a relevant resource",
        detail:
          "Browse the learning resources or Short field guides. Select a topic that matches your crop and current task.",
      },
      {
        title: "Check the review status",
        detail:
          "Draft guides need qualified review. Read the source and ask a local extension officer before applying crop treatment or input advice.",
      },
      {
        title: "Keep track of your learning",
        detail:
          "Read the lesson and answer its knowledge check when available. Return to Home to plan a practical follow-up task.",
      },
    ],
    question:
      "How do I find learning resources and check whether a field guide is reviewed in Agribridge?",
  },
  {
    route: "/community",
    title: "Ask for a local review",
    introduction: "Describe what you can observe so someone can follow it up.",
    steps: [
      {
        title: "Describe the concern",
        detail:
          "Create a report, choose the type and district, and link a farm when relevant.",
      },
      {
        title: "Be specific",
        detail:
          "Describe the visible changes, where they occur and when they began. Leave out private health information. A report does not diagnose a crop.",
      },
      {
        title: "Follow the review",
        detail:
          "Return to the report to check its status. Contact a local extension officer directly for urgent help.",
      },
    ],
    question: "How do I submit and follow a community report in Agribridge?",
  },
  {
    route: "/assistant",
    title: "Get a clear explanation",
    introduction:
      "Ask one question. Check the answer. Stay in control of the next step.",
    steps: [
      {
        title: "Describe what you need",
        detail:
          "Ask about the screen you are using or a farm workflow. Keep names, phone numbers and other private details out of the question.",
      },
      {
        title: "Review before sending",
        detail:
          "Check your question, crop and district, then give consent and choose Ask assistant. Opening this page does not spend an AI request.",
      },
      {
        title: "Check and act yourself",
        detail:
          "Read the sources and limits. AI explains; it cannot save records, make payments or contact people for you.",
      },
    ],
    question:
      "How can the Agribridge assistant help me manage my daily workflow?",
  },
  {
    route: "/crm",
    title: "Care for every relationship",
    staff: true,
    introduction: "Keep the next conversation as clear as the last one.",
    steps: [
      {
        title: "Add the person or organization",
        detail:
          "Choose Add contact. Select farmer, buyer, cooperative or supplier and enter the details you have permission to keep.",
      },
      {
        title: "Plan a follow-up",
        detail:
          "Open the contact, record the relationship stage and arrange the next follow-up. Keep notes relevant to the work.",
      },
      {
        title: "Respect communication preferences",
        detail:
          "Record channel preferences and actual consent. Messaging providers are pending setup; preferences alone do not send a message.",
      },
    ],
    question:
      "How do I use Agribridge contacts, follow-ups and communication consent?",
  },
  {
    route: "/trade",
    title: "Move a buyer conversation forward",
    staff: true,
    introduction: "Track the agreement and the work needed before delivery.",
    steps: [
      {
        title: "Capture the opportunity",
        detail:
          "Choose New opportunity. Record the buyer, crop, quantity, price and destination using confirmed information.",
      },
      {
        title: "Review the readiness checklist",
        detail:
          "Open the opportunity and review the required arrangements. Keep notes and stages aligned with what has actually happened.",
      },
      {
        title: "Connect the collection",
        detail:
          "Use Harvest & collection to plan the buyer collection and select accepted lots. Trade stages track work; they do not execute payment or customs clearance.",
      },
    ],
    question:
      "How do I use the Agribridge trade desk and prepare a collection for a buyer?",
  },
  {
    route: "/messages",
    title: "Communication setup is pending",
    staff: true,
    introduction:
      "Prepare consent and contact details while provider connections await handover.",
    steps: [
      {
        title: "Review the contact first",
        detail:
          "Check the recipient, channel preference and consent in Farmers & CRM.",
      },
      {
        title: "Check the connection status",
        detail:
          "WhatsApp, SMS, USSD and automated voice need provider setup. An unconfigured channel cannot deliver messages.",
      },
      {
        title: "Verify delivery after setup",
        detail:
          "Once a provider is connected, use the message status to check delivery. A preview or queued message is not proof of receipt.",
      },
    ],
    question:
      "What must be configured before Agribridge can send messages, and how do I check delivery?",
  },
  {
    route: "/admin",
    title: "Manage access and readiness",
    staff: true,
    introduction:
      "Give people the access they need and check the services they depend on.",
    steps: [
      {
        title: "Check service readiness",
        detail:
          "Review integration status. Connected, pending and unavailable services have different capabilities.",
      },
      {
        title: "Manage account access",
        detail:
          "Administrators create and manage users. Choose the appropriate farmer, operator or administrator role and share account details securely.",
      },
      {
        title: "Review changes",
        detail:
          "Use the audit history to check activity. Review field guides with qualified experts before marking them reviewed.",
      },
    ],
    question:
      "How do I manage users, integration readiness and audit history in Agribridge?",
  },
  {
    route: "/settings",
    title: "Make this device work for you",
    introduction:
      "Choose how your workspace behaves when data or connectivity is limited.",
    steps: [
      {
        title: "Review your preferences",
        detail:
          "Choose your data and communication preferences. Changing a preference does not connect a messaging provider.",
      },
      {
        title: "Save only on a trusted device",
        detail:
          "Enable device storage while connected. Farmers can save essential farm records and lessons; private financial and cooperative records stay online.",
      },
      {
        title: "Check before you leave",
        detail:
          "Review pending changes and reconnect to sync. Wait for confirmation before clearing device data or switching accounts.",
      },
    ],
    question:
      "How do I use Agribridge offline and make sure my saved changes are synced?",
  },
];

export function workspaceGuide(pathname: string, role?: Role) {
  return WORKSPACE_GUIDES.find(
    (guide) =>
      routeMatches(pathname, guide.route) &&
      (!guide.staff || role === "operator" || role === "admin"),
  );
}

export function assistantGuideLink(question: string) {
  return `/assistant?question=${encodeURIComponent(question.slice(0, 600))}`;
}

export type JourneyStep = {
  title: string;
  detail: string;
  to: string;
  recorded: boolean;
};
export function workspaceJourney(
  data: Bootstrap,
  cooperative: boolean,
): JourneyStep[] {
  if (cooperative)
    return [
      {
        title: "Connect your people",
        detail: "Add real farmer and buyer contacts.",
        to: "/crm",
        recorded: data.contacts.length > 0,
      },
      {
        title: "Record buyer interest",
        detail: "Capture an opportunity and its terms.",
        to: "/trade",
        recorded: data.deals.length > 0,
      },
      {
        title: "Prepare a collection",
        detail: "Arrange accepted lots for the buyer.",
        to: "/harvest?tab=collections",
        recorded: data.collections.length > 0,
      },
      {
        title: "Record dispatch",
        detail: "Check the manifest and confirm dispatch.",
        to: "/harvest?tab=collections",
        recorded: data.collections.some((c) => c.status === "dispatched"),
      },
    ];
  return [
    {
      title: "Know your farm",
      detail: "Add its crop, district and land area.",
      to: "/farms",
      recorded: data.farms.length > 0,
    },
    {
      title: "Plan the season",
      detail: "Set dates, a harvest target and a budget.",
      to: data.farms.length ? "/seasons" : "/farms",
      recorded: data.seasons.length > 0,
    },
    {
      title: "Record your harvest",
      detail: "Keep the weight and batch traceable.",
      to: data.farms.length ? "/harvest" : "/farms",
      recorded: data.lots.length > 0,
    },
    {
      title: "Track your sales",
      detail: "Record the sale and money received.",
      to: data.seasons.length
        ? "/seasons"
        : data.farms.length
          ? "/seasons"
          : "/farms",
      recorded: data.seasons.some((s) => s.sales.length > 0),
    },
  ];
}
