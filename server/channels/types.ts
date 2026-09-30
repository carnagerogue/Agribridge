export type MessagingChannel = "sms" | "whatsapp";
export type DeliveryStatus =
  "queued" | "sent" | "delivered" | "failed" | "not_configured";
export type ChannelEnvironment = Record<string, string | undefined>;

export interface OutboundMessage {
  channel: MessagingChannel;
  to: string;
  body: string;
  /** The caller must persist this key before sending. Providers do not guarantee deduplication. */
  idempotencyKey: string;
  /** Host-verified authorization: recorded channel permission, or a direct WhatsApp support request within its service window. Never infer marketing permission from support requests. */
  consent: boolean;
  /** Trusted inbound webhook timestamp; never accept a client-supplied conversation window. */
  lastInboundAt?: string;
  template?: { name: string; languageCode: string; parameters?: string[] };
}

export interface OutboundResult {
  status: DeliveryStatus;
  providerId?: string;
  error?: string;
  retryable?: boolean;
  /** Timeout/network errors can happen after provider acceptance. Never automatically resend. */
  deliveryUncertain?: boolean;
}

export interface ProviderOptions {
  env?: ChannelEnvironment;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface InboundEvent {
  eventId: string;
  channel: MessagingChannel;
  provider: "africas_talking" | "meta";
  from: string;
  body: string;
  contentType?: "text" | "unsupported";
  command: "stop" | "help" | "start" | "message";
  occurredAt: string;
}

export interface DeliveryEvent {
  eventId: string;
  channel: MessagingChannel;
  provider: "africas_talking" | "meta";
  providerId: string;
  status: Exclude<DeliveryStatus, "not_configured">;
  occurredAt: string;
}

export interface UssdRequest {
  eventId: string;
  sessionId: string;
  from: string;
  serviceCode: string;
  text: string;
}

/**
 * Implement with durable, tenant-scoped event processing. Each handler must atomically
 * record eventId and its effects. Replays must return success without repeating effects.
 * USSD replays must return the originally persisted response. Throw on transient failure
 * so the provider retries; never acknowledge an event that was not persisted.
 */
export interface ChannelHandlers {
  handleInbound(event: InboundEvent): Promise<void>;
  handleDelivery(event: DeliveryEvent): Promise<void>;
  handleUssd(request: UssdRequest): Promise<string>;
}
