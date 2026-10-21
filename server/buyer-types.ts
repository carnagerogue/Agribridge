/** Buyer identity is independent of organization members and their staff permissions. */
export type BuyerAccount = {
  id: string;
  name: string;
  businessName: string;
  phone: string;
  email: string;
  district: string;
  community: string;
  phoneVerified: boolean;
  createdAt: string;
};

export type BuyerSession = { buyer: BuyerAccount; csrfToken: string };

/** Intentionally excludes seller user/tenant/profile IDs, phones, notes and precise coordinates. */
export type BuyerListing = {
  id: string;
  version: number;
  sellerName: string;
  crop: string;
  variety: string;
  grade: string;
  district: string;
  community: string;
  availableQuantityKg: number;
  priceUgxPerKg: number | null;
  harvestFrom: string;
  harvestUntil: string;
  sample: boolean;
  qualityEvidence: "seller_declared";
};

export type BuyerCatalogResponse = {
  items: BuyerListing[];
  pagination: { limit: number; offset: number; hasMore: boolean };
  sample: boolean;
};
