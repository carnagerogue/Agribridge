import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());
describe("isolated buyer session API", () => {
  it("uses the buyer token header and cookie scope without a farmer token or stored identity", async () => {
    vi.resetModules();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            buyer: { id: "buyer-one" },
            csrfToken: "buyer-csrf-only",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "request-one", totalUgx: 155000 }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const api = await import("./buyer-api");
    await api.readBuyerSession();
    await api.createBuyerOrder(
      {
        supplyId: "published-offer",
        listingVersion: 3,
        quantityKg: 100,
        deliveryLocation: "Kampala",
        requestedDeliveryDate: null,
        message: "",
      },
      "request-uuid",
    );
    expect(fetch.mock.calls[0][0]).toBe("/api/buyer/session");
    const options = fetch.mock.calls[1][1];
    expect(options.credentials).toBe("same-origin");
    expect(options.headers["X-Buyer-CSRF-Token"]).toBe("buyer-csrf-only");
    expect(options.headers["X-CSRF-Token"]).toBeUndefined();
    expect(options.headers["Idempotency-Key"]).toBe("request-uuid");
    await api.signOutBuyer();
    expect(fetch.mock.calls[2][0]).toBe("/api/buyer/logout");
  });
  it("treats a guest as unauthenticated but surfaces genuine session failures", async () => {
    vi.resetModules();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "BUYER_SESSION_REQUIRED", message: "Sign in" },
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "UNAVAILABLE",
              message: "The service is unavailable",
            },
          }),
          { status: 503 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const api = await import("./buyer-api");
    expect(await api.readBuyerSession()).toBeNull();
    await expect(api.readBuyerSession()).rejects.toThrow(
      "The service is unavailable",
    );
  });
});
