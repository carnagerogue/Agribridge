/** Data shared with buyer/seller screens; no runtime or private account fields. */
export type BuyerOrderStatus =
  "requested" | "accepted" | "cancelled" | "fulfilled";
export type BuyerOrder = {
  id: string;
  supplyId: string;
  sellerName: string;
  buyerName: string;
  buyerBusinessName: string;
  crop: string;
  variety: string;
  grade: string;
  district: string;
  community: string;
  harvestFrom: string;
  harvestUntil: string;
  quantityKg: number;
  priceUgxPerKg: number;
  totalUgx: number;
  deliveryLocation: string;
  requestedDeliveryDate: string | null;
  message: string;
  status: BuyerOrderStatus;
  version: number;
  sourceVersion: number;
  sample: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};
export type BuyerOrdersResponse = {
  orders: BuyerOrder[];
  pagination: { limit: number; offset: number; hasMore: boolean };
  capabilities: {
    checkoutEnabled: false;
    totalIncludesTransport: false;
    reason: string;
  };
};
