import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Bell,
  Check,
  Link2,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { request } from "../lib/api";
import {
  Badge,
  Button,
  Empty,
  ErrorMessage,
  Field,
  Modal,
  Notice,
  Skeleton,
} from "./ui";
import { date, label, number } from "../lib/format";
import type {
  MarketOrder,
  MarketOrderStatus,
} from "../../server/market-orders";
import type { MarketPayment } from "../../server/market-payments";
import type { MarketCatalog } from "../../server/marketplace-types";
import type {
  MarketChannelProfile,
  MarketChannelSupply,
  MarketBuyerInquiry,
} from "../../server/market-conversation";

type Orders = {
  orders: MarketOrder[];
  pagination: { hasMore: boolean };
  capabilities: { checkoutEnabled: boolean; reason: string };
};
type Payments = {
  payments: MarketPayment[];
  notifications: { id: string; kind: string; body: string; status: string }[];
  capabilities: { providerConnected: boolean; reason: string };
};
type ChannelLink = {
  linked: boolean;
  maskedPhone?: string | null;
  paymentUpdatesEnabled: boolean;
};
type ChannelIntake = {
  registrations: { items: MarketChannelProfile[]; hasMore: boolean };
  supply: { items: MarketChannelSupply[]; hasMore: boolean };
  buying: { items: MarketBuyerInquiry[]; hasMore: boolean };
  status: { counts: Record<string, number> };
};
const confirmationCopy = {
  accepted: { title: "Accept", confirm: "Confirm acceptance" },
  cancelled: { title: "Cancel", confirm: "Confirm cancellation" },
  fulfilled: {
    title: "Record fulfillment for",
    confirm: "Confirm fulfillment",
  },
};

export function MarketConnections() {
  const { user, online, notify } = useApp();
  const staff = user?.role === "operator" || user?.role === "admin";
  const [orders, setOrders] = useState<Orders | null>(null);
  const [catalog, setCatalog] = useState<MarketCatalog | null>(null);
  const [payments, setPayments] = useState<Payments | null>(null);
  const [link, setLink] = useState<ChannelLink | null>(null);
  const [intake, setIntake] = useState<ChannelIntake | null>(null);
  const [challenge, setChallenge] = useState<{
    command: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [supplyId, setSupplyId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<{
    order: MarketOrder;
    status: Exclude<MarketOrderStatus, "requested">;
  } | null>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const load = useCallback(async () => {
    const values = await Promise.all([
      request<Orders>("/api/marketplace/orders"),
      request<MarketCatalog>("/api/marketplace/catalog"),
      request<Payments>("/api/marketplace/payments/overview"),
      request<ChannelLink>("/api/marketplace/channel-link"),
      staff
        ? request<ChannelIntake>("/api/marketplace/channel-registrations")
        : Promise.resolve(null),
    ]);
    if (!alive.current) return;
    setOrders(values[0]);
    setCatalog(values[1]);
    setPayments(values[2]);
    setLink(values[3]);
    setIntake(values[4]);
    setLoaded(true);
  }, [staff]);
  useEffect(() => {
    alive.current = true;
    if (online)
      void load().catch((e: Error) => {
        if (alive.current) setError(e.message);
      });
    return () => {
      alive.current = false;
    };
  }, [load, online]);
  async function run(
    action: string,
    work: () => Promise<unknown>,
    success?: string,
  ) {
    if (locked.current || !online) return;
    locked.current = true;
    setBusy(action);
    setError("");
    try {
      await work();
      await load();
      if (success) notify(success);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      locked.current = false;
      if (alive.current) setBusy("");
    }
  }
  const available =
    catalog?.supply.filter((item) => item.sellerId !== user?.id) ?? [];
  const selected = available.find((item) => item.id === supplyId);
  const consent = link?.paymentUpdatesEnabled ?? false;
  async function createOrder(e: FormEvent) {
    e.preventDefault();
    await run(
      "order",
      async () => {
        await request(
          "/api/marketplace/orders",
          "POST",
          { supplyId, quantityKg: Number(quantity), message },
          crypto.randomUUID(),
        );
        setSupplyId("");
        setQuantity("1");
        setMessage("");
      },
      "Your order request was recorded. The seller must confirm it.",
    );
  }
  if (!loaded && online && !error) return <Skeleton />;
  return (
    <div className="market-connections">
      <div className="market-section-heading">
        <div>
          <h2>From an introduction to a clear next step.</h2>
          <p>
            Record orders, agree quantities and follow payment events in one
            place.
          </p>
        </div>
        <Button
          variant="secondary"
          busy={busy === "refresh"}
          disabled={!online || !!busy}
          onClick={() => void run("refresh", async () => {})}
        >
          <RefreshCw size={16} /> Refresh
        </Button>
      </div>
      {!online && (
        <Notice tone="warning">
          Orders and payment updates need a connection. No new commitment is
          saved offline.
        </Notice>
      )}
      {error && <ErrorMessage message={error} />}
      {orders && !orders.capabilities.checkoutEnabled && (
        <Notice tone="info">
          Order requests are available. Online payment checkout will open after
          a direct-to-seller provider is connected. No money is collected here.
        </Notice>
      )}
      <section
        className="market-order-create"
        aria-labelledby="market-order-title"
      >
        <h3 id="market-order-title">Request produce from a community seller</h3>
        {available.length ? (
          <form onSubmit={createOrder} className="market-order-form">
            <Field label="Available produce">
              <select
                required
                aria-label="Available produce"
                value={supplyId}
                onChange={(e) => setSupplyId(e.target.value)}
                disabled={!!busy || !online}
              >
                <option value="">Choose a seller's listing</option>
                {available.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.crop} · {item.variety || "Variety to confirm"} ·{" "}
                    {item.sellerName} · {number(item.remainingQuantityKg)} kg
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity (kg)">
              <input
                required
                type="number"
                min="1"
                step="1"
                max={selected?.remainingQuantityKg ?? 10000000}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={!!busy || !online}
              />
            </Field>
            <Field label="Collection or delivery request">
              <input
                maxLength={600}
                value={message}
                placeholder="Destination, timing or a question for the seller"
                onChange={(e) => setMessage(e.target.value)}
                disabled={!!busy || !online}
              />
            </Field>
            <div className="market-order-summary">
              {selected
                ? selected.expectedPriceUgxPerKg === null
                  ? "Price needs a seller quote before acceptance."
                  : `Requested produce value: UGX ${number(Number(quantity || 0) * selected.expectedPriceUgxPerKg)}. Transport and other terms still need agreement.`
                : "Choose produce to review the seller's current terms."}
            </div>
            <Button
              type="submit"
              disabled={!supplyId || !!busy || !online}
              busy={busy === "order"}
            >
              Request order <ArrowRight size={16} />
            </Button>
          </form>
        ) : (
          <p className="market-help">
            There are no other available seller listings in this community
            workspace yet. Staff can coordinate a buyer introduction from Find
            buyers.
          </p>
        )}
        {catalog?.pagination.hasMore && (
          <p className="market-help">
            The first {catalog.supply.length} available listings are shown. Ask
            staff to help locate another seller.
          </p>
        )}
      </section>
      <section aria-labelledby="market-orders-title">
        <div className="market-section-heading">
          <h3 id="market-orders-title">Your orders</h3>
          <span>{orders?.orders.length ?? 0} recorded</span>
        </div>
        {orders?.orders.length ? (
          <div className="market-order-list">
            {orders.orders.map((order) => {
              const seller =
                user?.role !== "farmer" || order.sellerId === user?.id;
              return (
                <article key={order.id} className="market-order-row">
                  <div>
                    <div className="market-inline">
                      <h4>
                        {order.crop}
                        {order.variety ? ` · ${order.variety}` : ""}
                      </h4>
                      {order.sample && <Badge tone="amber">Sample</Badge>}
                      <Badge
                        tone={
                          order.status === "fulfilled" ? "green" : "neutral"
                        }
                      >
                        {label(order.status)}
                      </Badge>
                    </div>
                    <p>
                      {number(order.quantityKg)} kg ·{" "}
                      {order.sellerName || "Seller"} →{" "}
                      {order.buyerName || "Client"}
                    </p>
                    <p>
                      {order.totalUgx === null
                        ? "Price to agree"
                        : `UGX ${number(order.totalUgx)}`}{" "}
                      · {order.district} · Harvest {date(order.harvestFrom)}–
                      {date(order.harvestUntil)}
                    </p>
                    <small>
                      {order.status === "requested"
                        ? `Awaiting seller confirmation; request expires ${date(order.expiresAt)}.`
                        : order.status === "fulfilled"
                          ? "Fulfillment recorded. This does not establish payment."
                          : "Quantity and terms are recorded against this order."}
                    </small>
                  </div>
                  <div className="market-order-actions">
                    {seller && order.status === "requested" && (
                      <Button
                        variant="secondary"
                        disabled={!!busy || !online}
                        onClick={() =>
                          setPending({ order, status: "accepted" })
                        }
                      >
                        <Check size={15} /> Accept
                      </Button>
                    )}
                    {seller && order.status === "accepted" && (
                      <Button
                        variant="secondary"
                        disabled={!!busy || !online}
                        onClick={() =>
                          setPending({ order, status: "fulfilled" })
                        }
                      >
                        <PackageCheck size={15} /> Mark fulfilled
                      </Button>
                    )}
                    {((seller &&
                      ["requested", "accepted"].includes(order.status)) ||
                      (order.buyerId === user?.id &&
                        order.status === "requested")) && (
                      <Button
                        variant="ghost"
                        disabled={!!busy || !online}
                        onClick={() =>
                          setPending({ order, status: "cancelled" })
                        }
                      >
                        Cancel request
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Your next sale starts with a conversation."
            body="Buyer requests and seller confirmations will appear here. An introduction does not automatically create an order."
          />
        )}
        {orders?.pagination.hasMore && (
          <p className="market-help">
            Showing the most recent {orders.orders.length} orders. Additional
            records remain available through the paginated order API.
          </p>
        )}
        {pending && (
          <Modal
            title={`${confirmationCopy[pending.status].title} this ${pending.order.crop} order?`}
            onClose={() => {
              if (!busy) setPending(null);
            }}
          >
            <div className="market-confirm-action">
              {error && <ErrorMessage message={error} />}
              <p>
                {pending.status === "accepted"
                  ? `This commits ${number(pending.order.quantityKg)} kg at the recorded terms. No payment is taken.`
                  : pending.status === "fulfilled"
                    ? "Only confirm after the agreed produce handover. Fulfillment is separate from payment."
                    : "This releases an eligible commitment. Recorded payments may need reconciliation first."}
              </p>
              <Button
                disabled={!!busy || !online}
                busy={busy === pending.order.id}
                onClick={() =>
                  void run(
                    pending.order.id,
                    async () => {
                      await request(
                        `/api/marketplace/orders/${pending.order.id}`,
                        "PATCH",
                        {
                          version: pending.order.version,
                          status: pending.status,
                        },
                        crypto.randomUUID(),
                      );
                      setPending(null);
                    },
                    "Order updated.",
                  )
                }
              >
                {confirmationCopy[pending.status].confirm}
              </Button>
              <Button
                variant="ghost"
                disabled={!!busy}
                onClick={() => setPending(null)}
              >
                Keep current order
              </Button>
            </div>
          </Modal>
        )}
      </section>
      <section
        className="market-payment-updates"
        aria-labelledby="market-payment-title"
      >
        <div className="market-section-heading">
          <div>
            <h3 id="market-payment-title">
              Payment updates, with a clear record.
            </h3>
            <p>
              Clients pay sellers directly. Approval, transfer confirmation and
              message delivery have separate statuses.
            </p>
          </div>
          <Bell size={24} />
        </div>
        {payments?.notifications.length ? (
          payments.notifications.map((item) => (
            <article key={item.id} className="market-order-row">
              <p>{item.body}</p>
              <Badge>{label(item.status)}</Badge>
            </article>
          ))
        ) : (
          <p className="market-help">
            No verified payment updates have been recorded. A sale, receipt
            entry or fulfilled order alone cannot mark money as paid.
          </p>
        )}
        {payments?.payments.map((payment) => (
          <div className="market-payment-line" key={payment.id}>
            <span>
              UGX {number(payment.amountUgx)} · {payment.provider}
            </span>
            <Badge tone={payment.status === "succeeded" ? "green" : "neutral"}>
              {label(payment.status)}
            </Badge>
          </div>
        ))}
      </section>
      <section
        className="market-channel-link"
        aria-labelledby="market-link-title"
      >
        <Link2 size={24} />
        <div>
          <h3 id="market-link-title">Get payment updates on WhatsApp</h3>
          <p>
            Connect the WhatsApp account you control, then choose whether to
            receive payment notifications. Entering a phone number in your
            business profile does not connect it.
          </p>
          {link?.linked ? (
            <>
              <p>
                <Badge tone="green">Connected</Badge>{" "}
                {link.maskedPhone || "Verified WhatsApp account"}
              </p>
              <label className="market-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={!!busy || !online}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    void run(
                      "consent",
                      async () => {
                        await request(
                          "/api/marketplace/channel-link/consent",
                          "POST",
                          { enabled },
                          crypto.randomUUID(),
                        );
                      },
                      enabled
                        ? "Payment update permission saved."
                        : "Payment updates stopped.",
                    );
                  }}
                />
                <span>
                  Send me payment updates on WhatsApp when delivery is
                  available.
                </span>
              </label>
              <Button
                variant="ghost"
                disabled={!!busy || !online}
                onClick={() =>
                  void run(
                    "disconnect",
                    async () => {
                      await request(
                        "/api/marketplace/channel-link/disconnect",
                        "POST",
                        {},
                        crypto.randomUUID(),
                      );
                      setChallenge(null);
                    },
                    "WhatsApp disconnected.",
                  )
                }
              >
                Disconnect WhatsApp
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                busy={busy === "link"}
                disabled={!!busy || !online}
                onClick={() =>
                  void run("link", async () => {
                    const value = await request<{
                      command: string;
                      expiresAt: string;
                    }>(
                      "/api/marketplace/channel-link",
                      "POST",
                      {},
                      crypto.randomUUID(),
                    );
                    setChallenge(value);
                  })
                }
              >
                Connect WhatsApp
              </Button>
              {challenge && (
                <div className="market-link-command">
                  <p>
                    Send this private command to your configured Agribridge
                    WhatsApp number before{" "}
                    {new Date(challenge.expiresAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    :
                  </p>
                  <code>{challenge.command}</code>
                  <p>
                    After sending, refresh this page. Keep this command private.
                    Connection alone does not enable alerts.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </section>
      {staff && intake && (
        <section
          className="market-channel-intake"
          aria-labelledby="market-intake-title"
        >
          <div className="market-section-heading">
            <div>
              <h3 id="market-intake-title">From the WhatsApp market desk</h3>
              <p>
                Private, confirmed farmer registrations, produce availability
                and client purchasing inquiries for your team to follow up.
              </p>
            </div>
            <Link className="button button-secondary" to="/messages">
              Open staff inbox <ArrowRight size={16} />
            </Link>
          </div>
          {Object.entries(intake.status.counts).some(
            ([status, count]) =>
              ["failed", "uncertain"].includes(status) && count > 0,
          ) && (
            <Notice tone="warning">
              Some automated replies need staff review. Check delivery outcomes
              before sending another reply.
            </Notice>
          )}
          {intake.registrations.items.length ? (
            <div className="market-order-list">
              {intake.registrations.items.map((profile) => (
                <article className="market-order-row" key={profile.id}>
                  <div>
                    <h4>{profile.businessName}</h4>
                    <p>
                      {profile.name} · {profile.community}, {profile.district}
                    </p>
                    <small>
                      {profile.crops.join(", ")} ·{" "}
                      {profile.language === "lg" ? "Luganda" : "English"} ·
                      Confirmed {date(profile.confirmedAt)}
                    </small>
                  </div>
                  <Badge>Channel registration</Badge>
                </article>
              ))}
            </div>
          ) : (
            <p className="market-help">
              No confirmed WhatsApp registrations yet. Channel registration does
              not automatically create a web login or publish a listing.
            </p>
          )}
          {intake.supply.items.map((item) => (
            <article className="market-order-row" key={item.id}>
              <div>
                <div className="market-inline">
                  <h4>
                    {item.crop}
                    {item.variety ? ` · ${item.variety}` : ""}
                  </h4>
                  <Badge>{label(item.status)}</Badge>
                </div>
                <p>
                  {item.businessName} · {number(item.quantityKg)} kg ·{" "}
                  {item.community}, {item.district}
                </p>
                <small>
                  Ready {date(item.harvestFrom)}–{date(item.harvestUntil)}.
                  Confirm grade, price and buyer terms with the farmer.
                </small>
              </div>
              <div className="market-order-actions">
                {item.status === "submitted" && (
                  <Button
                    variant="secondary"
                    disabled={!!busy || !online}
                    onClick={() =>
                      void run(
                        item.id,
                        async () => {
                          await request(
                            `/api/marketplace/channel-supply/${item.id}`,
                            "PATCH",
                            {
                              expectedStatus: item.status,
                              status: "acknowledged",
                            },
                            crypto.randomUUID(),
                          );
                        },
                        "Produce inquiry acknowledged.",
                      )
                    }
                  >
                    Acknowledge
                  </Button>
                )}
                {item.status !== "closed" && (
                  <Button
                    variant="ghost"
                    disabled={!!busy || !online}
                    onClick={() =>
                      void run(
                        item.id,
                        async () => {
                          await request(
                            `/api/marketplace/channel-supply/${item.id}`,
                            "PATCH",
                            { expectedStatus: item.status, status: "closed" },
                            crypto.randomUUID(),
                          );
                        },
                        "Produce inquiry closed.",
                      )
                    }
                  >
                    Close inquiry
                  </Button>
                )}
              </div>
            </article>
          ))}
          <div className="market-section-heading">
            <div>
              <h4>Client purchasing inquiries</h4>
              <p>
                Confirmed requirements from WhatsApp. Contact the client through
                the staff inbox to agree the next step; these are not accepted
                orders.
              </p>
            </div>
          </div>
          {intake.buying.items.length ? (
            intake.buying.items.map((item) => (
              <article className="market-order-row" key={item.id}>
                <div>
                  <div className="market-inline">
                    <h4>
                      {item.crop}
                      {item.variety ? ` · ${item.variety}` : ""}
                    </h4>
                    <Badge>{label(item.status)}</Badge>
                  </div>
                  <p>
                    {item.businessName} · {item.buyerName} ·{" "}
                    {number(item.quantityKg)} kg
                  </p>
                  <p>
                    Destination: {item.district} · Required by{" "}
                    {date(item.needBy)}
                  </p>
                  <p>
                    {item.grade
                      ? `Requested quality: ${item.grade}`
                      : "Quality needs advice and seller confirmation."}
                  </p>
                  <small>
                    WhatsApp {item.phone} · Client confirmed{" "}
                    {date(item.confirmedAt)}. No stock reserved or payment
                    collected.
                  </small>
                  <details>
                    <summary>Confirmation reference</summary>
                    <p>Inquiry {item.id}</p>
                    <p>Incoming message {item.eventId}</p>
                    <p>
                      Match this WhatsApp number in the staff inbox before
                      replying. Acknowledging or closing does not send a
                      message.
                    </p>
                  </details>
                </div>
                <div className="market-order-actions">
                  {item.status === "submitted" && (
                    <Button
                      variant="secondary"
                      disabled={!!busy || !online}
                      onClick={() =>
                        void run(
                          item.id,
                          async () => {
                            await request(
                              `/api/marketplace/channel-buying/${item.id}`,
                              "PATCH",
                              {
                                expectedStatus: item.status,
                                status: "acknowledged",
                              },
                              crypto.randomUUID(),
                            );
                          },
                          "Purchasing inquiry acknowledged.",
                        )
                      }
                    >
                      Acknowledge
                    </Button>
                  )}
                  {item.status !== "closed" && (
                    <Button
                      variant="ghost"
                      disabled={!!busy || !online}
                      onClick={() =>
                        void run(
                          item.id,
                          async () => {
                            await request(
                              `/api/marketplace/channel-buying/${item.id}`,
                              "PATCH",
                              { expectedStatus: item.status, status: "closed" },
                              crypto.randomUUID(),
                            );
                          },
                          "Purchasing inquiry closed.",
                        )
                      }
                    >
                      Close inquiry
                    </Button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="market-help">
              No confirmed client purchasing inquiries yet. Clients can send BUY
              to the WhatsApp market desk once that channel is connected.
            </p>
          )}
          {(intake.registrations.hasMore ||
            intake.supply.hasMore ||
            intake.buying.hasMore) && (
            <p className="market-help">
              Showing the latest 50 records. Additional intake remains available
              through the staff API.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
