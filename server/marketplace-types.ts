export type MarketLanguage = "en" | "lg";
export type MarketRecord = {
  id: string;
  version: number;
  sample: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MarketProfile = MarketRecord & {
  name: string;
  businessName: string;
  phone: string;
  phoneVerified: false;
  district: string;
  community: string;
  farmSizeAcres: number | null;
  crops: string[];
  language: MarketLanguage;
};

export type SupplyListing = MarketRecord & {
  profileId: string;
  sellerName?: string;
  crop: string;
  variety: string;
  quantityKg: number;
  remainingQuantityKg?: number;
  expectedPriceUgxPerKg: number | null;
  harvestFrom: string;
  harvestUntil: string;
  district: string;
  community: string;
  grade: string;
  qualityNotes: string;
  status: "available" | "paused" | "sold";
};

export type BuyerDemand = MarketRecord & {
  organization: string;
  crop: string;
  variety: string;
  grade: string;
  quantityKg: number;
  priceUgxPerKg: number | null;
  district: string;
  availableFrom: string;
  deadline: string;
  requirements: string;
  status: "open" | "paused" | "closed";
};

export type MarketServiceQuote = MarketRecord & {
  category: "input" | "transport" | "storage";
  name: string;
  provider: string;
  district: string;
  community: string;
  crop: string;
  priceUgx: number;
  unit: string;
  sourceTitle: string;
  sourceUrl: string;
  observedAt: string;
  validUntil: string;
  verificationStatus: "sample" | "reported" | "verified";
  freshness: "current" | "expired" | "future";
  notes: string;
};

export type MarketMatch = {
  id: string;
  supplyId: string;
  demandId: string;
  crop: string;
  organization: string;
  score: number;
  quantityKg: number;
  coveragePercent: number;
  estimatedGrossUgx: number | null;
  sample: boolean;
  reasons: string[];
  checks: string[];
};

export type MarketInterest = MarketRecord & {
  supplyId: string;
  demandId: string;
  message: string;
  status: "submitted" | "acknowledged" | "closed";
};

export type MarketOverview = {
  profile: MarketProfile | null;
  supply: SupplyListing[];
  demand: BuyerDemand[];
  services: MarketServiceQuote[];
  matches: MarketMatch[];
  interests: MarketInterest[];
  sample: boolean;
  pagination: {
    limit: number;
    offset: number;
    hasMore: {
      supply: boolean;
      demand: boolean;
      services: boolean;
      interests: boolean;
    };
  };
};

/** Same-community offer publication, never private profile/contact information. */
export type MarketCatalog = {
  supply: (SupplyListing & { sellerId: string; remainingQuantityKg: number })[];
  sample: boolean;
  pagination: { limit: number; offset: number; hasMore: boolean };
};
