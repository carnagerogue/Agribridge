/** Browser-safe USSD menu logic. Personal records are never exposed through this menu. */
export const USSD_DISTRICTS = [
  "Kampala",
  "Wakiso",
  "Jinja",
  "Mbale",
  "Gulu",
  "Mbarara",
] as const;
export const USSD_CROPS = [
  "Maize",
  "Beans",
  "Coffee",
  "Cassava",
  "Banana",
  "Rice",
] as const;

export interface UssdServices {
  /** Return sourced, dated public information only. Undefined means unavailable. */
  weather?(district: string): Promise<string | undefined>;
  market?(district: string): Promise<string | undefined>;
  lesson?(crop: string): Promise<string | undefined>;
  /** Persist a single callback request; session identity supplied by the trusted bridge. */
  requestCallback?(): Promise<boolean>;
  /** Withdraw messaging consent for the caller. Must be durable. */
  optOut?(): Promise<boolean>;
}

export type UssdDecision =
  | { response: string }
  | { action: "weather" | "market" | "lesson"; value: string }
  | { action: "callback" | "stop" };

const HOME =
  "CON Agribridge\n1 Weather\n2 Market prices\n3 Learn to farm\n4 Request a call\n5 Stop alerts\n6 Privacy";
const choices = (heading: string, values: readonly string[]) =>
  `CON ${heading}\n${values.map((value, i) => `${i + 1} ${value}`).join("\n")}\n0 Home`;

/** Pure decision function, shared by provider callbacks and the UI's network-free preview. */
export function getUssdDecision(text: string): UssdDecision {
  if (typeof text !== "string" || text.length > 160 || !/^[0-9*]*$/.test(text))
    return { response: "END Invalid selection. Please dial again." };
  if (!text) return { response: HOME };
  const all = text.split("*");
  const lastHome = all.lastIndexOf("0");
  const parts = lastHome >= 0 ? all.slice(lastHome + 1) : all;
  if (!parts.length) return { response: HOME };
  const [main, option] = parts;
  if (parts.length > 2 || parts.some((part) => part.length !== 1))
    return { response: "END Invalid selection. Please dial again." };
  if (main === "1" || main === "2") {
    if (option === undefined)
      return { response: choices("Choose district", USSD_DISTRICTS) };
    const district = USSD_DISTRICTS[Number(option) - 1];
    return district
      ? { action: main === "1" ? "weather" : "market", value: district }
      : {
          response:
            "END District not listed. Request a support call from menu 4.",
        };
  }
  if (main === "3") {
    if (option === undefined)
      return { response: choices("Choose crop", USSD_CROPS) };
    const crop = USSD_CROPS[Number(option) - 1];
    return crop
      ? { action: "lesson", value: crop }
      : { response: "END Invalid crop. Please dial again." };
  }
  if (main === "4") {
    if (option === undefined)
      return {
        response:
          "CON Share your phone number with Agribridge support for one callback?\n1 Yes\n2 No\n0 Home",
      };
    if (option === "1") return { action: "callback" };
    return { response: "END No callback requested." };
  }
  if (main === "5") {
    if (option === undefined)
      return {
        response:
          "CON Stop SMS and WhatsApp alerts to this number?\n1 Yes, stop\n2 Keep alerts\n0 Home",
      };
    if (option === "1") return { action: "stop" };
    return { response: "END Preferences unchanged." };
  }
  if (main === "6" && option === undefined)
    return {
      response:
        "END Agribridge uses your number for requested support. Do not share health or financial details here. Menu 5 stops alerts.",
    };
  return { response: "END Invalid selection. Please dial again." };
}

function endWithPublicText(value: string | undefined, fallback: string) {
  const clean = value?.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  // Keep the complete provider response within conservative 160-character USSD limits.
  return `END ${clean ? (clean.length > 156 ? `${clean.slice(0, 153)}...` : clean) : fallback}`;
}

export async function resolveUssd(
  text: string,
  services: UssdServices = {},
): Promise<string> {
  const decision = getUssdDecision(text);
  if ("response" in decision) return decision.response;
  switch (decision.action) {
    case "weather":
      return endWithPublicText(
        await services.weather?.(decision.value),
        "Weather unavailable now. Please try later. Forecasts need a recent update.",
      );
    case "market":
      return endWithPublicText(
        await services.market?.(decision.value),
        "No verified market prices available for this district. Check with your buyer before selling.",
      );
    case "lesson":
      return endWithPublicText(
        await services.lesson?.(decision.value),
        "Reviewed field guide unavailable for this crop. Request a support call from menu 4.",
      );
    case "callback":
      return (await services.requestCallback?.())
        ? "END Callback request saved. Agribridge support will review it; a call time is not yet confirmed."
        : "END Callback service unavailable. Please try later.";
    case "stop":
      return (await services.optOut?.())
        ? "END Alerts stopped for this number. You can still request information from this menu."
        : "END Could not update alert preferences. Please try later or send STOP to our messaging number.";
  }
}
