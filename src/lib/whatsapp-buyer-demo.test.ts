import { describe, expect, it } from "vitest";
import {
  buyerDemoChoices,
  createBuyerDemoState,
  matchingBuyerDemoOffers,
  reduceBuyerDemo,
  type BuyerDemoState,
} from "./whatsapp-buyer-demo";

function reply(state: BuyerDemoState, value: string) {
  return reduceBuyerDemo(state, { type: "reply", value });
}
function review(crop = "Maize", quantity = "600 kg") {
  let state = createBuyerDemoState();
  for (const value of [
    "AGREE",
    "Demo buyer",
    "Sample Kampala Foods",
    "Kampala",
    crop,
    quantity,
    "Grade to agree",
    "Within two weeks",
  ])
    state = reply(state, value);
  return state;
}

describe("scripted buyer WhatsApp preview", () => {
  it("needs explicit demo consent and a checked request before showing offers", () => {
    const refused = reply(createBuyerDemoState(), "Demo buyer");
    expect(refused.step).toBe("consent");
    expect(refused.profile).toEqual({});
    let state = review();
    expect(state.step).toBe("review");
    expect(matchingBuyerDemoOffers(state)).toEqual([]);
    state = reduceBuyerDemo(state, { type: "confirm-details" });
    expect(state.step).toBe("offers");
    expect(matchingBuyerDemoOffers(state).map((offer) => offer.crop)).toEqual([
      "Maize",
    ]);
    expect(state.messages.at(-1)?.text).toMatch(/fictional offers/);
  });

  it("does not invent available stock or substitute another crop", () => {
    const unsupported = reduceBuyerDemo(review("Coffee"), {
      type: "confirm-details",
    });
    expect(matchingBuyerDemoOffers(unsupported)).toEqual([]);
    expect(unsupported.messages.at(-1)?.text).toMatch(/No sample offer/);
    expect(
      reduceBuyerDemo(unsupported, {
        type: "select-offer",
        id: "SAMPLE-MAIZE-01",
      }),
    ).toBe(unsupported);
    const excessive = reduceBuyerDemo(review("Beans", "2000 kg"), {
      type: "confirm-details",
    });
    expect(matchingBuyerDemoOffers(excessive)).toEqual([]);
  });

  it("requires offer review and seller confirmation before illustrating distinct payment events", () => {
    let state = reduceBuyerDemo(review("Beans"), { type: "confirm-details" });
    expect(reduceBuyerDemo(state, { type: "request-order" })).toBe(state);
    expect(reduceBuyerDemo(state, { type: "payment-confirmed" })).toBe(state);
    state = reduceBuyerDemo(state, {
      type: "select-offer",
      id: "SAMPLE-BEANS-01",
    });
    expect(state.messages.at(-1)?.text).toMatch(
      /SAMPLE produce subtotal UGX 2,520,000/,
    );
    expect(state.messages.at(-1)?.text).toMatch(/not included or agreed/);
    state = reduceBuyerDemo(state, { type: "request-order" });
    expect(state.messages.at(-1)?.text).toMatch(/No produce is reserved/);
    state = reduceBuyerDemo(state, { type: "seller-confirmation" });
    state = reduceBuyerDemo(state, { type: "payment-approved" });
    expect(state.step).toBe("paymentApproved");
    expect(state.messages.at(-1)?.text).toMatch(/receipt is not yet confirmed/);
    expect(state.messages.at(-1)?.text).toMatch(
      /pay the verified seller directly/,
    );
    state = reduceBuyerDemo(state, { type: "payment-confirmed" });
    expect(state.step).toBe("paymentConfirmed");
    expect(state.messages.at(-1)?.text).toMatch(
      /No actual transfer or WhatsApp notification occurred/,
    );
  });

  it("STOP blocks every subsequent mutation until the explicit reset", () => {
    const stopped = reply(review(), "STOP");
    expect(stopped.stopped).toBe(true);
    for (const action of [
      { type: "confirm-details" },
      { type: "request-order" },
      { type: "payment-confirmed" },
      { type: "select-offer", id: "SAMPLE-MAIZE-01" },
      { type: "reply", value: "AGREE" },
    ] as const)
      expect(reduceBuyerDemo(stopped, action)).toBe(stopped);
    const reset = reduceBuyerDemo(stopped, { type: "reset" });
    expect(reset.stopped).toBe(false);
    expect(reset.consented).toBe(false);
    expect(reset.profile).toEqual({});
  });

  it("rejects non-kilogram quantities and real contact details", () => {
    let state = createBuyerDemoState();
    for (const value of [
      "AGREE",
      "Demo client",
      "Sample foods",
      "Kampala",
      "Maize",
    ])
      state = reply(state, value);
    const wrongUnit = reply(state, "4 acres");
    expect(wrongUnit.step).toBe("quantity");
    expect(wrongUnit.profile.quantityKg).toBeUndefined();
    expect(wrongUnit.messages.at(-1)?.text).toMatch(/kilogram quantity/);
    state = reply(state, "1,500 kg");
    expect(state.profile.quantityKg).toBe(1500);
    const contact = reply(createBuyerDemoState(), "+256 700 123 456");
    expect(contact.consented).toBe(false);
    expect(contact.profile).toEqual({});
    expect(contact.messages.at(-1)?.text).toMatch(/fictional demo details/);
  });

  it("the Luganda preview can complete the guided sample and resets language changes", () => {
    let state = createBuyerDemoState("lg");
    for (let index = 0; index < 8; index++) {
      const action = buyerDemoChoices(state)[0]?.action;
      expect(action?.type).toBe("reply");
      state = reduceBuyerDemo(state, action);
    }
    expect(state.step).toBe("review");
    expect(state.profile.crop).toBe("Maize");
    state = reduceBuyerDemo(state, { type: "language", language: "en" });
    expect(state.step).toBe("consent");
    expect(state.profile).toEqual({});
  });

  it("bounds the transcript while keeping fresh message identities", () => {
    let state = createBuyerDemoState();
    for (let index = 0; index < 60; index++)
      state = reply(state, "Please explain");
    expect(state.messages).toHaveLength(40);
    expect(new Set(state.messages.map((message) => message.id)).size).toBe(40);
    expect(state.messages[0].id).toBeGreaterThan(1);
  });
});
