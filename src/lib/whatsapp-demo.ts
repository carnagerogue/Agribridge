export type DemoLanguage = "en" | "lg";
export type DemoScenario =
  | "signup"
  | "buyers"
  | "prices"
  | "weather"
  | "inputs"
  | "logistics"
  | "payment";
export type DemoStep =
  | "name"
  | "businessName"
  | "community"
  | "crop"
  | "variety"
  | "land"
  | "quantity"
  | "harvest"
  | "review"
  | "complete";
export type DemoProfile = {
  name?: string;
  businessName?: string;
  community?: string;
  crop?: string;
  variety?: string;
  landSizeAcres?: number;
  quantityKg?: number;
  harvest?: string;
  confirmed?: boolean;
};
export type DemoMessage = {
  id: number;
  sender: "farmer" | "agribridge";
  text: string;
  kind?: "voice" | "profile" | "offer" | "payment";
  paymentStatus?: "approved" | "confirmed";
};
export type DemoState = {
  language: DemoLanguage;
  scenario: DemoScenario;
  step: DemoStep;
  messages: DemoMessage[];
  profile: DemoProfile;
  offerCreated: boolean;
  payment: "none" | "approved" | "confirmed";
  stopped: boolean;
};
export type DemoAction =
  | { type: "scenario"; scenario: DemoScenario }
  | { type: "language"; language: DemoLanguage }
  | { type: "reply"; value: string; voice?: boolean }
  | { type: "confirm-profile" }
  | { type: "edit-profile" }
  | { type: "create-offer" }
  | { type: "confirm-payment" }
  | { type: "reset" };
export type DemoChoice = { label: string; action: DemoAction };

export const demoScenarios: {
  id: DemoScenario;
  en: string;
  lg: string;
  description: string;
}[] = [
  {
    id: "signup",
    en: "Farmer signup",
    lg: "Wewandiise",
    description: "A business profile, one question at a time",
  },
  {
    id: "buyers",
    en: "Find a buyer",
    lg: "Funa omuguzi",
    description: "Turn a harvest into a market conversation",
  },
  {
    id: "prices",
    en: "Produce prices",
    lg: "Emiwendo gy'ebirime",
    description: "Location, quality, units and source dates",
  },
  {
    id: "weather",
    en: "Weather",
    lg: "Obudde",
    description: "A dated forecast for the next decision",
  },
  {
    id: "inputs",
    en: "Input costs",
    lg: "Ebyetaago by'okulima",
    description: "Compare costs before buying",
  },
  {
    id: "logistics",
    en: "Transport & storage",
    lg: "Entambula n'okutereka",
    description: "Know the costs beyond the farm gate",
  },
  {
    id: "payment",
    en: "Payment updates",
    lg: "Ebikwata ku nsasula",
    description: "Approval and received funds stay distinct",
  },
];

const pick = (language: DemoLanguage, en: string, lg: string) =>
  language === "lg" ? lg : en;
const amount = (value: number) =>
  new Intl.NumberFormat("en-UG", { maximumFractionDigits: 1 }).format(value);

function append(
  state: DemoState,
  ...messages: Omit<DemoMessage, "id">[]
): DemoState {
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

export function demoProfileSummary(
  profile: DemoProfile,
  language: DemoLanguage,
) {
  const acres =
    profile.landSizeAcres === undefined
      ? pick(language, "Not recorded", "Tekinnawandiikibwa")
      : `${amount(profile.landSizeAcres)} ${pick(language, "acres", "eka")}`;
  return [
    `${pick(language, "Name", "Erinnya")}: ${profile.name || "—"}`,
    `${pick(language, "Business", "Ennimiro")}: ${profile.businessName || "—"}`,
    `${pick(language, "Community", "Ekitundu")}: ${profile.community || "—"}`,
    `${pick(language, "Produce", "Ekirime")}: ${[profile.crop, profile.variety].filter(Boolean).join(" · ") || "—"}`,
    `${pick(language, "Land", "Ettaka")}: ${acres}`,
    `${pick(language, "Available quantity", "Obungi")}: ${profile.quantityKg === undefined ? "—" : `${amount(profile.quantityKg)} kg`}`,
    `${pick(language, "Harvest", "Okukungula")}: ${profile.harvest || "—"}`,
  ].join("\n");
}

const steps: Exclude<DemoStep, "review" | "complete">[] = [
  "name",
  "businessName",
  "community",
  "crop",
  "variety",
  "land",
  "quantity",
  "harvest",
];

export function stepQuestion(step: DemoStep, language: DemoLanguage): string {
  const questions: Record<DemoStep, [string, string]> = {
    name: [
      "What should I call you? Use a made-up name for this demo.",
      "Nkuyite ani? Kozesa erinnya ery'okulabirako mu demo eno.",
    ],
    businessName: [
      "What is your farm or business called? A sample name is fine.",
      "Ennimiro yo oba bizinensi yo eyitibwa etya? Kozesa erinnya ery'okulabirako.",
    ],
    community: [
      "Which community and district is your produce in?",
      "Ebirime byo biri mu kyalo ki ne mu disitulikiti ki?",
    ],
    crop: [
      "Which crop would you like to bring to market?",
      "Kirime ki ky'oyagala okutunda?",
    ],
    variety: [
      "Which variety? You can say you are not sure.",
      "Kika ki eky'ekirime? Osobola okugamba nti tokakasa.",
    ],
    land: [
      "About how many acres do you farm? You can skip this question.",
      "Olima eka mmeka? Osobola okubuuka ekibuuzo kino.",
    ],
    quantity: [
      "How many kilograms do you expect to have available?",
      "Osuubira okuba ne kiro mmeka ez'okutunda?",
    ],
    harvest: [
      "When will that produce be ready?",
      "Ebirime ebyo binaaba byetegefu ddi?",
    ],
    review: [
      "Please check these sample details. Confirm them, or start again to make a correction.",
      "Kebera ebikwata ku nnimiro eno eby'okulabirako. Bikakase oba oddemu okutandika okubitereeza.",
    ],
    complete: [
      "Your sample business profile is ready. Shall we look for a buyer?",
      "Ebikwata ku nnimiro yo eby'okulabirako bitegekeddwa. Tunoonye omuguzi?",
    ],
  };
  return questions[step][language === "lg" ? 1 : 0];
}

export function createDemoState(language: DemoLanguage = "en"): DemoState {
  const state: DemoState = {
    language,
    scenario: "signup",
    step: "name",
    messages: [],
    profile: {},
    offerCreated: false,
    payment: "none",
    stopped: false,
  };
  return append(
    state,
    {
      sender: "agribridge",
      text: pick(
        language,
        "Hello, welcome to Agribridge. Let's connect your produce with market opportunities. This conversation is a scripted example; nothing is sent or saved to a real account.",
        "Tukusanyukidde ku Agribridge. Tukuyambe okunoonya akatale k'ebirime byo. Eno demo yokka; tewali bubaka busindikibwa oba akawunti entuufu eggulwawo.",
      ),
    },
    { sender: "agribridge", text: stepQuestion("name", language) },
  );
}

function scenarioExample(state: DemoState, scenario: DemoScenario): DemoState {
  if (scenario === "signup") return createDemoState(state.language);
  const language = state.language;
  let next = {
    ...state,
    scenario,
    stopped: false,
    messages: [] as DemoMessage[],
  };
  const crop = state.profile.crop || pick(language, "maize", "kasooli");
  const community = state.profile.community || "Kiwoko, Nakaseke";
  const variety =
    state.profile.variety ||
    pick(language, "variety to confirm", "ekika kyetaaga okukakasibwa");
  const examples: Record<
    Exclude<DemoScenario, "signup" | "payment">,
    [string, string, string, string]
  > = {
    buyers: [
      `Who could buy my ${crop.toLowerCase()} from ${community}?`,
      `Ani ayinza okugula ${crop} okuva e ${community}?`,
      `Here is a fictional buyer request to show how matching works:\n\nSAMPLE produce buyer · ${crop} (${variety})\n3,000 kg requested · Kampala\nBuying window: the next two weeks (example)\nQuality and handling requirements need agreement; inspection is required.\n\n${state.profile.quantityKg ? `Your declared ${amount(state.profile.quantityKg)} kg could be a partial contribution. ` : "A farmer's quantity and harvest window would be compared with this request. "}The team would help agree quality, price, transport and timing. A match is an introduction, not a confirmed sale.`,
      `Kino kye kyetaago ky'omuguzi eky'okulabirako:\n\nOmuguzi w'ebirime ow'okulabirako · ${crop} (${variety})\nYeetaaga kiro 3,000 · Kampala\nMu wiiki bbiri ezijja (kyakulabirako)\nOmutindo gwetaaga okuteesebwako n'okukeberwa.\n\n${state.profile.quantityKg ? `Kiro ${amount(state.profile.quantityKg)} z'owandiisizza ziyinza okuba ekitundu ku ze yeetaaga. ` : "Obungi n'obudde bw'okukungula bye byandikebereddwa. "}Ttiimu eyamba okutegeeragana ku mutindo, omuwendo, entambula n'obudde. Kino tekinnaba ndagaano ya kutunda.`,
    ],
    prices: [
      "What is the maize price near my community?",
      "Omuwendo gwa kasooli mu kitundu kyange guli gutya?",
      "SAMPLE PRICE · not a live quote\n\nWhite maize · Kampala\nUGX 1,550 per kg · example buyer offer\nDate: illustrative, not a current observation.\n\nA useful answer includes the market, variety, quality, unit, date and source. Retail prices and a buyer's farm-gate offer are different. Final prices still need agreement with the buyer.",
      "OMUWENDO GW'OKULABIRAKO · si gwa leero\n\nKasooli omweru · Kampala\nUGX 1,550 buli kiro · eky'okulabirako\nEnnaku: kino si kipimo kya leero.\n\nEky'okuddamu kiraga akatale, ekika, omutindo, ekipimo, ennaku n'ensibuko. Omuwendo gw'omu katale guyinza okwawukana ku gw'omuguzi ku nnimiro. Omuwendo ogusembayo guteekeddwa okuteesebwako.",
    ],
    weather: [
      "Will it rain before I harvest?",
      "Enkuba eneetonnya nga sinnaba kukungula?",
      "SAMPLE FORECAST · not current weather\n\nNakaseke · example day\nRain chance: 70% · high: 28°C\n\nIn the live service, the forecast's location, issue date and source would be shown. A model forecast supports planning; it does not guarantee conditions on your farm. Official warnings would be shown separately.",
      "OBUDDE OBW'OKULABIRAKO · si bwa leero\n\nNakaseke · olunaku olw'okulabirako\nOmukisa gw'enkuba: 70% · ebbugumu: 28°C\n\nMu buweereza obutuufu, ekifo, ennaku n'ensibuko biragibwa. Okuteebereza obudde kuyamba okuteekateeka; tekukakasa mbeera ya nnimiro yo. Okulabula okw'obutongole kulagibwa kwokka.",
    ],
    inputs: [
      "How much does maize seed cost?",
      "Ensigo za kasooli zigula ssente mmeka?",
      "SAMPLE INPUT QUOTE\n\nMaize seed · UGX 45,000 per 2 kg pack\nLocation: Nakaseke · fictional supplier\n\nThe service would show the exact product, pack size, supplier, source date and quote validity. Ask what the price includes and confirm suitability with a qualified adviser. This example is not a recommendation or a current supplier price.",
      "OMUWENDO GW'OKULABIRAKO\n\nEnsigo za kasooli · UGX 45,000 ku pakiti ya kiro 2\nEkifo: Nakaseke · omutunzi w'okulabirako\n\nObuweereza bwandiraze ekintu, obunene bwa pakiti, omutunzi, ennaku n'ensibuko. Kakasa ebiri mu muwendo, era weebuuze ku mukugu. Kino si kuwabula ku kika ky'ensigo oba muwendo gwa leero.",
    ],
    logistics: [
      "What will transport and storage cost?",
      "Entambula n'okutereka binaagula ssente mmeka?",
      "SAMPLE LOGISTICS QUOTES\n\nTransport: UGX 180,000 per tonne / trip\nExample route: Nakaseke → Kampala\nStorage: UGX 35 per kg / month\n\nThese are fictional examples, not bookable services. Real quotes would identify the provider, route, capacity, loading charges, storage conditions and expiry. Comparing the same units helps you understand the costs before agreeing a sale.",
      "EMIWENDO GY'OKULABIRAKO\n\nEntambula: UGX 180,000 ku ttani / olugendo\nOluguudo olw'okulabirako: Nakaseke → Kampala\nOkutereka: UGX 35 buli kiro / omwezi\n\nBino byakulabirako; si buweereza bw'osobola okusasulira wano. Emiwendo emituufu giraga omuweereza, oluguudo, obusobozi, okusitula, embeera y'okutereka n'obudde bw'eggwaako.",
    ],
  };
  if (scenario === "payment") {
    next = { ...next, payment: "approved" };
    return append(
      next,
      {
        sender: "farmer",
        text: pick(
          language,
          "How would I hear about my payment?",
          "Nnaategeera ntya ebikwata ku nsasula yange?",
        ),
      },
      {
        sender: "agribridge",
        kind: "payment",
        paymentStatus: "approved",
        text: pick(
          language,
          "SAMPLE EVENT · Payment approved\n\nOrder DEMO-001 · UGX 930,000\nThe payment has been approved. The transfer is not yet confirmed.\n\nClients pay sellers directly through the selected payment provider. This demonstration does not move money or send WhatsApp messages.",
          "EKY'OKULABIRAKO · Ensasula ekkiriziddwa\n\nDEMO-001 · UGX 930,000\nEnsasula ekkiriziddwa, naye okusindikibwa kwa ssente tekunnakakasibwa.\n\nAbaguzi basasula abatunzi butereevu nga bayita mu muweereza w'ensasula. Demo eno tesindika ssente oba bubaka bwa WhatsApp.",
        ),
      },
    );
  }
  const example = examples[scenario];
  return append(
    next,
    { sender: "farmer", text: example[language === "lg" ? 1 : 0] },
    { sender: "agribridge", text: example[language === "lg" ? 3 : 2] },
  );
}

function signupReply(
  state: DemoState,
  value: string,
  voice = false,
): DemoState {
  const language = state.language;
  let next = append(state, {
    sender: "farmer",
    text: value,
    ...(voice ? { kind: "voice" as const } : {}),
  });
  if (state.step === "review")
    return append(next, {
      sender: "agribridge",
      text: stepQuestion("review", language),
    });
  if (state.step === "complete")
    return append(next, {
      sender: "agribridge",
      text: stepQuestion("complete", language),
    });
  if (/\+?\d[\d\s()-]{8,}|\S+@\S+/.test(value))
    return append(next, {
      sender: "agribridge",
      text: pick(
        language,
        "Use made-up demo details, not a real phone number or email address. The sample WhatsApp identity is supplied automatically.",
        "Kozesa ebikwata ku muntu eby'okulabirako, si nnamba ya ssimu oba email entuufu. Demo eno erina akawunti ey'okulabirako.",
      ),
    });
  const profile = { ...state.profile };
  if (state.step === "land" || state.step === "quantity") {
    if (state.step === "land" && /^(skip|skip for now|buuka)$/i.test(value))
      profile.landSizeAcres = undefined;
    else {
      const numericPattern =
        state.step === "land"
          ? /^(\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(?:acres?|eka)?$/i
          : /^(\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(?:kg|kilograms?|kiro)?$/i;
      const parsed = value.match(numericPattern);
      const numeric = parsed ? Number(parsed[1].replace(/,/g, "")) : NaN;
      if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1_000_000)
        return append(next, {
          sender: "agribridge",
          text:
            state.step === "land"
              ? pick(
                  language,
                  "Use acres here, for example 3.5 acres, or skip this question. A weight in kg cannot be saved as land size.",
                  "Kozesa eka, ng'eky'okulabirako 3.5 eka, oba buuka ekibuuzo kino. Kiro si kipimo kya ttaka.",
                )
              : pick(
                  language,
                  "Use kilograms here, for example 600 kg. An area in acres cannot be saved as produce weight.",
                  "Kozesa kiro, ng'eky'okulabirako kiro 600. Eka si kipimo ky'obuzito bw'ebirime.",
                ),
        });
      if (state.step === "land") profile.landSizeAcres = numeric;
      else profile.quantityKg = numeric;
    }
  } else {
    if (value.length < 2)
      return append(next, {
        sender: "agribridge",
        text: pick(
          language,
          "Please add a little more detail, or use a sample reply below.",
          "Yongera ku bikwata ku nsonga oba londa eky'okulabirako wansi.",
        ),
      });
    profile[state.step] = value;
  }
  const nextStep: DemoStep =
    steps.at(steps.indexOf(state.step) + 1) || "review";
  next = { ...next, profile, step: nextStep };
  if (nextStep === "review")
    return append(
      next,
      {
        sender: "agribridge",
        kind: "profile",
        text: demoProfileSummary(profile, language),
      },
      { sender: "agribridge", text: stepQuestion("review", language) },
    );
  return append(next, {
    sender: "agribridge",
    text: stepQuestion(nextStep, language),
  });
}

export function reduceDemo(state: DemoState, action: DemoAction): DemoState {
  if (action.type === "reset") return createDemoState(state.language);
  if (action.type === "language") return createDemoState(action.language);
  if (action.type === "scenario")
    return scenarioExample(state, action.scenario);
  if (state.stopped) return state;
  if (action.type === "edit-profile") return createDemoState(state.language);
  if (action.type === "confirm-profile") {
    if (state.scenario !== "signup" || state.step !== "review") return state;
    const next = append(
      {
        ...state,
        step: "complete",
        profile: { ...state.profile, confirmed: true },
      },
      {
        sender: "farmer",
        text: pick(
          state.language,
          "Confirm sample profile",
          "Kakasa ebikwata ku nnimiro",
        ),
      },
    );
    return append(next, {
      sender: "agribridge",
      text: pick(
        state.language,
        "Your sample profile is ready. Your WhatsApp identity would be linked securely; a phone number would not prove land ownership or payment entitlement. Nothing has been registered in a real account.\n\nLet's explore a buyer introduction.",
        "Ebikwata ku nnimiro eby'okulabirako bitegekeddwa. Akawunti ya WhatsApp yandiyungiddwa mu ngeri entuufu; ennamba yokka tekakasa ttaka oba nsasula. Tewali akawunti ntuufu egguliddwa.\n\nKa tulabe engeri y'okufuna omuguzi.",
      ),
    });
  }
  if (action.type === "create-offer") {
    if (!state.profile.confirmed || state.offerCreated) return state;
    return append(
      { ...state, offerCreated: true },
      {
        sender: "farmer",
        text: pick(
          state.language,
          "Create my sample offer",
          "Kola ekiweebwayo kyange eky'okulabirako",
        ),
      },
      {
        sender: "agribridge",
        kind: "offer",
        text: pick(
          state.language,
          `Sample offer created\n\n${state.profile.businessName} · ${state.profile.crop} (${state.profile.variety})\n${amount(state.profile.quantityKg || 0)} kg · ${state.profile.community}\nHarvest: ${state.profile.harvest}\n\nThis stays in this demo. In the live service, you would confirm publication and a broker could help arrange the buyer conversation. Stock, price and quality would still need agreement.`,
          `Ekiweebwayo eky'okulabirako kikoleddwa\n\n${state.profile.businessName} · ${state.profile.crop} (${state.profile.variety})\nKiro ${amount(state.profile.quantityKg || 0)} · ${state.profile.community}\nOkukungula: ${state.profile.harvest}\n\nKino kisigala mu demo. Mu buweereza obutuufu, wandikakasizza okukiraga abaguzi. Obungi, omuwendo n'omutindo byetaaga okuteesebwako.`,
        ),
      },
    );
  }
  if (action.type === "confirm-payment") {
    if (state.scenario !== "payment" || state.payment !== "approved")
      return state;
    return append(
      { ...state, payment: "confirmed" },
      {
        sender: "agribridge",
        kind: "payment",
        paymentStatus: "confirmed",
        text: pick(
          state.language,
          "SAMPLE EVENT · Payment received\n\nOrder DEMO-001 · UGX 930,000\nExample provider reference: DEMO-PAY-001\n\nThis represents a verified provider confirmation of a client-to-seller payment. A delivered WhatsApp message alone cannot confirm money moved. No real transfer or notification has occurred.",
          "EKY'OKULABIRAKO · Ssente zifuniddwa\n\nDEMO-001 · UGX 930,000\nEnnamba y'okulabirako: DEMO-PAY-001\n\nKino kiraga okukakasa kw'omuweereza nti omuguzi asasudde omutunzi. Obubaka bwa WhatsApp obutuuse tebukakasa nti ssente zisindikiddwa. Tewali nsasula ntuufu ekoleddwa.",
        ),
      },
    );
  }
  const value = action.value
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, 160);
  if (!value) return state;
  if (/^(stop|unsubscribe|cancel alerts|komya)$/i.test(value))
    return append(
      { ...state, stopped: true },
      { sender: "farmer", text: value },
      {
        sender: "agribridge",
        text: pick(
          state.language,
          "Demo conversation paused. No alert subscription was created. Use Reset demo or choose a new example to continue. In the live service, STOP would withdraw the applicable messaging permission.",
          "Emboozi ya demo eyimiriziddwa. Tewali kwewandiisa kufuna bubaka kukoleddwa. Ddamu okutandika oba londa eky'okulabirako ekirala. Mu buweereza obutuufu, STOP ekomya olukusa lw'obubaka obukwatagana.",
        ),
      },
    );
  if (state.scenario === "signup")
    return signupReply(state, value, action.voice);
  const lower = value.toLocaleLowerCase();
  const inferred: DemoScenario | undefined = /weather|rain|obudde|enkuba/.test(
    lower,
  )
    ? "weather"
    : /storage|transport|logistic|entambula|okutereka/.test(lower)
      ? "logistics"
      : /input|seed|fertili|ensigo|ebigimusa/.test(lower)
        ? "inputs"
        : /buyer|market for|omuguzi|abaguzi/.test(lower)
          ? "buyers"
          : /price|emiwendo|muwendo/.test(lower)
            ? "prices"
            : undefined;
  if (inferred) {
    const example = scenarioExample(state, inferred);
    return {
      ...example,
      messages: [
        {
          ...example.messages[0],
          text: value,
          ...(action.voice ? { kind: "voice" as const } : {}),
        },
        ...example.messages.slice(1),
      ],
    };
  }
  return append(
    state,
    {
      sender: "farmer",
      text: value,
      ...(action.voice ? { kind: "voice" as const } : {}),
    },
    {
      sender: "agribridge",
      text: pick(
        state.language,
        "This preview uses a few scripted examples. Choose prices, buyers, weather, input costs or logistics below. A live service would clarify your question or bring in a person when needed.",
        "Demo eno erina eby'okulabirako ebitegekeddwa. Londa emiwendo, abaguzi, obudde, ebyetaago by'okulima oba entambula. Mu buweereza obutuufu, ttiimu yandikuyambye okunnyonnyola ekibuuzo.",
      ),
    },
  );
}

export function demoChoices(state: DemoState): DemoChoice[] {
  const language = state.language;
  if (state.stopped)
    return [
      {
        label: pick(language, "Restart demo", "Ddamu okutandika"),
        action: { type: "reset" },
      },
    ];
  const reply = (en: string, lg = en): DemoChoice => ({
    label: pick(language, en, lg),
    action: { type: "reply", value: pick(language, en, lg) },
  });
  if (state.scenario === "signup") {
    if (state.step === "name")
      return [reply("Demo farmer", "Omulimi w'okulabirako")];
    if (state.step === "businessName")
      return [reply("Demo Farm", "Ennimiro y'okulabirako")];
    if (state.step === "community")
      return [reply("Kiwoko, Nakaseke"), reply("Buwama, Mpigi")];
    if (state.step === "crop")
      return [reply("Maize", "Kasooli"), reply("Beans", "Ebijanjaalo")];
    if (state.step === "variety")
      return /maize|kasooli/i.test(state.profile.crop || "")
        ? [
            reply("White maize", "Kasooli omweru"),
            reply("Not sure yet", "Sinnakakasa"),
          ]
        : /beans|ebijanjaalo/i.test(state.profile.crop || "")
          ? [reply("Nambale"), reply("Not sure yet", "Sinnakakasa")]
          : [reply("Not sure yet", "Sinnakakasa")];
    if (state.step === "land")
      return [reply("3.5 acres", "3.5 eka"), reply("Skip for now", "Buuka")];
    if (state.step === "quantity")
      return [reply("600 kg", "600 kiro"), reply("1,500 kg", "1,500 kiro")];
    if (state.step === "harvest")
      return [
        reply("Ready in two weeks", "Mu wiiki bbiri"),
        reply("Ready now", "Byetegefu kati"),
      ];
    if (state.step === "review")
      return [
        {
          label: pick(language, "Confirm sample profile", "Kakasa"),
          action: { type: "confirm-profile" },
        },
        {
          label: pick(language, "Start again", "Ddamu okutandika"),
          action: { type: "edit-profile" },
        },
      ];
    return [
      {
        label: pick(language, "Find a buyer", "Funa omuguzi"),
        action: { type: "scenario", scenario: "buyers" },
      },
      {
        label: pick(language, "See produce prices", "Laba emiwendo"),
        action: { type: "scenario", scenario: "prices" },
      },
    ];
  }
  if (state.scenario === "payment")
    return state.payment === "approved"
      ? [
          {
            label: pick(
              language,
              "Show confirmed-payment example",
              "Laba ensasula ekakasiddwa",
            ),
            action: { type: "confirm-payment" },
          },
        ]
      : [
          {
            label: pick(
              language,
              "Explore buyer requests",
              "Laba ebyetaago by'abaguzi",
            ),
            action: { type: "scenario", scenario: "buyers" },
          },
        ];
  if (
    state.scenario === "buyers" &&
    state.profile.confirmed &&
    !state.offerCreated
  )
    return [
      {
        label: pick(
          language,
          "Create sample offer",
          "Kola ekiweebwayo eky'okulabirako",
        ),
        action: { type: "create-offer" },
      },
      {
        label: pick(
          language,
          "Check transport costs",
          "Kebera emiwendo gy'entambula",
        ),
        action: { type: "scenario", scenario: "logistics" },
      },
    ];
  if (state.scenario === "buyers" && !state.profile.confirmed)
    return [
      {
        label: pick(language, "Try farmer signup", "Gezaako okwewandiisa"),
        action: { type: "scenario", scenario: "signup" },
      },
      {
        label: pick(
          language,
          "Check transport costs",
          "Kebera emiwendo gy'entambula",
        ),
        action: { type: "scenario", scenario: "logistics" },
      },
    ];
  return [
    {
      label: pick(language, "Find a buyer", "Funa omuguzi"),
      action: { type: "scenario", scenario: "buyers" },
    },
    {
      label: pick(language, "See payment updates", "Laba ebikwata ku nsasula"),
      action: { type: "scenario", scenario: "payment" },
    },
  ];
}

export function demoVoiceExample(state: DemoState): string {
  if (state.scenario === "signup") {
    const choice = demoChoices(state)[0];
    if (choice?.action.type === "reply") return choice.action.value;
  }
  return pick(
    state.language,
    "What are maize prices near my community?",
    "Omuwendo gwa kasooli mu kitundu kyange guli gutya?",
  );
}
