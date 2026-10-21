export type BuyerDemoLanguage = "en" | "lg";
export type BuyerDemoStep =
  | "consent"
  | "name"
  | "business"
  | "district"
  | "crop"
  | "quantity"
  | "grade"
  | "needBy"
  | "review"
  | "offers"
  | "requested"
  | "accepted"
  | "paymentApproved"
  | "paymentConfirmed";
export type BuyerDemoProfile = {
  name?: string;
  business?: string;
  district?: string;
  crop?: string;
  quantityKg?: number;
  grade?: string;
  needBy?: string;
  confirmed?: boolean;
};
export type BuyerDemoMessage = {
  id: number;
  sender: "buyer" | "agribridge";
  text: string;
  kind?: "voice" | "review" | "order" | "payment";
};
export type BuyerDemoOffer = {
  id: string;
  seller: string;
  crop: "Maize" | "Beans";
  variety: string;
  district: string;
  availableKg: number;
  priceUgxPerKg: number;
  quality: string;
};
export type BuyerDemoState = {
  language: BuyerDemoLanguage;
  step: BuyerDemoStep;
  profile: BuyerDemoProfile;
  messages: BuyerDemoMessage[];
  selectedOfferId: string | null;
  stopped: boolean;
  consented: boolean;
};
export type BuyerDemoAction =
  | { type: "reply"; value: string; voice?: boolean }
  | { type: "language"; language: BuyerDemoLanguage }
  | { type: "reset" }
  | { type: "confirm-details" }
  | { type: "select-offer"; id: string }
  | { type: "request-order" }
  | { type: "seller-confirmation" }
  | { type: "payment-approved" }
  | { type: "payment-confirmed" };
export type BuyerDemoChoice = { label: string; action: BuyerDemoAction };
const pick = (language: BuyerDemoLanguage, en: string, lg: string) =>
  language === "lg" ? lg : en;
export const buyerSampleOffers: readonly BuyerDemoOffer[] = [
  {
    id: "SAMPLE-MAIZE-01",
    seller: "Sample Nakaseke Growers",
    crop: "Maize",
    variety: "White maize",
    district: "Nakaseke",
    availableKg: 3000,
    priceUgxPerKg: 1550,
    quality:
      "Seller-reported dried grain. Grade, moisture and food safety need inspection.",
  },
  {
    id: "SAMPLE-BEANS-01",
    seller: "Sample Mpigi Cooperative",
    crop: "Beans",
    variety: "Nambale",
    district: "Mpigi",
    availableKg: 1800,
    priceUgxPerKg: 4200,
    quality:
      "Seller-reported sorted beans. Grade and handling requirements need confirmation.",
  },
];
export const buyerAmount = (value: number) =>
  new Intl.NumberFormat("en-UG", { maximumFractionDigits: 2 }).format(value);
function append(
  state: BuyerDemoState,
  ...messages: Omit<BuyerDemoMessage, "id">[]
): BuyerDemoState {
  const start = state.messages.at(-1)?.id ?? 0;
  return {
    ...state,
    messages: [
      ...state.messages,
      ...messages.map((message, index) => ({
        ...message,
        id: start + index + 1,
      })),
    ].slice(-40),
  };
}
export function buyerQuestion(
  step: BuyerDemoStep,
  language: BuyerDemoLanguage,
): string {
  const questions: Record<BuyerDemoStep, [string, string]> = {
    consent: [
      "Want to try a buyer enquiry? Use made-up details. Nothing leaves this page and no account or order is created. Reply AGREE to begin.",
      "Oyagala okugezaako okubuuza ng'omuguzi? Kozesa ebikwata ku muntu eby'okulabirako. Tewali akawunti oba ndagaano ntuufu ekoleddwa. Ddamu AGREE okutandika.",
    ],
    name: [
      "What should the sourcing team call you? Use a made-up name.",
      "Ttiimu ekuyite ani? Kozesa erinnya ery'okulabirako.",
    ],
    business: [
      "What business or organisation are you buying for?",
      "Ogulira bizinensi oba ekibiina ki?",
    ],
    district: [
      "Which district should the produce reach?",
      "Ebirime byetaagibwa mu disitulikiti ki?",
    ],
    crop: [
      "What would you like to buy? This scripted catalogue has maize and beans.",
      "Kirime ki ky'oyagala okugula? Demo eno erina kasooli n'ebijanjaalo.",
    ],
    quantity: [
      "How many kilograms do you need? For example, 600 kg.",
      "Weetaaga kiro mmeka? Eky'okulabirako, kiro 600.",
    ],
    grade: [
      "What quality or grade do you require? You can say 'To agree'.",
      "Weetaaga mutindo ki? Osobola okugamba nti munaaguteesako.",
    ],
    needBy: [
      "When do you need the produce? A sample timeframe is fine here.",
      "Ebirime obyetaaga ddi? Kozesa obudde obw'okulabirako.",
    ],
    review: [
      "Check your sample buying request. Confirm it to view matching example offers; this does not place an order.",
      "Kebera ekyetaago kyo eky'okulabirako. Kikakase okulaba ebiweebwayo. Kino tekikola ndagaano ya kugula.",
    ],
    offers: [
      "These fictional offers match the crop and have enough sample quantity. Grade, price validity, transport and availability still need seller confirmation.",
      "Bino bye biweebwayo eby'okulabirako. Omutindo, omuwendo, entambula n'obungi byetaaga okukakasibwa n'omutunzi.",
    ],
    requested: [
      "Sample order request sent to the fictional seller. No produce is reserved, no real seller is contacted and no payment is requested.",
      "Ekisaba eky'okulabirako kiragiddwa. Tewali birime biterekeddwa, mutunzi atuukiriddwa oba nsasula esabiddwa.",
    ],
    accepted: [
      "SAMPLE seller confirmation. In a live order, the seller and client would confirm quantity, grade, price, charges, delivery and cancellation terms before payment.",
      "OKUKAKASA OKW'OKULABIRAKO. Omuguzi n'omutunzi bandikakasizza obungi, omutindo, omuwendo, entambula n'obukwakkulizo nga tebannasasula.",
    ],
    paymentApproved: [
      "SAMPLE payment approved. The provider has authorised the example payment; receipt is not yet confirmed. No money moved. Clients would pay the verified seller directly, not an Agribridge-held balance.",
      "ENSASULA EY'OKULABIRAKO EKKIRIZIDDWA. Okufuna ssente tekunnakakasibwa. Tewali ssente zisindikiddwa. Omuguzi yandisasudde omutunzi butereevu.",
    ],
    paymentConfirmed: [
      "SAMPLE payment received. This illustrates a verified provider event for a client-to-seller payment. No actual transfer or WhatsApp notification occurred. A delivered message alone never proves payment.",
      "ENSASULA EY'OKULABIRAKO EKAKASIDDWA. Kino kiraga obubaka bw'omuweereza obukakasa ensasula. Tewali ssente oba bubaka bwa WhatsApp bisindikiddwa.",
    ],
  };
  return questions[step][language === "lg" ? 1 : 0];
}
export function createBuyerDemoState(
  language: BuyerDemoLanguage = "en",
): BuyerDemoState {
  const state: BuyerDemoState = {
    language,
    step: "consent",
    profile: {},
    messages: [],
    selectedOfferId: null,
    stopped: false,
    consented: false,
  };
  return append(
    state,
    {
      sender: "agribridge",
      text: pick(
        language,
        "Welcome to the buying side of Agribridge. Find produce from farmers and cooperatives, describe what your organisation needs, and follow a sample order through WhatsApp. This is a scripted demonstration, not a live AI or WhatsApp connection.",
        "Tukusanyukidde ku ludda lw'abaguzi. Noonya ebirime okuva mu balimi n'ebibiina. Eno demo yokka; si WhatsApp oba AI entuufu.",
      ),
    },
    { sender: "agribridge", text: buyerQuestion("consent", language) },
  );
}
export function buyerProfileSummary(
  profile: BuyerDemoProfile,
  language: BuyerDemoLanguage,
) {
  return [
    `${pick(language, "Buyer", "Omuguzi")}: ${profile.name || "—"}`,
    `${pick(language, "Business", "Bizinensi")}: ${profile.business || "—"}`,
    `${pick(language, "Destination", "Ekifo")}: ${profile.district || "—"}`,
    `${pick(language, "Produce", "Ebirime")}: ${profile.crop || "—"}`,
    `${pick(language, "Quantity", "Obungi")}: ${profile.quantityKg === undefined ? "—" : `${buyerAmount(profile.quantityKg)} kg`}`,
    `${pick(language, "Quality requested", "Omutindo")}: ${profile.grade || "—"}`,
    `${pick(language, "Needed by", "Byetaagibwa")}: ${profile.needBy || "—"}`,
  ].join("\n");
}
const cropKey = (value = "") =>
  /^(maize|kasooli)$/i.test(value.trim())
    ? "Maize"
    : /^(beans|ebijanjaalo)$/i.test(value.trim())
      ? "Beans"
      : value.trim();
export function matchingBuyerDemoOffers(
  state: BuyerDemoState,
): BuyerDemoOffer[] {
  if (!state.profile.confirmed) return [];
  return buyerSampleOffers.filter(
    (offer) =>
      offer.crop === cropKey(state.profile.crop) &&
      offer.availableKg >= (state.profile.quantityKg ?? Infinity),
  );
}
const fieldSteps: BuyerDemoStep[] = [
  "name",
  "business",
  "district",
  "crop",
  "quantity",
  "grade",
  "needBy",
];
export function reduceBuyerDemo(
  state: BuyerDemoState,
  action: BuyerDemoAction,
): BuyerDemoState {
  if (action.type === "reset") return createBuyerDemoState(state.language);
  if (action.type === "language") return createBuyerDemoState(action.language);
  if (state.stopped) return state;
  if (action.type === "confirm-details") {
    if (state.step !== "review" || !state.consented) return state;
    const next = {
      ...state,
      profile: { ...state.profile, confirmed: true },
      step: "offers" as const,
    };
    const offers = matchingBuyerDemoOffers(next);
    return append(
      next,
      {
        sender: "buyer",
        text: pick(
          state.language,
          "Confirm sample buying request",
          "Kakasa ekyetaago eky'okulabirako",
        ),
      },
      {
        sender: "agribridge",
        text: offers.length
          ? buyerQuestion("offers", state.language)
          : pick(
              state.language,
              "No sample offer covers that crop and quantity. The team would help source it; we will not invent stock or place an order. Reset to try maize or beans with a smaller sample quantity.",
              "Tewali kiweebwayo eky'okulabirako ekituukana n'ekirime n'obungi obwo. Ttiimu yandikuyambye okunoonya. Tewali birime bye tuyiiya.",
            ),
      },
    );
  }
  if (action.type === "select-offer") {
    if (state.step !== "offers") return state;
    const offer = matchingBuyerDemoOffers(state).find(
      (item) => item.id === action.id,
    );
    if (!offer) return state;
    return append(
      { ...state, selectedOfferId: offer.id },
      {
        sender: "buyer",
        text: `${pick(state.language, "Review sample offer", "Kebera ekiweebwayo")}: ${offer.seller}`,
      },
      {
        sender: "agribridge",
        kind: "review",
        text: `${offer.seller} · ${offer.crop} / ${offer.variety}\n${offer.district} · ${buyerAmount(state.profile.quantityKg!)} kg requested\nSAMPLE price UGX ${buyerAmount(offer.priceUgxPerKg)}/kg\nSAMPLE produce subtotal UGX ${buyerAmount(offer.priceUgxPerKg * state.profile.quantityKg!)}\n${offer.quality}\nTransport, fees and final terms are not included or agreed. Requesting an introduction does not reserve stock or authorise payment.`,
      },
    );
  }
  if (action.type === "request-order") {
    if (
      state.step !== "offers" ||
      !matchingBuyerDemoOffers(state).some(
        (offer) => offer.id === state.selectedOfferId,
      )
    )
      return state;
    return append(
      { ...state, step: "requested" },
      {
        sender: "buyer",
        text: pick(
          state.language,
          "Request sample order",
          "Saba okugula okw'okulabirako",
        ),
      },
      {
        sender: "agribridge",
        kind: "order",
        text: `DEMO-BUY-001\n${buyerQuestion("requested", state.language)}`,
      },
    );
  }
  const progress: Partial<
    Record<BuyerDemoAction["type"], [BuyerDemoStep, BuyerDemoStep]>
  > = {
    "seller-confirmation": ["requested", "accepted"],
    "payment-approved": ["accepted", "paymentApproved"],
    "payment-confirmed": ["paymentApproved", "paymentConfirmed"],
  };
  const transition = progress[action.type];
  if (transition) {
    if (state.step !== transition[0]) return state;
    return append(
      { ...state, step: transition[1] },
      {
        sender: "agribridge",
        kind: transition[1].startsWith("payment") ? "payment" : "order",
        text: `DEMO-BUY-001\n${buyerQuestion(transition[1], state.language)}`,
      },
    );
  }
  if (action.type !== "reply") return state;
  const value = action.value
    .replace(/[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/g, " ")
    .trim()
    .slice(0, 160);
  if (!value) return state;
  const next = append(state, {
    sender: "buyer",
    text: value,
    ...(action.voice ? { kind: "voice" as const } : {}),
  });
  if (/^(stop|unsubscribe|komya)$/i.test(value))
    return append(
      { ...next, stopped: true },
      {
        sender: "agribridge",
        text: pick(
          state.language,
          "Demo conversation paused. No alert subscription was created. Reset to start again.",
          "Emboozi eyimiriziddwa. Tewali kwewandiisa kufuna bubaka kukoleddwa. Ddamu okutandika.",
        ),
      },
    );
  if (/\+?\d[\d\s()-]{8,}|\S+@\S+/.test(value))
    return append(next, {
      sender: "agribridge",
      text: pick(
        state.language,
        "Use fictional demo details, not real phone numbers, email addresses, bank details or PINs. No payment credentials are needed.",
        "Kozesa ebikwata ku muntu eby'okulabirako. Tewali nnamba ya ssimu oba PIN byetaagibwa.",
      ),
    });
  if (state.step === "consent")
    return /^agree$/i.test(value)
      ? append(
          { ...next, consented: true, step: "name" },
          { sender: "agribridge", text: buyerQuestion("name", state.language) },
        )
      : append(next, {
          sender: "agribridge",
          text: buyerQuestion("consent", state.language),
        });
  if (!fieldSteps.includes(state.step))
    return append(next, {
      sender: "agribridge",
      text: buyerQuestion(state.step, state.language),
    });
  const profile = { ...state.profile };
  if (state.step === "quantity") {
    const match = value.match(
      /^(\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(?:kg|kilograms?|kiro)?$/i,
    );
    const quantity = match ? Number(match[1].replace(/,/g, "")) : NaN;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000)
      return append(next, {
        sender: "agribridge",
        text: pick(
          state.language,
          "Use a positive kilogram quantity, for example 600 kg. Acres, bags and tonnes need an explicit conversion before an order.",
          "Kozesa kiro, ng'eky'okulabirako kiro 600. Ebipimo ebirala byetaaga okukakasibwa.",
        ),
      });
    profile.quantityKg = quantity;
  } else {
    if (value.length < 2)
      return append(next, {
        sender: "agribridge",
        text: buyerQuestion(state.step, state.language),
      });
    const key = state.step as
      "name" | "business" | "district" | "crop" | "grade" | "needBy";
    profile[key] = state.step === "crop" ? cropKey(value) : value;
  }
  const step = fieldSteps[fieldSteps.indexOf(state.step) + 1] ?? "review";
  return append(
    { ...next, profile, step },
    ...(step === "review"
      ? [
          {
            sender: "agribridge" as const,
            kind: "review" as const,
            text: buyerProfileSummary(profile, state.language),
          },
        ]
      : []),
    { sender: "agribridge", text: buyerQuestion(step, state.language) },
  );
}
export function buyerDemoChoices(state: BuyerDemoState): BuyerDemoChoice[] {
  const language = state.language;
  const reply = (en: string, lg = en): BuyerDemoChoice => ({
    label: pick(language, en, lg),
    action: { type: "reply", value: pick(language, en, lg) },
  });
  if (state.stopped)
    return [
      {
        label: pick(language, "Restart buyer demo", "Ddamu okutandika"),
        action: { type: "reset" },
      },
    ];
  if (state.step === "consent") return [reply("AGREE")];
  if (state.step === "name")
    return [reply("Demo buyer", "Omuguzi w'okulabirako")];
  if (state.step === "business") return [reply("Sample Kampala Foods")];
  if (state.step === "district") return [reply("Kampala"), reply("Wakiso")];
  if (state.step === "crop")
    return [reply("Maize", "Kasooli"), reply("Beans", "Ebijanjaalo")];
  if (state.step === "quantity")
    return [reply("600 kg", "600 kiro"), reply("1,500 kg", "1,500 kiro")];
  if (state.step === "grade")
    return [
      reply(
        "To agree after inspection",
        "Omutindo gunaakakasibwa nga bikebereddwa",
      ),
    ];
  if (state.step === "needBy")
    return [reply("Within two weeks", "Mu wiiki bbiri")];
  if (state.step === "review")
    return [
      {
        label: pick(language, "Confirm sample request", "Kakasa ekyetaago"),
        action: { type: "confirm-details" },
      },
      {
        label: pick(language, "Start again", "Ddamu okutandika"),
        action: { type: "reset" },
      },
    ];
  if (state.step === "offers")
    return state.selectedOfferId
      ? [
          {
            label: pick(
              language,
              "Request sample order",
              "Saba okugula okw'okulabirako",
            ),
            action: { type: "request-order" },
          },
        ]
      : matchingBuyerDemoOffers(state).map((offer) => ({
          label: `${pick(language, "Review", "Kebera")} ${offer.seller}`,
          action: { type: "select-offer", id: offer.id },
        }));
  if (state.step === "requested")
    return [
      {
        label: pick(
          language,
          "Show seller-confirmation example",
          "Laba okukakasa kw'omutunzi",
        ),
        action: { type: "seller-confirmation" },
      },
    ];
  if (state.step === "accepted")
    return [
      {
        label: pick(
          language,
          "Show payment-approval example",
          "Laba ensasula ekkiriziddwa",
        ),
        action: { type: "payment-approved" },
      },
    ];
  if (state.step === "paymentApproved")
    return [
      {
        label: pick(
          language,
          "Show confirmed-payment example",
          "Laba ensasula ekakasiddwa",
        ),
        action: { type: "payment-confirmed" },
      },
    ];
  return [
    {
      label: pick(language, "Restart buyer demo", "Ddamu okutandika"),
      action: { type: "reset" },
    },
  ];
}
export function buyerVoiceExample(state: BuyerDemoState): string {
  const action = buyerDemoChoices(state)[0]?.action;
  return action?.type === "reply"
    ? action.value
    : pick(
        state.language,
        "Please connect me with the sourcing team.",
        "Nnyamba okufuna ttiimu enoonya ebirime.",
      );
}
