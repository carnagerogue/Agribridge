import type { BuyerAccount, BuyerListing } from "../../server/buyer-types";
import type { BuyerOrder } from "../../server/buyer-order-types";
import type { BuyerOrderInput } from "./buyer-api";

export const sampleBuyer: BuyerAccount = {
  id: "sample-browser-buyer",
  name: "Sample buyer",
  businessName: "Sample Kitchen",
  phone: "Not collected in this preview",
  email: "",
  district: "Kampala",
  community: "Sample collection point",
  phoneVerified: false,
  createdAt: "2026-10-20T08:00:00Z",
};
const base = {
  version: 1,
  harvestFrom: "2026-10-20",
  harvestUntil: "2026-11-15",
  sample: true,
  qualityEvidence: "seller_declared" as const,
};
export const sampleBuyerListings: BuyerListing[] = [
  {
    ...base,
    id: "sample-only-maize",
    sellerName: "Sample Nakaseke Growers",
    crop: "Maize",
    variety: "White maize",
    grade: "Clean & dried",
    district: "Nakaseke",
    community: "Kiwoko",
    availableQuantityKg: 6000,
    priceUgxPerKg: 1550,
  },
  {
    ...base,
    id: "sample-only-beans",
    sellerName: "Sample Mpigi Cooperative",
    crop: "Beans",
    variety: "Nambale beans",
    grade: "Sorted dry beans",
    district: "Mpigi",
    community: "Buwama",
    availableQuantityKg: 1200,
    priceUgxPerKg: 3400,
  },
  {
    ...base,
    id: "sample-only-coffee",
    sellerName: "Sample Luwero Farm",
    crop: "Coffee",
    variety: "Robusta coffee",
    grade: "Quality to confirm",
    district: "Luwero",
    community: "Wobulenzi",
    availableQuantityKg: 850,
    priceUgxPerKg: null,
  },
];

export function filterSampleBuyerListings(filters: {
  q: string;
  crop: string;
  district: string;
  minQuantityKg: string;
}) {
  const terms = filters.q
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return sampleBuyerListings.filter((item) => {
    const text = [
      item.crop,
      item.variety,
      item.sellerName,
      item.district,
      item.community,
      item.grade,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return (
      terms.every((term) => text.includes(term)) &&
      (!filters.crop ||
        item.crop.toLocaleLowerCase() ===
          filters.crop.trim().toLocaleLowerCase()) &&
      (!filters.district ||
        item.district.toLocaleLowerCase() ===
          filters.district.trim().toLocaleLowerCase()) &&
      (!filters.minQuantityKg ||
        item.availableQuantityKg >= Number(filters.minQuantityKg))
    );
  });
}

export function createSampleBuyerOrder(
  listing: BuyerListing,
  body: BuyerOrderInput,
  id = `sample-request-${crypto.randomUUID()}`,
): BuyerOrder {
  if (
    !listing.sample ||
    !listing.id.startsWith("sample-only-") ||
    listing.priceUgxPerKg === null
  )
    throw new Error(
      "Choose a priced sample listing to explore an order request.",
    );
  if (
    body.supplyId !== listing.id ||
    body.listingVersion !== listing.version ||
    !Number.isSafeInteger(body.quantityKg) ||
    body.quantityKg < 1 ||
    body.quantityKg > listing.availableQuantityKg
  )
    throw new Error(
      "Review the current sample listing and enter a valid whole number of kilograms.",
    );
  const timestamp = new Date().toISOString();
  return {
    id,
    supplyId: listing.id,
    sellerName: listing.sellerName,
    buyerName: sampleBuyer.name,
    buyerBusinessName: sampleBuyer.businessName,
    crop: listing.crop,
    variety: listing.variety,
    grade: listing.grade,
    district: listing.district,
    community: listing.community,
    harvestFrom: listing.harvestFrom,
    harvestUntil: listing.harvestUntil,
    quantityKg: body.quantityKg,
    priceUgxPerKg: listing.priceUgxPerKg,
    totalUgx: body.quantityKg * listing.priceUgxPerKg,
    deliveryLocation: body.deliveryLocation,
    requestedDeliveryDate: body.requestedDeliveryDate,
    message: body.message,
    status: "requested",
    version: 1,
    sourceVersion: listing.version,
    sample: true,
    expiresAt: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

// A single branch keeps the sample walkthrough away from real order mutations.
export async function submitBuyerRequest(
  simulation: boolean,
  listing: BuyerListing,
  body: BuyerOrderInput,
  submitLive: (body: BuyerOrderInput) => Promise<BuyerOrder>,
) {
  if (simulation) return createSampleBuyerOrder(listing, body);
  return submitLive(body);
}
