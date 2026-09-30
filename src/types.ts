export type Role = "farmer" | "operator" | "admin";
export type User = {
  id: string;
  name: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  passwordChangeRequired?: boolean;
};
export type Entity = {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type Farm = Entity & {
  name: string;
  district: string;
  latitude: number;
  longitude: number;
  areaAcres: number;
  crop: string;
  plantedAt: string;
  ownerName: string;
  stage: string;
  notes: string;
};
export type Task = Entity & {
  farmId: string;
  title: string;
  dueDate: string;
  category: string;
  status: "pending" | "completed";
  notes: string;
};
export type Contact = Entity & {
  name: string;
  phone: string;
  district: string;
  type: "farmer" | "buyer" | "cooperative" | "supplier";
  crop: string;
  stage: "new" | "active" | "follow_up";
  preferredChannel: Channel;
  consent: boolean;
  notes: string;
};
export type Channel = "sms" | "whatsapp" | "voice" | "ussd";
export type MarketPrice = Entity & {
  crop: string;
  market: string;
  district: string;
  priceUgx: number;
  unit: string;
  observedAt: string;
  source: string;
  status: "sample" | "reported" | "verified";
};
export type Offer = Entity & {
  crop: string;
  quantityKg: number;
  priceUgx: number;
  district: string;
  sellerName: string;
  description: string;
  status: "available" | "reserved" | "sold";
};
export type Deal = Entity & {
  buyer: string;
  crop: string;
  quantityKg: number;
  priceUgx: number;
  destination: string;
  incoterm: "EXW" | "FCA" | "FOB" | "CIF" | "DAP";
  stage: "inquiry" | "qualified" | "contracted" | "in_transit" | "delivered";
  checklist: string[];
  notes: string;
};
export type Report = Entity & {
  kind: "crop_pest" | "crop_disease" | "standing_water";
  district: string;
  farmId?: string;
  description: string;
  status: "submitted" | "reviewing" | "resolved";
  latitude?: number;
  longitude?: number;
};
export type Lesson = {
  id: string;
  crop: string;
  title: string;
  summary: string;
  durationMinutes: number;
  level: string;
  sections: { heading: string; body: string }[];
  quiz: {
    question: string;
    options: string[];
    answerIndex?: number;
    explanation?: string;
  };
  sourceTitle: string;
  sourceUrl: string;
  reviewStatus: "draft" | "reviewed";
};
export type Progress = {
  id: string;
  lessonId: string;
  completed: boolean;
  score: number;
};
export type Message = {
  id: string;
  contactId: string;
  channel: Channel;
  body: string;
  status: string;
  createdAt: string;
};
export type Settings = {
  language: "en" | "lg" | "sw";
  lowDataMode: boolean;
  preferredChannel: Channel;
  notifications: boolean;
};
export type Bootstrap = {
  farms: Farm[];
  tasks: Task[];
  contacts: Contact[];
  marketPrices: MarketPrice[];
  offers: Offer[];
  deals: Deal[];
  reports: Report[];
  lessons: Lesson[];
  progress: Progress[];
  messages: Message[];
  settings: Settings;
  seasons: Season[];
  lots: HarvestLot[];
  collections: Collection[];
};
export type SeasonCost = {
  id: string;
  category:
    | "seed"
    | "inputs"
    | "labour"
    | "equipment"
    | "transport"
    | "storage"
    | "other";
  label: string;
  plannedUgx: number;
  actualUgx: number | null;
};
export type SeasonSale = {
  id: string;
  date: string;
  quantityKg: number;
  unitPriceUgx: number;
  buyer: string;
  receivedUgx: number;
};
export type Season = Entity & {
  farmId: string;
  name: string;
  crop: string;
  areaAcres: number;
  plantingDate: string;
  expectedHarvestDate: string;
  expectedHarvestKg: number;
  reserveKg: number;
  expectedPriceUgx: number;
  contingencyUgx: number;
  status: "planning" | "active" | "closed";
  costs: SeasonCost[];
  sales: SeasonSale[];
  harvestedKg: number;
  notes: string;
  summary?: Record<string, number | null>;
};
export type HarvestLot = Entity & {
  farmId: string;
  seasonId?: string;
  crop: string;
  harvestDate: string;
  quantityKg: number;
  bagCount: number;
  storageLocation: string;
  moisturePercent: number | null;
  measurementMethod: "not_recorded" | "meter" | "lab_report" | "other";
  testReference: string;
  qualityStatus:
    "unassessed" | "pending_test" | "accepted" | "on_hold" | "rejected";
  qualityNotes: string;
  notes: string;
  lotCode: string;
  qualityReviewedBy?: string | null;
  qualityReviewedAt?: string | null;
  allocation?: { collectionId: string; status: string } | null;
};
export type Collection = Entity & {
  name: string;
  crop: string;
  buyer: string;
  dealId?: string;
  targetKg: number;
  priceUgxPerKg: number;
  collectionDate: string;
  meetingPoint: string;
  destination: string;
  status: "planning" | "confirmed" | "dispatched" | "cancelled";
  lotIds: string[];
  notes: string;
  summary: {
    allocatedKg: number;
    contributorCount: number;
    targetProgressPercent: number;
    estimatedValueUgx: number;
  };
  manifest?: {
    lotId: string;
    lotCode: string;
    quantityKg: number;
    ownerId: string;
    qualityStatus: string;
    qualityReviewedBy: string | null;
    qualityReviewedAt: string | null;
    lotVersion: number;
  }[];
};
export type Forecast = {
  source: string;
  fetchedAt: string;
  latitude: number;
  longitude: number;
  current: { temperature: number; description: string };
  days: {
    date: string;
    min: number;
    max: number;
    rainChance: number;
    rainMm: number;
  }[];
  advisories: { severity: string; title: string; body: string }[];
  stale: boolean;
  warnings?: {
    status: string;
    alerts: {
      title: string;
      severity: string;
      area_names?: string[];
      html_url?: string;
      valid_to?: string;
    }[];
  };
};
export type AdminOverview = {
  counts: Record<string, number>;
  audit: {
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    actorName: string;
  }[];
  integrations: { id: string; name: string; status: string; detail: string }[];
};
