import type { BuyerListing } from "../../server/buyer-types";
import type { BuyerOrder } from "../../server/buyer-order-types";

export type BuyerFilters = {
  q: string;
  crop: string;
  district: string;
  minQuantityKg: string;
};
export const emptyBuyerFilters: BuyerFilters = {
  q: "",
  crop: "",
  district: "",
  minQuantityKg: "",
};

export function buyerCatalogQuery(filters: BuyerFilters, offset = 0) {
  const params = new URLSearchParams({ limit: "24", offset: String(offset) });
  for (const [key, value] of Object.entries(filters))
    if (value.trim()) params.set(key, value.trim());
  return params;
}

export function buyerMoney(value: number) {
  return `UGX ${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(value)}`;
}
export function buyerNumber(value: number) {
  return new Intl.NumberFormat("en-UG", { maximumFractionDigits: 1 }).format(
    value,
  );
}
export function buyerDate(value: string | null | undefined) {
  if (!value || Number.isNaN(Date.parse(value))) return "Not supplied";
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Kampala",
  }).format(new Date(value));
}
export function buyerToday() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Kampala",
  }).format(new Date());
}

export type BuyerOrderDraft = {
  quantityKg: string;
  deliveryLocation: string;
  requestedDeliveryDate: string;
  message: string;
};
export function buyerEarliestDate(listing: BuyerListing, today: string) {
  const harvestStart = listing.harvestFrom.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(harvestStart) && harvestStart > today
    ? harvestStart
    : today;
}
export function validateBuyerOrder(
  listing: BuyerListing,
  draft: BuyerOrderDraft,
  today: string,
) {
  if (listing.priceUgxPerKg === null)
    return "This listing needs a confirmed price before an order can be requested.";
  const quantity = Number(draft.quantityKg);
  if (!Number.isSafeInteger(quantity) || quantity < 1)
    return "Enter a whole number of kilograms, at least 1 kg.";
  if (quantity > listing.availableQuantityKg)
    return "Your quantity is higher than the available stock. Refresh the listing and try a smaller quantity.";
  if (
    draft.deliveryLocation.trim().length < 2 ||
    draft.deliveryLocation.trim().length > 240
  )
    return "Enter a delivery or collection location between 2 and 240 characters.";
  if (draft.requestedDeliveryDate) {
    const value = draft.requestedDeliveryDate;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
    )
      return "Choose a valid requested date.";
    if (value < today) return "Choose today or a future requested date.";
    if (value < buyerEarliestDate(listing, today))
      return "Choose a requested date on or after the harvest begins.";
  }
  if (draft.message.length > 600)
    return "Keep your message within 600 characters.";
  return "";
}

export function previewBuyerTotal(listing: BuyerListing, quantity: string) {
  const kilograms = Number(quantity);
  return listing.priceUgxPerKg !== null &&
    Number.isSafeInteger(kilograms) &&
    kilograms > 0 &&
    kilograms <= listing.availableQuantityKg
    ? listing.priceUgxPerKg * kilograms
    : null;
}

export type BuyerFlow = {
  auth: "login" | "signup" | null;
  pending: BuyerListing | null;
  review: BuyerListing | null;
  confirmation: BuyerOrder | null;
};
export const emptyBuyerFlow: BuyerFlow = {
  auth: null,
  pending: null,
  review: null,
  confirmation: null,
};
export type BuyerFlowAction =
  | { type: "select"; listing: BuyerListing; authenticated: boolean }
  | { type: "auth"; mode: "login" | "signup" }
  | { type: "authenticated" }
  | { type: "confirmed"; order: BuyerOrder }
  | { type: "close" | "signed-out" };
export function buyerFlowReducer(
  state: BuyerFlow,
  action: BuyerFlowAction,
): BuyerFlow {
  if (action.type === "close" || action.type === "signed-out")
    return emptyBuyerFlow;
  if (action.type === "select")
    return action.authenticated
      ? { ...emptyBuyerFlow, review: action.listing }
      : { ...emptyBuyerFlow, auth: "signup", pending: action.listing };
  if (action.type === "auth")
    return { ...state, auth: action.mode, review: null, confirmation: null };
  if (action.type === "authenticated")
    return { ...emptyBuyerFlow, review: state.pending };
  if (action.type === "confirmed" && state.review?.id === action.order.supplyId)
    return { ...emptyBuyerFlow, confirmation: action.order };
  return state;
}

export function buyerIntentKey(
  keys: Map<string, string>,
  buyerId: string,
  body: unknown,
  uuid: () => string = () => crypto.randomUUID(),
) {
  const fingerprint = `${buyerId}:${JSON.stringify(body)}`;
  let key = keys.get(fingerprint);
  if (!key) {
    key = uuid();
    keys.set(fingerprint, key);
  }
  return key;
}

export function mergeBuyerRows<T extends { id: string }>(
  previous: T[],
  incoming: T[],
) {
  return [
    ...new Map([...previous, ...incoming].map((row) => [row.id, row])).values(),
  ];
}
