import { randomInt, randomUUID } from "node:crypto";
import type { Database, Queryable } from "./db.js";
import type { DeliveryEvent, InboundEvent } from "./channels/types.js";

export type MarketConversationLanguage = "en" | "lg";
export type MarketConversationState =
  | "menu"
  | "consent"
  | "name"
  | "business"
  | "community"
  | "district"
  | "crops"
  | "farm_size"
  | "confirm"
  | "supply_crop"
  | "supply_variety"
  | "supply_quantity"
  | "supply_from"
  | "supply_until"
  | "supply_confirm";
export type MarketInformationRequest = {
  kind: "buyers" | "inputs" | "transport" | "storage" | "prices" | "weather";
  query: string;
  crop?: string;
  district?: string;
};
export type MarketChannelProfile = {
  id: string;
  phone: string;
  name: string;
  businessName: string;
  community: string;
  district: string;
  crops: string[];
  farmSizeAcres: number | null;
  language: MarketConversationLanguage;
  version: number;
  confirmedAt: string;
  applicationAccountLinked: false;
};
export type MarketChannelSupply = {
  id: string;
  profileId: string;
  name: string;
  businessName: string;
  phone: string;
  crop: string;
  variety: string;
  quantityKg: number;
  harvestFrom: string;
  harvestUntil: string;
  district: string;
  community: string;
  status: "submitted" | "acknowledged" | "closed";
  createdAt: string;
};
export type MarketThread = {
  tenant_id: string;
  phone: string;
  language: MarketConversationLanguage;
  state: MarketConversationState;
  consented: boolean;
  paused: boolean;
  draft: Record<string, unknown>;
  version: number;
  last_event_at: Date | string | null;
};
export type MarketConversationJob = {
  id: string;
  tenant_id: string;
  phone: string;
  event_id: string;
  body: string | null;
  content_type: "text" | "unsupported";
  event_at: Date | string;
  kind: "message" | "handoff";
  status: string;
  reply_body: string | null;
  lease_token: string | null;
  sequence: number;
};
export type ConversationPreparation = {
  ready: boolean;
  information?: MarketInformationRequest;
  language?: MarketConversationLanguage;
  profile?: MarketChannelProfile | null;
};

const WINDOW = 24 * 60 * 60 * 1000;
const RETENTION = 30 * WINDOW;
const PENDING = "'queued','preparing','ready'";
export const marketConversationEnabled = (
  env: NodeJS.ProcessEnv = process.env,
) => env.MARKET_WHATSAPP_ENABLED === "true";
export const cleanMarketText = (value: string, maximum = 1600) =>
  value
    .replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,
      "",
    )
    .trim()
    .slice(0, maximum);
export const marketDay = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(now);
const text = (value: unknown) => (typeof value === "string" ? value : "");
const iso = (value: unknown) => new Date(String(value)).toISOString();
const dateOnly = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
const choose = (
  language: MarketConversationLanguage,
  en: string,
  lg: string,
) => (language === "lg" ? lg : en);
const consentPrompt = (language: MarketConversationLanguage) =>
  choose(
    language,
    "To register, we store your name, business, community, crops and optional land size for the Agribridge team. This does not open a web login or sign you up for alerts. Reply AGREE to continue, CANCEL to leave, or HUMAN for a person.",
    "Okwewandiisa, tutereka amannya go, bizinensi, ekyalo n'ebirime byo. Kino tekikuwandiisa ku bubaka obw'okulabula. Ddamu AGREE okukkiriza, CANCEL okuvaamu, oba HUMAN okufuna omuntu.",
  );
export const marketMenu = (language: MarketConversationLanguage = "en") =>
  choose(
    language,
    "Agribridge's automated market assistant. A person can help: HUMAN.\nREGISTER: business signup\nSELL: tell buyers about your produce\nBUYERS crop: active buyer requests\nPRICES crop district\nINPUTS item district\nTRANSPORT or STORAGE district\nWEATHER district\nLANGUAGE: English/Luganda\nSTOP: stop automation. Voice notes need a team member; automated speech is not active.",
    "Agribridge: omuyambi w'akatale. HUMAN: omuntu akuyambe.\nREGISTER: wewandiise\nSELL: tegeeza abaguzi ku birime byo\nBUYERS: abaguzi\nPRICES: emiwendo\nINPUTS: eby'okulima\nTRANSPORT: entambula\nSTORAGE: okutereka\nWEATHER: embeera y'obudde\nSTOP: komya obubaka. Obubaka bw'eddoboozi bwetaaga omuntu.",
  );

/** Call only inside a transaction deduplicating an authenticated provider callback. */
export async function enqueueMarketConversation(
  tx: Queryable,
  tenantId: string,
  event: InboundEvent,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<boolean> {
  if (event.channel !== "whatsapp" || event.provider !== "meta") return false;
  if (!marketConversationEnabled(env) && event.command !== "stop") return false;
  if (
    !/^\+[1-9]\d{7,14}$/.test(event.from) ||
    !event.eventId ||
    event.eventId.length > 256
  )
    return false;
  const reportedAt = new Date(event.occurredAt);
  if (
    !Number.isFinite(reportedAt.getTime()) ||
    reportedAt.getTime() > now.getTime() + 300_000
  )
    return false;
  const eventAt = new Date(Math.min(reportedAt.getTime(), now.getTime()));
  await tx.query(
    `INSERT INTO market_channel_threads(tenant_id,phone) VALUES($1,$2) ON CONFLICT DO NOTHING`,
    [tenantId, event.from],
  );
  const { rows } = await tx.query<MarketThread>(
    `SELECT * FROM market_channel_threads WHERE tenant_id=$1 AND phone=$2 FOR UPDATE`,
    [tenantId, event.from],
  );
  const thread = rows[0];
  const jobId = randomUUID();
  const old =
    thread.last_event_at &&
    new Date(thread.last_event_at).getTime() > eventAt.getTime();
  const expired = now.getTime() - eventAt.getTime() >= WINDOW;
  const added = await tx.query(
    `INSERT INTO market_conversation_jobs(id,tenant_id,phone,event_id,body,content_type,event_at,status,error_code,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(tenant_id,event_id) DO NOTHING RETURNING id`,
    [
      jobId,
      tenantId,
      event.from,
      event.eventId,
      cleanMarketText(event.body),
      event.contentType === "unsupported" ? "unsupported" : "text",
      eventAt.toISOString(),
      old ? "cancelled" : expired ? "expired" : "queued",
      old ? "out_of_order" : expired ? "service_window_expired" : null,
      new Date(eventAt.getTime() + RETENTION).toISOString(),
    ],
  );
  if (!added.rows.length || old || expired) return false;
  const body = event.body.trim().toLowerCase();
  const stop = event.command === "stop";
  const handoff =
    /^(human|person|staff|omuntu)$/.test(body) ||
    event.contentType === "unsupported";
  const resume = /^(menu|help|resume|register|signup|sign up|restart)$/.test(
    body,
  );
  await tx.query(
    `UPDATE market_channel_threads SET last_event_at=$3,last_event_id=$4,updated_at=$5,version=version+1 WHERE tenant_id=$1 AND phone=$2`,
    [
      tenantId,
      event.from,
      eventAt.toISOString(),
      event.eventId,
      now.toISOString(),
    ],
  );
  if (stop || handoff) {
    await tx.query(
      `UPDATE market_channel_threads SET paused=true,consented=CASE WHEN $3 THEN false ELSE consented END,state=CASE WHEN $3 THEN 'menu' ELSE state END,draft=CASE WHEN $3 THEN '{}'::jsonb ELSE draft END WHERE tenant_id=$1 AND phone=$2`,
      [tenantId, event.from, stop],
    );
    await tx.query(
      `UPDATE market_conversation_jobs SET status='cancelled',error_code=$3,lease_token=NULL,lease_until=NULL,updated_at=$4 WHERE tenant_id=$1 AND phone=$2 AND status IN (${PENDING})`,
      [
        tenantId,
        event.from,
        stop ? "stopped" : "human_handover",
        now.toISOString(),
      ],
    );
    if (handoff)
      await tx.query(
        `UPDATE market_conversation_jobs SET kind='handoff',status='ready',reply_body=$2,error_code=NULL WHERE id=$1`,
        [
          jobId,
          event.contentType === "unsupported"
            ? "Your voice note or picture needs a team member. Automated audio/image understanding is not active. The Agribridge support team can review your request in their inbox."
            : "An Agribridge team member can help in the staff inbox. Automated replies are paused. Reply RESUME if you want the automated menu again.",
        ],
      );
    return true;
  }
  if (thread.paused && !resume) {
    await tx.query(
      `UPDATE market_conversation_jobs SET status='cancelled',error_code='automation_paused' WHERE id=$1`,
      [jobId],
    );
    return true;
  }
  if (resume)
    await tx.query(
      `UPDATE market_channel_threads SET paused=false WHERE tenant_id=$1 AND phone=$2`,
      [tenantId, event.from],
    );
  return true;
}

export async function getMarketChannelProfile(
  db: Queryable,
  tenantId: string,
  phone: string,
): Promise<MarketChannelProfile | null> {
  const { rows } = await db.query<any>(
    `SELECT * FROM market_channel_profiles WHERE tenant_id=$1 AND phone=$2`,
    [tenantId, phone],
  );
  return rows[0] ? profileView(rows[0]) : null;
}
function profileView(row: any): MarketChannelProfile {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    businessName: row.business_name,
    community: row.community,
    district: row.district,
    crops: row.crops,
    farmSizeAcres:
      row.farm_size_acres === null ? null : Number(row.farm_size_acres),
    language: row.language,
    version: row.version,
    confirmedAt: iso(row.confirmed_at),
    applicationAccountLinked: false,
  };
}
const page = (limit = 50, offset = 0) => [
  Math.max(1, Math.min(100, Math.trunc(limit) || 50)),
  Math.max(0, Math.trunc(offset) || 0),
];
/** Private staff data. The HTTP caller must enforce operator/admin authorization. */
export async function listMarketChannelRegistrations(
  db: Queryable,
  tenantId: string,
  limit = 50,
  offset = 0,
) {
  const [size, start] = page(limit, offset);
  const { rows } = await db.query<any>(
    `SELECT * FROM market_channel_profiles WHERE tenant_id=$1 ORDER BY confirmed_at DESC,id LIMIT $2 OFFSET $3`,
    [tenantId, size + 1, start],
  );
  return {
    items: rows.slice(0, size).map(profileView),
    limit: size,
    offset: start,
    hasMore: rows.length > size,
  };
}
/** Private staff data. Channel submissions are inquiries, not accepted stock/orders. */
export async function listMarketChannelSupply(
  db: Queryable,
  tenantId: string,
  limit = 50,
  offset = 0,
) {
  const [size, start] = page(limit, offset);
  const { rows } = await db.query<any>(
    `SELECT s.*,p.phone,p.name,p.business_name FROM market_channel_supply s JOIN market_channel_profiles p ON p.tenant_id=s.tenant_id AND p.id=s.profile_id WHERE s.tenant_id=$1 ORDER BY s.created_at DESC,s.id LIMIT $2 OFFSET $3`,
    [tenantId, size + 1, start],
  );
  const items: MarketChannelSupply[] = rows.slice(0, size).map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    businessName: row.business_name,
    phone: row.phone,
    crop: row.crop,
    variety: row.variety,
    quantityKg: Number(row.quantity_kg),
    harvestFrom: dateOnly(row.harvest_from),
    harvestUntil: dateOnly(row.harvest_until),
    district: row.district,
    community: row.community,
    status: row.status,
    createdAt: iso(row.created_at),
  }));
  return { items, limit: size, offset: start, hasMore: rows.length > size };
}
export async function marketConversationStatus(
  db: Queryable,
  tenantId: string,
) {
  const { rows } = await db.query<{ status: string; count: number }>(
    `SELECT status,count(*)::integer AS count FROM market_conversation_jobs WHERE tenant_id=$1 GROUP BY status`,
    [tenantId],
  );
  return {
    counts: Object.fromEntries(rows.map((row) => [row.status, row.count])),
  };
}

export const listMarketConversationStatus = marketConversationStatus;

/** Verified callback only. Delivery receipt state never downgrades delivered. */
export async function applyMarketConversationDelivery(
  tx: Queryable,
  tenantId: string,
  event: DeliveryEvent,
) {
  if (event.channel !== "whatsapp") return;
  await tx.query(
    `UPDATE market_conversation_jobs SET status=CASE WHEN status='delivered' THEN status WHEN $3='delivered' THEN 'delivered' WHEN status='failed' AND $3 IN ('sent','queued') THEN status WHEN $3='failed' THEN 'failed' ELSE 'sent' END,error_code=CASE WHEN $3='failed' THEN 'provider_delivery_failed' ELSE NULL END,lease_token=NULL,lease_until=NULL,updated_at=$4 WHERE tenant_id=$1 AND provider_id=$2`,
    [tenantId, event.providerId, event.status, event.occurredAt],
  );
}

type Turn = {
  reply: string;
  state: MarketConversationState;
  draft: Record<string, unknown>;
  consented?: boolean;
  pause?: boolean;
  saveProfile?: boolean;
  saveSupply?: boolean;
  information?: MarketInformationRequest;
  language?: MarketConversationLanguage;
};
function prompt(
  state: MarketConversationState,
  language: MarketConversationLanguage,
): string {
  const en: Partial<Record<MarketConversationState, string>> = {
    consent: consentPrompt(language),
    name: "What name should the Agribridge team use for you?",
    business:
      "What is your farm, business or cooperative called? Reply SAME to use your name.",
    community: "Which community or village is your farm in?",
    district: "Which district is that community in?",
    crops:
      "Which crops or varieties do you grow? Separate up to 10 names with commas.",
    farm_size:
      "What is the farm size in acres? Send a number, or SKIP. This is self-reported, not proof of land ownership.",
    supply_crop: "Which crop do you have available to sell?",
    supply_variety: "Which variety? Reply UNKNOWN if you do not know.",
    supply_quantity:
      "How many kilograms (kg) are available? Send a number. We will read it back before saving.",
    supply_from:
      "When will this produce be available? Use YYYY-MM-DD, for example 2027-01-20.",
    supply_until:
      "Until what date can you supply it? Use YYYY-MM-DD. This must be on or after the first date.",
  };
  const lg: Partial<Record<MarketConversationState, string>> = {
    name: "Amannya go?",
    business:
      "Erinnya ly'ennimiro oba bizinensi yo? Ddamu SAME okukozesa amannya go.",
    community: "Ennimiro yo eri ku kyalo ki?",
    district: "Disitulikiti ya ki?",
    crops: "Olima birime ki? Wandiika amannya gaabyo, ogaawule ne koma.",
    farm_size: "Ennimiro yo eri yiika mmeka? Wandiika ennamba oba SKIP.",
    supply_crop: "Kirime ki ky'oyagala okutunda?",
    supply_variety: "Kika ki? Bw'oba tomanyi, ddamu UNKNOWN.",
    supply_quantity: "Kilo mmeka z'olina okutunda? Wandiika ennamba.",
    supply_from: "Oyinza okutandika okutunda ddi? Kozesa YYYY-MM-DD.",
    supply_until: "Oyinza okutunda okutuusa ddi? Kozesa YYYY-MM-DD.",
  };
  return (
    (language === "lg" ? lg[state] : undefined) ??
    en[state] ??
    marketMenu(language)
  );
}
function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function summarize(
  draft: Record<string, unknown>,
  language: MarketConversationLanguage,
  supply: boolean,
): string {
  const rows = supply
    ? [
        `Crop: ${text(draft.crop)}`,
        `Variety: ${text(draft.variety) || "not recorded"}`,
        `Quantity: ${draft.quantityKg} kg`,
        `Available: ${draft.harvestFrom} to ${draft.harvestUntil}`,
        `Community/district: ${draft.community}, ${draft.district}`,
      ]
    : [
        `Name: ${text(draft.name)}`,
        `Business: ${text(draft.businessName)}`,
        `Community/district: ${text(draft.community)}, ${text(draft.district)}`,
        `Crops: ${(draft.crops as string[]).join(", ")}`,
        `Farm size: ${draft.farmSizeAcres === null ? "not recorded" : `${draft.farmSizeAcres} acres`}`,
      ];
  return `${choose(language, "Please check these details:", "Kakasa ebikwata ku nnimiro yo:")}\n${rows.join("\n")}\n${choose(language, "To save only these details, reply", "Okutereka bino byokka, ddamu")} CONFIRM ${draft.confirmationToken}. ${supply ? "This submits an inquiry; it does not confirm a sale or price." : "This registers a private channel profile, not a web login or public listing."} RESTART: correct details. HUMAN: a person.`;
}

function nextTurn(
  thread: MarketThread,
  body: string,
  profile: MarketChannelProfile | null,
  env: NodeJS.ProcessEnv,
  now: Date,
): Turn {
  const lower = body.toLowerCase().trim();
  const language = thread.language;
  const base = { state: thread.state, draft: thread.draft };
  const information =
    /^(buyers?|prices?|inputs?|transport|storage|weather)(?:\s|$)/i.exec(body);
  if (information) {
    const requested = information[1].toLowerCase();
    const kind = (
      requested === "buyer"
        ? "buyers"
        : requested === "price"
          ? "prices"
          : requested === "input"
            ? "inputs"
            : requested
    ) as MarketInformationRequest["kind"];
    return {
      ...base,
      reply: "",
      information: {
        kind,
        query: cleanMarketText(body, 600),
        crop: profile?.crops.length === 1 ? profile.crops[0] : undefined,
        district: profile?.district,
      },
    };
  }
  if (
    /^(language|english|luganda)$/.test(lower) ||
    (thread.state === "menu" && /^(1|2)$/.test(lower))
  ) {
    if (lower === "language")
      return {
        ...base,
        reply:
          "Reply ENGLISH or LUGANDA. Automated Luganda menus require local review; a team member can assist if they are not active.",
      };
    if (lower === "luganda" || lower === "2") {
      if (env.MARKET_LUGANDA_REVIEWED !== "true")
        return {
          ...base,
          reply:
            "A Luganda-speaking team member can help. Automated Luganda and spoken replies have not been locally verified, so automation is paused. Reply RESUME for the English menu.",
          pause: true,
        };
      return {
        ...base,
        language: "lg",
        reply: `${marketMenu("lg")}\n${thread.state !== "menu" ? prompt(thread.state, "lg") : ""}`,
      };
    }
    return {
      ...base,
      language: "en",
      reply:
        thread.state === "menu" ? marketMenu("en") : prompt(thread.state, "en"),
    };
  }
  if (/^(cancel|menu|help|resume)$/.test(lower))
    return {
      reply: marketMenu(language),
      state: lower === "cancel" ? "menu" : thread.state,
      draft: lower === "cancel" ? {} : thread.draft,
    };
  if (
    /^(register|signup|sign up)$/.test(lower) ||
    (lower === "restart" && !thread.state.startsWith("supply_"))
  )
    return {
      reply: consentPrompt(language),
      state: "consent",
      draft: {},
      consented: false,
    };
  if (
    /^(sell|supply)$/.test(lower) ||
    (lower === "restart" && thread.state.startsWith("supply_"))
  ) {
    if (!profile)
      return {
        reply:
          "First register your business with REGISTER. We will confirm the profile before recording produce for buyers.",
        state: "menu",
        draft: {},
      };
    return {
      reply: prompt("supply_crop", language),
      state: "supply_crop",
      draft: {
        profileId: profile.id,
        district: profile.district,
        community: profile.community,
      },
    };
  }
  if (
    /^confirm(?:\s|$)/.test(lower) &&
    !["confirm", "supply_confirm"].includes(thread.state)
  )
    return {
      ...base,
      reply: `There are no matching details ready for that confirmation. ${prompt(thread.state, language)}`,
    };
  if (thread.state === "menu")
    return { reply: marketMenu(language), state: "menu", draft: {} };
  if (thread.state === "consent")
    return lower === "agree"
      ? {
          reply: prompt("name", language),
          state: "name",
          draft: {},
          consented: true,
        }
      : { ...base, reply: consentPrompt(language) };
  if (!thread.consented)
    return { reply: consentPrompt(language), state: "consent", draft: {} };
  const draft = { ...thread.draft };
  const field = (
    key: string,
    state: MarketConversationState,
    value: unknown,
  ): Turn => ({
    reply: prompt(state, language),
    state,
    draft: { ...draft, [key]: value },
  });
  if (thread.state === "name")
    return body.length < 2 || body.length > 100
      ? {
          ...base,
          reply:
            "Please use a name between 2 and 100 characters, or HUMAN for help.",
        }
      : field("name", "business", body);
  if (thread.state === "business")
    return body.length < 2 || body.length > 120
      ? {
          ...base,
          reply: "Please use a business name between 2 and 120 characters.",
        }
      : field(
          "businessName",
          "community",
          lower === "same" ? draft.name : body,
        );
  if (thread.state === "community")
    return body.length < 2 || body.length > 100
      ? {
          ...base,
          reply:
            "Please send a community/village name between 2 and 100 characters.",
        }
      : field("community", "district", body);
  if (thread.state === "district")
    return body.length < 2 || body.length > 100
      ? {
          ...base,
          reply: "Please send a district name between 2 and 100 characters.",
        }
      : field("district", "crops", body);
  if (thread.state === "crops") {
    const crops = [
      ...new Set(
        body
          .split(",")
          .map((crop) => crop.trim())
          .filter(Boolean),
      ),
    ];
    return crops.length < 1 ||
      crops.length > 10 ||
      crops.some((crop) => crop.length < 2 || crop.length > 60)
      ? {
          ...base,
          reply:
            "Send 1–10 crop/variety names, separated with commas, each 2–60 characters.",
        }
      : field("crops", "farm_size", crops);
  }
  if (thread.state === "farm_size") {
    const amount =
      lower === "skip"
        ? null
        : /^\d+(?:\.\d{1,4})?$/.test(body)
          ? Number(body)
          : NaN;
    if (
      amount !== null &&
      (!Number.isFinite(amount) || amount <= 0 || amount > 100000)
    )
      return {
        ...base,
        reply:
          "Send the size as a positive number of acres, or SKIP. We cannot safely assume another unit.",
      };
    const summary = {
      ...draft,
      farmSizeAcres: amount,
      confirmationToken: `${thread.version}-${randomInt(1000, 10000)}`,
      confirmationExpiresAt: new Date(now.getTime() + WINDOW).toISOString(),
    };
    return {
      reply: summarize(summary, language, false),
      state: "confirm",
      draft: summary,
    };
  }
  if (thread.state === "supply_crop")
    return body.length < 2 || body.length > 60
      ? { ...base, reply: "Send a crop name between 2 and 60 characters." }
      : field("crop", "supply_variety", body);
  if (thread.state === "supply_variety")
    return body.length < 2 || body.length > 60
      ? {
          ...base,
          reply: "Send a variety name between 2 and 60 characters, or UNKNOWN.",
        }
      : field("variety", "supply_quantity", lower === "unknown" ? "" : body);
  if (thread.state === "supply_quantity") {
    const amount = /^\d+(?:\.\d{1,3})?$/.test(body) ? Number(body) : NaN;
    return !Number.isFinite(amount) || amount <= 0 || amount > 100000000
      ? {
          ...base,
          reply:
            "Please send a positive number of kilograms, up to 100,000,000 kg. If you only know bags or another unit, ask HUMAN so the team can confirm the weight.",
        }
      : field("quantityKg", "supply_from", amount);
  }
  if (thread.state === "supply_from")
    return !validDate(body)
      ? { ...base, reply: prompt("supply_from", language) }
      : field("harvestFrom", "supply_until", body);
  if (thread.state === "supply_until") {
    if (
      !validDate(body) ||
      body < text(draft.harvestFrom) ||
      body < marketDay(now)
    )
      return {
        ...base,
        reply:
          "Please send a real YYYY-MM-DD date, on or after the first availability date and today.",
      };
    const summary = {
      ...draft,
      harvestUntil: body,
      confirmationToken: `${thread.version}-${randomInt(1000, 10000)}`,
      confirmationExpiresAt: new Date(now.getTime() + WINDOW).toISOString(),
    };
    return {
      reply: summarize(summary, language, true),
      state: "supply_confirm",
      draft: summary,
    };
  }
  if (thread.state === "confirm" || thread.state === "supply_confirm") {
    if (Date.parse(text(draft.confirmationExpiresAt)) <= now.getTime())
      return {
        reply:
          "That confirmation expired. Reply RESTART to review fresh details before saving.",
        state: thread.state,
        draft,
      };
    if (lower !== `confirm ${draft.confirmationToken}`)
      return {
        ...base,
        reply: summarize(draft, language, thread.state === "supply_confirm"),
      };
    return {
      reply:
        thread.state === "confirm"
          ? "Your business profile is registered with the Agribridge team. This is not a web login or public listing. Reply SELL to share available produce, BUYERS with a crop, or MENU."
          : "Your produce inquiry is saved for the Agribridge team. It is not yet a published listing, accepted sale, guaranteed buyer or agreed price. The team can help connect you with a real buyer.",
      state: "menu",
      draft: {},
      saveProfile: thread.state === "confirm",
      saveSupply: thread.state === "supply_confirm",
    };
  }
  return { reply: marketMenu(language), state: "menu", draft: {} };
}

/** Prepare exactly one leased job. No external requests or provider sends occur here. */
export async function prepareMarketConversationJob(
  db: Database,
  job: MarketConversationJob,
  env: NodeJS.ProcessEnv,
  now: Date,
): Promise<ConversationPreparation> {
  return db.transaction(async (tx) => {
    await tx.query(
      `SELECT from_number FROM whatsapp_threads WHERE tenant_id=$1 AND from_number=$2 FOR UPDATE`,
      [job.tenant_id, job.phone],
    );
    const current = (
      await tx.query<MarketConversationJob>(
        `SELECT * FROM market_conversation_jobs WHERE id=$1 AND status='preparing' AND lease_token=$2 FOR UPDATE`,
        [job.id, job.lease_token],
      )
    ).rows[0];
    if (!current) return { ready: false };
    const thread = (
      await tx.query<MarketThread>(
        `SELECT * FROM market_channel_threads WHERE tenant_id=$1 AND phone=$2 FOR UPDATE`,
        [job.tenant_id, job.phone],
      )
    ).rows[0];
    if (thread.paused) {
      await tx.query(
        `UPDATE market_conversation_jobs SET status='cancelled',error_code='automation_paused',lease_token=NULL,lease_until=NULL WHERE id=$1`,
        [job.id],
      );
      return { ready: false };
    }
    const profile = await getMarketChannelProfile(tx, job.tenant_id, job.phone);
    const turn = nextTurn(
      thread,
      cleanMarketText(current.body ?? ""),
      profile,
      env,
      now,
    );
    if (turn.information)
      return {
        ready: false,
        information: turn.information,
        language: thread.language,
        profile,
      };
    if (turn.saveProfile) {
      const d = thread.draft;
      await tx.query(
        `INSERT INTO market_channel_profiles(id,tenant_id,phone,name,business_name,community,district,crops,farm_size_acres,language,confirmed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(tenant_id,phone) DO UPDATE SET name=excluded.name,business_name=excluded.business_name,community=excluded.community,district=excluded.district,crops=excluded.crops,farm_size_acres=excluded.farm_size_acres,language=excluded.language,confirmed_at=excluded.confirmed_at,updated_at=excluded.confirmed_at,version=market_channel_profiles.version+1`,
        [
          randomUUID(),
          job.tenant_id,
          job.phone,
          d.name,
          d.businessName,
          d.community,
          d.district,
          d.crops,
          d.farmSizeAcres,
          thread.language,
          now.toISOString(),
        ],
      );
    }
    if (turn.saveSupply) {
      const d = thread.draft;
      if (!profile || profile.id !== d.profileId)
        throw new Error("Market channel supply identity mismatch");
      await tx.query(
        `INSERT INTO market_channel_supply(id,tenant_id,profile_id,event_id,crop,variety,quantity_kg,harvest_from,harvest_until,district,community) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(tenant_id,event_id) DO NOTHING`,
        [
          randomUUID(),
          job.tenant_id,
          profile.id,
          job.event_id,
          d.crop,
          d.variety,
          d.quantityKg,
          d.harvestFrom,
          d.harvestUntil,
          d.district,
          d.community,
        ],
      );
    }
    await tx.query(
      `UPDATE market_channel_threads SET state=$3,draft=$4::jsonb,consented=coalesce($5,consented),paused=coalesce($6,paused),language=coalesce($7,language),version=version+1,updated_at=$8 WHERE tenant_id=$1 AND phone=$2`,
      [
        job.tenant_id,
        job.phone,
        turn.state,
        JSON.stringify(turn.draft),
        turn.consented ?? null,
        turn.pause ?? null,
        turn.language ?? null,
        now.toISOString(),
      ],
    );
    await tx.query(
      `UPDATE market_conversation_jobs SET status='ready',reply_body=$2,kind=CASE WHEN $4 THEN 'handoff' ELSE kind END,lease_token=NULL,lease_until=NULL,updated_at=$3 WHERE id=$1`,
      [
        job.id,
        cleanMarketText(turn.reply),
        now.toISOString(),
        turn.pause === true,
      ],
    );
    return { ready: true };
  });
}
