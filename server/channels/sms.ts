const gsmBasic = new Set(
  Array.from(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
  ),
);
const gsmExtended = new Set(Array.from("\f^{}\\[~]|€"));

/** GSM-7 extension characters consume two septets; Unicode is measured in UTF-16 units. */
export function estimateSmsSegments(body: string): {
  encoding: "GSM-7" | "Unicode";
  units: number;
  segments: number;
} {
  let units = 0;
  for (const char of body) {
    if (gsmBasic.has(char)) units += 1;
    else if (gsmExtended.has(char)) units += 2;
    else
      return {
        encoding: "Unicode",
        units: body.length,
        segments:
          body.length === 0
            ? 0
            : body.length <= 70
              ? 1
              : Math.ceil(body.length / 67),
      };
  }
  return {
    encoding: "GSM-7",
    units,
    segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153),
  };
}

export function classifyInboundCommand(
  body: string,
): "stop" | "help" | "start" | "message" {
  const command = body.trim().toUpperCase();
  if (/^(STOP|UNSUBSCRIBE|CANCEL|END|QUIT)(?:\s|[!.]|$)/.test(command))
    return "stop";
  if (/^(HELP|MENU)(?:\s|[!.]|$)/.test(command)) return "help";
  if (/^(START|SUBSCRIBE)(?:\s|[!.]|$)/.test(command)) return "start";
  return "message";
}

export const INBOUND_HELP =
  "Agribridge: reply WEATHER + district, PRICE + crop, or LESSON + crop. Reply STOP to opt out. A support agent reviews requests; replies may take time.";
