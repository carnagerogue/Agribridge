import type {
  BuyerAccount,
  BuyerCatalogResponse,
} from "../../server/buyer-types";
import type {
  BuyerOrder,
  BuyerOrdersResponse,
} from "../../server/buyer-order-types";

export class BuyerApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "BuyerApiError";
  }
}

// This token belongs only to the buyer cookie, never to a farm workspace session.
let buyerCsrfToken = "";

async function buyerRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    key?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const response = await fetch(`/api/buyer${path}`, {
    method,
    credentials: "same-origin",
    signal: options.signal ?? AbortSignal.timeout(20000),
    headers: {
      Accept: "application/json",
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(method === "GET" || !buyerCsrfToken
        ? {}
        : { "X-Buyer-CSRF-Token": buyerCsrfToken }),
      ...(options.key ? { "Idempotency-Key": options.key } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) buyerCsrfToken = "";
    throw new BuyerApiError(
      response.status,
      data.error?.code ?? "BUYER_REQUEST_FAILED",
      data.error?.message ??
        "This request could not be completed. Please try again.",
    );
  }
  return data as T;
}

export type BuyerSignup = {
  name: string;
  businessName: string;
  phone: string;
  email: string;
  district: string;
  community: string;
  password: string;
};
type BuyerSession = { buyer: BuyerAccount; csrfToken: string };

export async function readBuyerSession(signal?: AbortSignal) {
  try {
    const result = await buyerRequest<BuyerSession>("/session", { signal });
    buyerCsrfToken = result.csrfToken;
    return result.buyer;
  } catch (error) {
    if (error instanceof BuyerApiError && error.status === 401) return null;
    throw error;
  }
}

export async function authenticateBuyer(
  mode: "login" | "signup",
  data: BuyerSignup | { phone: string; password: string },
) {
  const result = await buyerRequest<BuyerSession>(`/${mode}`, {
    method: "POST",
    body: data,
  });
  buyerCsrfToken = result.csrfToken;
  return result.buyer;
}

export async function signOutBuyer() {
  await buyerRequest("/logout", { method: "POST", body: {} });
  buyerCsrfToken = "";
}

export function readBuyerCatalog(query: URLSearchParams, signal?: AbortSignal) {
  return buyerRequest<BuyerCatalogResponse>(`/catalog?${query}`, { signal });
}

export function readBuyerOrders(offset = 0, signal?: AbortSignal) {
  return buyerRequest<BuyerOrdersResponse>(
    `/orders?limit=24&offset=${offset}`,
    { signal },
  );
}

export type BuyerOrderInput = {
  supplyId: string;
  listingVersion: number;
  quantityKg: number;
  deliveryLocation: string;
  requestedDeliveryDate: string | null;
  message: string;
};
export function createBuyerOrder(body: BuyerOrderInput, key: string) {
  return buyerRequest<BuyerOrder>("/orders", { method: "POST", body, key });
}
export function cancelBuyerOrder(order: BuyerOrder, key: string) {
  return buyerRequest<BuyerOrder>(`/orders/${encodeURIComponent(order.id)}`, {
    method: "PATCH",
    body: { version: order.version, status: "cancelled" },
    key,
  });
}
