import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronDown,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  ErrorMessage,
  Form,
  Modal,
  Notice,
  Skeleton,
} from "../ui";
import { request } from "../../lib/api";
import { marketDate, errorText } from "../../lib/marketplace";
import { label, number, ugx } from "../../lib/format";
import type {
  BuyerOrder,
  BuyerOrderStatus,
  BuyerOrdersResponse,
} from "../../../server/buyer-order-types";

const actions = {
  accepted: {
    title: "Accept this buyer order?",
    submit: "Confirm acceptance",
    body: "Confirm the quantity, grade, delivery arrangements and price with the buyer first. Acceptance commits this quantity so it cannot be promised to another buyer.",
  },
  cancelled: {
    title: "Cancel this buyer order?",
    submit: "Confirm cancellation",
    body: "This closes the request and releases any committed quantity. It does not issue a refund or record a payment.",
  },
  fulfilled: {
    title: "Record this order as fulfilled?",
    submit: "Confirm fulfillment",
    body: "Confirm the produce was handed over as agreed. Recording fulfillment does not confirm that payment was received.",
  },
};

/** Authenticated seller inbox, distinct from the public buyer's own session. */
export function SellerBuyerOrders({
  online,
  onChange,
}: {
  online: boolean;
  onChange: () => Promise<void>;
}) {
  const [result, setResult] = useState<BuyerOrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{
    order: BuyerOrder;
    status: Exclude<BuyerOrderStatus, "requested">;
  } | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const keys = useRef(new Map<string, string>());
  const load = useCallback(
    async (offset = 0) => {
      if (!online) {
        setLoading(false);
        return;
      }
      const current = ++generation.current;
      setRefreshing(true);
      setError("");
      try {
        const next = await request<BuyerOrdersResponse>(
          `/api/marketplace/buyer-orders?limit=25&offset=${offset}`,
        );
        if (!mounted.current || current !== generation.current) return;
        setResult((previous) =>
          offset && previous
            ? {
                ...next,
                orders: [
                  ...new Map(
                    [...previous.orders, ...next.orders].map((order) => [
                      order.id,
                      order,
                    ]),
                  ).values(),
                ],
              }
            : next,
        );
      } catch (failure) {
        if (mounted.current && current === generation.current)
          setError(errorText(failure));
      } finally {
        if (mounted.current && current === generation.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [online],
  );
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [load]);

  return (
    <section
      className="market-client-orders"
      aria-labelledby="market-client-orders-title"
    >
      <header className="market-client-orders-heading">
        <div>
          <h2 id="market-client-orders-title">
            Orders from purchasing clients
          </h2>
          <p>
            Requests from the public buyer marketplace. Review each request
            before committing your produce.
          </p>
        </div>
        <Button
          variant="ghost"
          aria-label="Refresh buyer orders"
          disabled={!online}
          busy={refreshing}
          onClick={() => void load()}
        >
          <RefreshCw size={17} />
        </Button>
      </header>
      {error ? <ErrorMessage message={error} /> : null}
      {loading ? (
        <Skeleton />
      ) : result?.orders.length ? (
        result.orders.map((order) => (
          <article key={order.id} className="market-client-order">
            <header>
              <div>
                <h3>
                  {order.crop}
                  {order.variety ? ` · ${order.variety}` : ""}
                </h3>
                <p>
                  {order.buyerBusinessName || order.buyerName}
                  {order.sample ? " · Sample order" : ""}
                </p>
              </div>
              <Badge
                tone={
                  order.status === "accepted" || order.status === "fulfilled"
                    ? "green"
                    : order.status === "requested"
                      ? "amber"
                      : "neutral"
                }
              >
                {label(order.status)}
              </Badge>
            </header>
            <dl>
              <div>
                <dt>Quantity</dt>
                <dd>{number(order.quantityKg)} kg</dd>
              </div>
              <div>
                <dt>Produce subtotal</dt>
                <dd>{ugx(order.totalUgx)}</dd>
              </div>
              <div>
                <dt>Delivery location</dt>
                <dd>{order.deliveryLocation}</dd>
              </div>
              <div>
                <dt>Requested delivery</dt>
                <dd>
                  {order.requestedDeliveryDate
                    ? marketDate(order.requestedDeliveryDate)
                    : "To be agreed"}
                </dd>
              </div>
              <div>
                <dt>Seller</dt>
                <dd>{order.sellerName}</dd>
              </div>
              <div>
                <dt>Order reference</dt>
                <dd>{order.id.slice(0, 8).toUpperCase()}</dd>
              </div>
            </dl>
            {order.message ? (
              <p className="market-client-order-message">{order.message}</p>
            ) : null}
            <footer>
              <small>
                {order.status === "requested"
                  ? `Request expires ${marketDate(order.expiresAt)}`
                  : "Payment is tracked separately from fulfillment."}
              </small>
              {order.status === "requested" || order.status === "accepted" ? (
                <Button
                  variant="ghost"
                  disabled={!online}
                  onClick={() =>
                    setConfirmation({ order, status: "cancelled" })
                  }
                >
                  Cancel order
                </Button>
              ) : null}
              {order.status === "requested" ? (
                <Button
                  disabled={!online}
                  onClick={() => setConfirmation({ order, status: "accepted" })}
                >
                  Review acceptance
                </Button>
              ) : null}
              {order.status === "accepted" ? (
                <Button
                  variant="secondary"
                  disabled={!online}
                  onClick={() =>
                    setConfirmation({ order, status: "fulfilled" })
                  }
                >
                  Record fulfillment
                </Button>
              ) : null}
            </footer>
          </article>
        ))
      ) : (
        <Empty
          icon={ShoppingBag}
          title="Your next buyer can find you here."
          body="Publish an available produce listing in My produce. Purchasing clients can find it on the web and send an order request for you to review."
          action={
            <Link className="button button-secondary" to="/buy">
              See the buyer marketplace <ArrowUpRight size={15} />
            </Link>
          }
        />
      )}
      {result?.pagination.hasMore ? (
        <Button
          variant="secondary"
          disabled={!online}
          busy={refreshing}
          onClick={() =>
            void load(result.pagination.offset + result.pagination.limit)
          }
        >
          Load more buyer orders <ChevronDown size={16} />
        </Button>
      ) : null}
      {result?.orders.length ? (
        <Notice>
          {result.capabilities.reason} Produce subtotals exclude transport,
          storage and other charges.
        </Notice>
      ) : null}
      {confirmation ? (
        <Modal
          title={actions[confirmation.status].title}
          description={`${number(confirmation.order.quantityKg)} kg ${confirmation.order.crop} · ${confirmation.order.buyerBusinessName || confirmation.order.buyerName}`}
          onClose={() => setConfirmation(null)}
        >
          <Form
            submitLabel={actions[confirmation.status].submit}
            onCancel={() => setConfirmation(null)}
            onSubmit={async () => {
              const { order, status } = confirmation;
              const body = { version: order.version, status };
              const fingerprint = `${order.id}:${JSON.stringify(body)}`;
              if (!keys.current.has(fingerprint))
                keys.current.set(fingerprint, crypto.randomUUID());
              try {
                await request(
                  `/api/marketplace/buyer-orders/${encodeURIComponent(order.id)}`,
                  "PATCH",
                  body,
                  keys.current.get(fingerprint),
                );
              } catch (failure) {
                await load();
                throw failure;
              }
              setConfirmation(null);
              await Promise.all([load(), onChange()]);
            }}
          >
            <Notice>{actions[confirmation.status].body}</Notice>
          </Form>
        </Modal>
      ) : null}
    </section>
  );
}
