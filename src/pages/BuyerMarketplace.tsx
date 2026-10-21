import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bean,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  Coffee,
  CreditCard,
  Handshake,
  Leaf,
  LoaderCircle,
  MapPin,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sprout,
  Truck,
  UserRound,
  Wheat,
  WifiOff,
  X,
} from "lucide-react";
import { Button, ErrorMessage } from "../components/ui";
import {
  BuyerAccountDialog,
  BuyerAuthDialog,
  BuyerConfirmation,
  BuyerOrderDialog,
} from "../components/marketplace/BuyerForms";
import type {
  BuyerAccount,
  BuyerCatalogResponse,
  BuyerListing,
} from "../../server/buyer-types";
import type {
  BuyerOrder,
  BuyerOrdersResponse,
  BuyerOrderStatus,
} from "../../server/buyer-order-types";
import {
  authenticateBuyer,
  BuyerApiError,
  cancelBuyerOrder,
  createBuyerOrder,
  readBuyerCatalog,
  readBuyerOrders,
  readBuyerSession,
  signOutBuyer,
  type BuyerOrderInput,
  type BuyerSignup,
} from "../lib/buyer-api";
import {
  buyerCatalogQuery,
  buyerDate,
  buyerFlowReducer,
  buyerIntentKey,
  buyerMoney,
  buyerNumber,
  emptyBuyerFilters,
  emptyBuyerFlow,
  mergeBuyerRows,
  type BuyerFilters,
} from "../lib/buyer-marketplace";
import {
  filterSampleBuyerListings,
  sampleBuyer,
  sampleBuyerListings,
  submitBuyerRequest,
} from "../lib/buyer-samples";
import "../styles/buyer-marketplace.css";

const orderLabels: Record<BuyerOrderStatus, string> = {
  requested: "Request sent",
  accepted: "Seller accepted",
  fulfilled: "Completed",
  cancelled: "Cancelled",
};
const cropSuggestions = [
  "Maize",
  "Beans",
  "Coffee",
  "Cassava",
  "Rice",
  "Bananas",
  "Tomatoes",
  "Potatoes",
  "Groundnuts",
];
const messageFor = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "This could not be completed. Please try again.";

function ProduceCard({
  listing,
  onSelect,
  disabled,
}: {
  listing: BuyerListing;
  onSelect: () => void;
  disabled: boolean;
}) {
  const Icon = /coffee/i.test(listing.crop)
    ? Coffee
    : /bean/i.test(listing.crop)
      ? Bean
      : /maize|rice|wheat/i.test(listing.crop)
        ? Wheat
        : Leaf;
  const tone = /bean/i.test(listing.crop)
    ? "bean"
    : /coffee/i.test(listing.crop)
      ? "coffee"
      : "grain";
  return (
    <article className={`buyer-produce-card buyer-produce-${tone}`}>
      <div className="buyer-produce-cover">
        <span>
          <MapPin size={13} />
          {listing.district}
        </span>
        <Icon size={58} strokeWidth={1.15} aria-hidden="true" />
        <span>{listing.sample ? "SAMPLE" : "FARM & CO-OP PRODUCE"}</span>
      </div>
      <div className="buyer-produce-body">
        <p className="buyer-seller">
          <Building2 size={12} />
          {listing.sellerName}
        </p>
        <h3>{listing.variety || listing.crop}</h3>
        {listing.variety && <p className="buyer-crop-type">{listing.crop}</p>}
        <p className="buyer-produce-price">
          {listing.priceUgxPerKg === null ? (
            <span>Price to be agreed</span>
          ) : (
            <>
              <strong>{buyerMoney(listing.priceUgxPerKg)}</strong>
              <span>/ kg</span>
            </>
          )}
        </p>
        <dl className="buyer-produce-facts">
          <div>
            <dt>Available</dt>
            <dd>{buyerNumber(listing.availableQuantityKg)} kg</dd>
          </div>
          <div>
            <dt>Grade</dt>
            <dd>{listing.grade || "Not supplied"}</dd>
          </div>
        </dl>
        <p className="buyer-harvest">
          <CalendarDays size={13} />
          <span>
            Harvest {buyerDate(listing.harvestFrom)} –{" "}
            {buyerDate(listing.harvestUntil)}
          </span>
        </p>
        <div className="buyer-card-footer">
          <span>Seller-declared quality</span>
          <button
            type="button"
            disabled={
              disabled ||
              listing.priceUgxPerKg === null ||
              listing.availableQuantityKg < 1
            }
            onClick={onSelect}
          >
            {listing.priceUgxPerKg === null ? "Price needed" : "Review request"}
            {listing.priceUgxPerKg !== null && <ArrowUpRight size={16} />}
          </button>
        </div>
      </div>
    </article>
  );
}

function OrderCard({
  order,
  simulation,
  busy,
  onCancel,
  onAdvance,
}: {
  order: BuyerOrder;
  simulation: boolean;
  busy: boolean;
  onCancel: () => Promise<void>;
  onAdvance: () => void;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const active =
    order.status === "requested"
      ? 0
      : order.status === "accepted"
        ? 1
        : order.status === "fulfilled"
          ? 2
          : -1;
  return (
    <article className="buyer-order-card">
      <div className="buyer-order-top">
        <span className={`buyer-order-status buyer-status-${order.status}`}>
          {order.sample && "SAMPLE · "}
          {orderLabels[order.status]}
        </span>
        <small>{buyerDate(order.createdAt)}</small>
      </div>
      <div className="buyer-order-main">
        <span className="buyer-order-crop">
          <Wheat size={30} strokeWidth={1.3} />
        </span>
        <div>
          <p>{order.sellerName}</p>
          <h3>
            {buyerNumber(order.quantityKg)} kg · {order.variety || order.crop}
          </h3>
          <span>{order.grade || "Grade to confirm"}</span>
        </div>
        <strong>
          {buyerMoney(order.totalUgx)}
          <small>produce value</small>
        </strong>
      </div>
      {order.status !== "cancelled" && (
        <ol
          className="buyer-order-progress"
          aria-label={`Order progress: ${orderLabels[order.status]}`}
        >
          {["Requested", "Accepted", "Completed"].map((label, index) => (
            <li key={label} className={index <= active ? "is-reached" : ""}>
              <span>{index <= active ? <Check size={12} /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      )}
      <div className="buyer-order-details">
        <span>
          <MapPin size={14} />
          {order.deliveryLocation}
        </span>
        {order.requestedDeliveryDate && (
          <span>
            <CalendarDays size={14} />
            Preferred {buyerDate(order.requestedDeliveryDate)}
          </span>
        )}
      </div>
      {order.message && (
        <p className="buyer-order-message">“{order.message}”</p>
      )}
      <div className="buyer-order-bottom">
        <span>
          <CreditCard size={14} />
          No online payment collected
        </span>
        <div>
          {simulation &&
            (order.status === "requested" || order.status === "accepted") && (
              <button
                type="button"
                className="buyer-text-button"
                onClick={onAdvance}
              >
                {order.status === "requested"
                  ? "Preview seller acceptance"
                  : "Preview completion"}
                <ArrowRight size={14} />
              </button>
            )}
          {order.status === "requested" && !confirmCancel && (
            <button
              type="button"
              className="buyer-text-button"
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
            >
              Cancel request
            </button>
          )}
        </div>
      </div>
      {confirmCancel && order.status === "requested" && (
        <div className="buyer-cancel-confirm">
          <p>Cancel this {simulation ? "sample " : ""}request?</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmCancel(false)}
          >
            Keep request
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              await onCancel();
              setConfirmCancel(false);
            }}
          >
            {busy ? "Cancelling…" : "Confirm cancellation"}
          </button>
        </div>
      )}
      {order.status === "accepted" && !simulation && (
        <p className="buyer-help">
          Need to change an accepted order? Ask the seller or Agribridge team to
          review it.
        </p>
      )}
    </article>
  );
}

export default function BuyerMarketplace() {
  const [buyer, setBuyer] = useState<BuyerAccount | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [catalog, setCatalog] = useState<BuyerCatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [filters, setFilters] = useState<BuyerFilters>(emptyBuyerFilters);
  const [draftFilters, setDraftFilters] =
    useState<BuyerFilters>(emptyBuyerFilters);
  const [area, setArea] = useState<"catalog" | "orders">("catalog");
  const [orders, setOrders] = useState<BuyerOrdersResponse | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [busyCancel, setBusyCancel] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [simulation, setSimulation] = useState(false);
  const [sampleOrders, setSampleOrders] = useState<BuyerOrder[]>([]);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" || navigator.onLine,
  );
  const [flow, dispatch] = useReducer(buyerFlowReducer, emptyBuyerFlow);
  const catalogGeneration = useRef(0);
  const catalogController = useRef<AbortController | null>(null);
  const ordersGeneration = useRef(0);
  const mounted = useRef(true);
  const mutationKeys = useRef(new Map<string, string>());
  const mutationLock = useRef(false);
  const browseRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mounted.current = true;
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const controller = new AbortController();
    readBuyerSession(controller.signal)
      .then((result) => {
        if (mounted.current && !controller.signal.aborted) {
          setBuyer(result);
          setSessionError("");
        }
      })
      .catch((error) => {
        if (mounted.current && !controller.signal.aborted)
          setSessionError(messageFor(error));
      })
      .finally(() => {
        if (mounted.current && !controller.signal.aborted)
          setSessionLoading(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
      catalogController.current?.abort();
      ordersGeneration.current++;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const loadCatalog = useCallback(
    async (offset = 0) => {
      if (!online) {
        setCatalogLoading(false);
        return;
      }
      const generation = ++catalogGeneration.current;
      catalogController.current?.abort();
      const controller = new AbortController();
      catalogController.current = controller;
      setCatalogLoading(true);
      setCatalogError("");
      try {
        const result = await readBuyerCatalog(
          buyerCatalogQuery(filters, offset),
          controller.signal,
        );
        if (!mounted.current || generation !== catalogGeneration.current)
          return;
        setCatalog((previous) =>
          offset > 0 && previous
            ? { ...result, items: mergeBuyerRows(previous.items, result.items) }
            : result,
        );
      } catch (error) {
        if (
          mounted.current &&
          !controller.signal.aborted &&
          generation === catalogGeneration.current
        )
          setCatalogError(messageFor(error));
      } finally {
        if (mounted.current && generation === catalogGeneration.current)
          setCatalogLoading(false);
      }
    },
    [filters, online],
  );
  useEffect(() => {
    if (!simulation) void loadCatalog();
  }, [loadCatalog, simulation]);

  const loadOrders = useCallback(
    async (offset = 0) => {
      if (!buyer || simulation || !online) return;
      const generation = ++ordersGeneration.current;
      setOrdersLoading(true);
      setOrderError("");
      try {
        const result = await readBuyerOrders(offset);
        if (!mounted.current || generation !== ordersGeneration.current) return;
        setOrders((previous) =>
          offset > 0 && previous
            ? {
                ...result,
                orders: mergeBuyerRows(previous.orders, result.orders),
              }
            : result,
        );
      } catch (error) {
        if (mounted.current && generation === ordersGeneration.current) {
          setOrderError(messageFor(error));
          if (error instanceof BuyerApiError && error.status === 401) {
            setBuyer(null);
            setOrders(null);
            dispatch({ type: "signed-out" });
          }
        }
      } finally {
        if (mounted.current && generation === ordersGeneration.current)
          setOrdersLoading(false);
      }
    },
    [buyer, simulation, online],
  );
  useEffect(() => {
    if (area === "orders") void loadOrders();
  }, [area, loadOrders]);

  function switchSimulation(next: boolean) {
    dispatch({ type: "close" });
    setAccountOpen(false);
    setSimulation(next);
    setArea("catalog");
    setFilters(emptyBuyerFilters);
    setDraftFilters(emptyBuyerFilters);
    setFeedback("");
    setOrderError("");
  }
  function resetSample() {
    setSampleOrders([]);
    dispatch({ type: "close" });
    setArea("catalog");
    setFilters(emptyBuyerFilters);
    setDraftFilters(emptyBuyerFilters);
    setFeedback("Sample requests cleared. Nothing was saved or sent.");
  }
  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setFilters({ ...draftFilters });
  }
  function scrollToCatalog() {
    setArea("catalog");
    browseRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  }
  async function authenticate(mode: "login" | "signup", data: BuyerSignup) {
    const account = await authenticateBuyer(
      mode,
      mode === "login" ? { phone: data.phone, password: data.password } : data,
    );
    if (!mounted.current) return;
    setBuyer(account);
    setOrders(null);
    setSessionError("");
    mutationKeys.current.clear();
    dispatch({ type: "authenticated" });
    setFeedback(
      mode === "signup"
        ? "Buyer account created. Your phone is supplied, not yet verified."
        : "Signed in to your buyer account.",
    );
  }
  async function submitOrder(body: BuyerOrderInput) {
    if (!flow.review || (!simulation && (!buyer || !online)))
      throw new Error("Sign in and reconnect before sending an order request.");
    const listing = flow.review;
    let order: BuyerOrder;
    try {
      order = await submitBuyerRequest(simulation, listing, body, (input) =>
        createBuyerOrder(
          input,
          buyerIntentKey(mutationKeys.current, buyer!.id, input),
        ),
      );
    } catch (error) {
      if (
        mounted.current &&
        error instanceof BuyerApiError &&
        error.status === 401
      ) {
        setBuyer(null);
        setOrders(null);
        mutationKeys.current.clear();
        dispatch({ type: "select", listing, authenticated: false });
        dispatch({ type: "auth", mode: "login" });
        setFeedback(
          "Your buyer session expired. Sign in again to review your request.",
        );
      }
      throw error;
    }
    if (!mounted.current) return;
    if (simulation) setSampleOrders((previous) => [order, ...previous]);
    else {
      setOrders(null);
      void loadCatalog();
    }
    dispatch({ type: "confirmed", order });
  }
  async function cancelOrder(order: BuyerOrder) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusyCancel(order.id);
    setOrderError("");
    try {
      if (simulation) {
        setSampleOrders((previous) =>
          previous.map((item) =>
            item.id === order.id
              ? { ...item, status: "cancelled", version: item.version + 1 }
              : item,
          ),
        );
      } else {
        if (!buyer || !online)
          throw new Error("Reconnect to cancel your request.");
        const updated = await cancelBuyerOrder(
          order,
          buyerIntentKey(mutationKeys.current, buyer.id, {
            id: order.id,
            version: order.version,
            status: "cancelled",
          }),
        );
        if (mounted.current)
          setOrders((previous) =>
            previous
              ? {
                  ...previous,
                  orders: previous.orders.map((item) =>
                    item.id === updated.id ? updated : item,
                  ),
                }
              : previous,
          );
        void loadCatalog();
      }
      if (mounted.current)
        setFeedback(
          simulation
            ? "Sample request cancelled in this browser."
            : "Order request cancelled.",
        );
    } catch (error) {
      if (mounted.current) {
        setOrderError(messageFor(error));
        if (error instanceof BuyerApiError && error.status === 401) {
          setBuyer(null);
          setOrders(null);
          dispatch({ type: "signed-out" });
        }
      }
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusyCancel("");
    }
  }
  async function logout() {
    try {
      await signOutBuyer();
    } catch (error) {
      if (!(error instanceof BuyerApiError && error.status === 401))
        throw error;
    }
    if (!mounted.current) return;
    ordersGeneration.current++;
    setBuyer(null);
    setOrders(null);
    setAccountOpen(false);
    mutationKeys.current.clear();
    dispatch({ type: "signed-out" });
    setFeedback("Signed out of your buyer account.");
  }

  const visibleItems = simulation
    ? filterSampleBuyerListings(filters)
    : (catalog?.items ?? []);
  const visibleOrders = simulation ? sampleOrders : (orders?.orders ?? []);
  const activeBuyer = simulation ? sampleBuyer : buyer;
  const hasFilters = Object.values(filters).some(Boolean);
  const crops = [
    ...new Set([
      ...cropSuggestions,
      ...(simulation ? sampleBuyerListings : (catalog?.items ?? [])).map(
        (item) => item.crop,
      ),
    ]),
  ].sort();

  return (
    <div className="buyer-market">
      <a className="buyer-skip" href="#buyer-main">
        Skip to produce
      </a>
      <header className="buyer-header buyer-width">
        <Link className="buyer-brand" to="/welcome">
          <Sprout size={30} strokeWidth={1.5} />
          <span>
            Agribridge<small>THE PRODUCE MARKETPLACE</small>
          </span>
        </Link>
        <nav aria-label="Buyer navigation">
          <Link to="/welcome">
            I’m a farmer or co-op <ArrowUpRight size={14} />
          </Link>
          <Link
            to="/whatsapp-demo?audience=buyer"
            className="buyer-whatsapp-link"
          >
            <MessageCircle size={17} />
            WhatsApp preview
          </Link>
        </nav>
        {simulation ? (
          <button className="buyer-account-button" onClick={resetSample}>
            <RefreshCw size={15} />
            Reset sample
          </button>
        ) : (
          <button
            className="buyer-account-button"
            disabled={sessionLoading}
            onClick={() =>
              buyer
                ? setAccountOpen(true)
                : dispatch({ type: "auth", mode: "login" })
            }
          >
            {sessionLoading ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <UserRound size={16} />
            )}
            <span>
              {sessionLoading
                ? "Checking account"
                : buyer?.businessName || buyer?.name || "Buyer sign in"}
            </span>
          </button>
        )}
      </header>

      <main id="buyer-main">
        <section
          className="buyer-hero buyer-width"
          aria-labelledby="buyer-title"
        >
          <div className="buyer-hero-copy">
            <p className="buyer-eyebrow">
              FROM UGANDA’S GROWERS. TO YOUR BUSINESS.
            </p>
            <h1 id="buyer-title">
              Good produce.
              <br />
              <em>A closer connection.</em>
            </h1>
            <p>
              Find farmers and cooperatives, review their harvests, and request
              what your business needs. Agree the details with the people who
              grow it.
            </p>
            <div>
              <button className="buyer-primary" onClick={scrollToCatalog}>
                Explore available produce <ArrowDown size={17} />
              </button>
              <button
                className="buyer-text-button"
                onClick={() => switchSimulation(!simulation)}
              >
                {simulation
                  ? "Return to live marketplace"
                  : "Explore sample marketplace"}
                <ArrowUpRight size={16} />
              </button>
            </div>
            <span className="buyer-hero-footnote">
              <Handshake size={16} />
              Agribridge connects buyers and sellers. Direct-to-seller payments
              are planned; checkout is not yet available.
            </span>
          </div>
          <div className="buyer-hero-image">
            <picture>
              <source
                media="(max-width: 760px)"
                srcSet="/images/agribridge-market-640.webp"
              />
              <img
                src="/images/agribridge-market-1024.webp"
                alt="Fresh produce at an agricultural market"
                width={1024}
                height={683}
              />
            </picture>
            <div>
              <span>ROOTED IN UGANDA</span>
              <strong>
                A better route
                <br />
                from farm to market.
              </strong>
            </div>
          </div>
        </section>

        <div
          className="buyer-process buyer-width"
          aria-label="How purchasing works"
        >
          <span>
            <small>01</small>Discover a harvest
          </span>
          <span>
            <small>02</small>Send an order request
          </span>
          <span>
            <small>03</small>Agree details with the seller
          </span>
        </div>

        <section
          className="buyer-browse buyer-width"
          ref={browseRef}
          aria-labelledby="buyer-browse-title"
        >
          {simulation && (
            <div className="buyer-simulation-banner">
              <span>
                <Sprout size={21} />
                <span>
                  <strong>Sample marketplace · browser-only preview</strong>
                  <small>
                    Fictional produce, buyers and requests. No signup, message,
                    order or payment is sent. Use fictional details only.
                  </small>
                </span>
              </span>
              <button onClick={() => switchSimulation(false)}>
                Exit sample <X size={15} />
              </button>
            </div>
          )}
          {!simulation && catalog?.sample && (
            <div className="buyer-sample-note">
              DEMO ENVIRONMENT · Published sample listings and requests are for
              testing. No real purchase or payment occurs.
            </div>
          )}
          {!online && (
            <div className="buyer-inline-notice">
              <WifiOff size={18} />
              {simulation
                ? "You’re offline. The sample walkthrough still works in this page."
                : "You’re offline. Reconnect to refresh stock, sign in or send a request."}
            </div>
          )}
          {sessionError && !simulation && (
            <div className="buyer-inline-notice">
              Your buyer session could not load. {sessionError}
            </div>
          )}
          {feedback && (
            <div className="buyer-feedback" role="status">
              <CheckCheck size={18} />
              {feedback}
              <button
                aria-label="Dismiss update"
                onClick={() => setFeedback("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div className="buyer-section-heading">
            <div>
              <p className="buyer-eyebrow">
                {simulation
                  ? "THE SAMPLE MARKET"
                  : "FARM & COOPERATIVE PRODUCE"}
              </p>
              <h2 id="buyer-browse-title">
                {area === "catalog"
                  ? "Find your next supplier."
                  : "Every request, in view."}
              </h2>
            </div>
            <div
              className="buyer-area-switch"
              role="group"
              aria-label="Marketplace view"
            >
              <button
                aria-pressed={area === "catalog"}
                onClick={() => setArea("catalog")}
              >
                <Leaf size={16} />
                Browse produce
              </button>
              <button
                aria-pressed={area === "orders"}
                onClick={() => setArea("orders")}
              >
                <ShoppingBag size={16} />
                {simulation ? "Sample requests" : "My requests"}
                {simulation && sampleOrders.length > 0 && (
                  <span>{sampleOrders.length}</span>
                )}
              </button>
            </div>
          </div>

          {area === "catalog" ? (
            <>
              <form className="buyer-filters" onSubmit={applyFilters}>
                <label className="buyer-search">
                  <Search size={18} />
                  <span className="buyer-visually-hidden">
                    Search produce and sellers
                  </span>
                  <input
                    name="q"
                    type="search"
                    value={draftFilters.q}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        q: event.target.value,
                      }))
                    }
                    placeholder="Search crops, varieties or sellers"
                    maxLength={120}
                  />
                </label>
                <label>
                  <span>Crop</span>
                  <select
                    name="crop"
                    value={draftFilters.crop}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        crop: event.target.value,
                      }))
                    }
                  >
                    <option value="">All crops</option>
                    {crops.map((crop) => (
                      <option key={crop}>{crop}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>District</span>
                  <input
                    name="district"
                    value={draftFilters.district}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        district: event.target.value,
                      }))
                    }
                    placeholder="Any district"
                    maxLength={100}
                  />
                </label>
                <label>
                  <span>At least (kg)</span>
                  <input
                    name="minQuantityKg"
                    type="number"
                    min={1}
                    max={100000000}
                    step={1}
                    value={draftFilters.minQuantityKg}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        minQuantityKg: event.target.value,
                      }))
                    }
                    placeholder="Any quantity"
                  />
                </label>
                <button type="submit" className="buyer-filter-submit">
                  <SlidersHorizontal size={16} />
                  Find produce
                </button>
              </form>
              <div className="buyer-catalog-meta">
                <span>
                  {catalogLoading && !simulation
                    ? "Looking for published produce…"
                    : `${visibleItems.length}${!simulation && catalog?.pagination.hasMore ? "+" : ""} ${simulation ? "sample " : ""}listing${visibleItems.length === 1 ? "" : "s"}${hasFilters ? " for your filters" : " available to explore"}`}
                </span>
                <div>
                  {hasFilters && (
                    <button
                      className="buyer-text-button"
                      onClick={() => {
                        setDraftFilters(emptyBuyerFilters);
                        setFilters(emptyBuyerFilters);
                      }}
                    >
                      Clear filters <X size={13} />
                    </button>
                  )}
                  {!simulation && (
                    <button
                      className="buyer-text-button"
                      disabled={!online || catalogLoading}
                      onClick={() => void loadCatalog()}
                    >
                      <RefreshCw
                        size={13}
                        className={catalogLoading ? "spin" : ""}
                      />
                      Refresh stock
                    </button>
                  )}
                </div>
              </div>
              {catalogError && !simulation && (
                <div className="buyer-load-error">
                  <ErrorMessage message={catalogError} />
                  <p>
                    {visibleItems.length
                      ? "Previously loaded stock is shown below. Refresh before requesting an order."
                      : "The catalogue could not be reached. You can still explore the browser-only sample."}
                  </p>
                  <button
                    className="buyer-text-button"
                    onClick={() => switchSimulation(true)}
                  >
                    Explore sample marketplace <ArrowRight size={15} />
                  </button>
                </div>
              )}
              {catalogLoading && !catalog && !simulation ? (
                <div
                  className="buyer-produce-grid"
                  role="status"
                  aria-label="Loading published produce"
                >
                  {[0, 1, 2].map((item) => (
                    <div className="buyer-product-skeleton" key={item}>
                      <div />
                      <span />
                      <span />
                      <span />
                    </div>
                  ))}
                </div>
              ) : visibleItems.length ? (
                <div className="buyer-produce-grid">
                  {visibleItems.map((listing) => (
                    <ProduceCard
                      key={listing.id}
                      listing={listing}
                      disabled={
                        !simulation &&
                        (sessionLoading || !online || !!catalogError)
                      }
                      onSelect={() =>
                        dispatch({
                          type: "select",
                          listing,
                          authenticated: simulation || !!buyer,
                        })
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="buyer-empty">
                  <span>
                    <Sprout size={38} strokeWidth={1.2} />
                  </span>
                  <p className="buyer-eyebrow">
                    {hasFilters
                      ? "A DIFFERENT SEARCH COULD HELP"
                      : "GOOD CONNECTIONS START HERE"}
                  </p>
                  <h3>
                    {hasFilters
                      ? "No harvests match those filters yet."
                      : "The next harvest is on its way."}
                  </h3>
                  <p>
                    {hasFilters
                      ? "Try another crop or district, or reduce your minimum quantity."
                      : "Farmers and cooperatives choose which produce to publish here. There are no published listings to order from at the moment."}
                  </p>
                  <div>
                    {hasFilters ? (
                      <button
                        className="buyer-primary"
                        onClick={() => {
                          setFilters(emptyBuyerFilters);
                          setDraftFilters(emptyBuyerFilters);
                        }}
                      >
                        Browse all produce <ArrowRight size={16} />
                      </button>
                    ) : (
                      !simulation && (
                        <button
                          className="buyer-primary"
                          onClick={() => switchSimulation(true)}
                        >
                          Explore sample marketplace <ArrowUpRight size={16} />
                        </button>
                      )
                    )}
                    <Link to="/whatsapp-demo?audience=buyer">
                      See the WhatsApp buying preview{" "}
                      <MessageCircle size={16} />
                    </Link>
                  </div>
                </div>
              )}
              {!simulation && catalog?.pagination.hasMore && (
                <div className="buyer-load-more">
                  <Button
                    variant="secondary"
                    busy={catalogLoading}
                    disabled={!online}
                    onClick={() =>
                      void loadCatalog(
                        catalog.pagination.offset + catalog.pagination.limit,
                      )
                    }
                  >
                    Load more produce <ChevronDown size={16} />
                  </Button>
                </div>
              )}
              <p className="buyer-catalog-note">
                {simulation
                  ? "All sample prices, stock, dates and businesses are fictional. Sample requests disappear when you reset or reload."
                  : "Stock and grades are supplied by sellers. Review quality, timing, transport and collection terms before accepting an arrangement."}
              </p>
            </>
          ) : (
            <>
              {!activeBuyer ? (
                <div className="buyer-empty">
                  <span>
                    <UserRound size={35} strokeWidth={1.3} />
                  </span>
                  <h3>Your requests belong here.</h3>
                  <p>
                    Sign in as a buyer to follow the orders you’ve requested. A
                    farm workspace sign-in does not give access to buyer orders.
                  </p>
                  <button
                    className="buyer-primary"
                    disabled={!online || sessionLoading}
                    onClick={() => dispatch({ type: "auth", mode: "login" })}
                  >
                    Sign in as buyer <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="buyer-catalog-meta">
                    <span>
                      {simulation
                        ? "Sample Kitchen · local walkthrough"
                        : activeBuyer.businessName || activeBuyer.name}
                    </span>
                    <button
                      className="buyer-text-button"
                      disabled={!simulation && (!online || ordersLoading)}
                      onClick={() =>
                        simulation ? resetSample() : void loadOrders()
                      }
                    >
                      <RefreshCw size={13} />
                      {simulation
                        ? "Reset sample requests"
                        : "Refresh requests"}
                    </button>
                  </div>
                  {orderError && <ErrorMessage message={orderError} />}
                  {ordersLoading && !orders && !simulation ? (
                    <div className="buyer-loading" role="status">
                      <LoaderCircle className="spin" size={22} />
                      Loading your order requests…
                    </div>
                  ) : visibleOrders.length ? (
                    <div className="buyer-order-list">
                      {visibleOrders.map((order) => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          simulation={simulation}
                          busy={!!busyCancel || (!simulation && !online)}
                          onCancel={() => cancelOrder(order)}
                          onAdvance={() =>
                            setSampleOrders((previous) =>
                              previous.map((item) =>
                                item.id === order.id
                                  ? {
                                      ...item,
                                      status:
                                        item.status === "requested"
                                          ? "accepted"
                                          : "fulfilled",
                                      version: item.version + 1,
                                      updatedAt: new Date().toISOString(),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    !orderError && (
                      <div className="buyer-empty">
                        <span>
                          <ShoppingBag size={35} strokeWidth={1.3} />
                        </span>
                        <h3>A good supplier is the next step.</h3>
                        <p>
                          {simulation
                            ? "Try reviewing a sample listing and create a fictional request. Nothing is sent or saved beyond this page."
                            : "Once you request produce, you can follow seller acceptance and completion here."}
                        </p>
                        <button
                          className="buyer-primary"
                          onClick={() => setArea("catalog")}
                        >
                          Browse {simulation ? "sample " : ""}produce{" "}
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    )
                  )}
                  {!simulation && orders?.pagination.hasMore && (
                    <div className="buyer-load-more">
                      <Button
                        variant="secondary"
                        busy={ordersLoading}
                        disabled={!online}
                        onClick={() =>
                          void loadOrders(
                            orders.pagination.offset + orders.pagination.limit,
                          )
                        }
                      >
                        Load earlier requests <ChevronDown size={16} />
                      </Button>
                    </div>
                  )}
                  <div className="buyer-payment-note">
                    <CreditCard size={22} />
                    <div>
                      <strong>Payment checkout is not available yet.</strong>
                      <p>
                        {simulation
                          ? "You can preview request, acceptance and completion. All events remain fictional; no payment or message is sent."
                          : orders?.capabilities.reason ||
                            "A payment provider must be configured before clients can pay sellers through this platform."}
                      </p>
                    </div>
                    <button type="button" disabled>
                      Checkout unavailable
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>

        <section className="buyer-support buyer-width">
          <div>
            <span>
              <MessageCircle size={24} />
            </span>
            <div>
              <p className="buyer-eyebrow">ANOTHER WAY TO CONNECT</p>
              <h2>Prefer a conversation?</h2>
              <p>
                Explore how buying through WhatsApp is planned to work. English
                and Luganda previews, with scripted voice-note examples.
              </p>
            </div>
          </div>
          <Link to="/whatsapp-demo?audience=buyer">
            Try the buyer conversation <ArrowUpRight size={18} />
          </Link>
          <small>Scripted preview · WhatsApp connection coming soon</small>
        </section>
      </main>
      <footer className="buyer-footer buyer-width">
        <Link className="buyer-brand" to="/welcome">
          <Sprout size={24} />
          <span>Agribridge</span>
        </Link>
        <span>Better connections. From farm to market.</span>
        <Link to="/welcome">
          Explore the farmer platform <ArrowUpRight size={14} />
        </Link>
      </footer>

      {flow.auth && !simulation && (
        <BuyerAuthDialog
          mode={flow.auth}
          onMode={(mode) => dispatch({ type: "auth", mode })}
          onSubmit={authenticate}
          onClose={() => dispatch({ type: "close" })}
        />
      )}
      {flow.review && activeBuyer && (
        <BuyerOrderDialog
          key={`${simulation}:${flow.review.id}`}
          listing={flow.review}
          buyer={activeBuyer}
          simulation={simulation}
          onSubmit={submitOrder}
          onClose={() => dispatch({ type: "close" })}
        />
      )}
      {flow.confirmation && (
        <BuyerConfirmation
          order={flow.confirmation}
          simulation={simulation}
          onClose={() => dispatch({ type: "close" })}
          onOrders={() => {
            dispatch({ type: "close" });
            setArea("orders");
            browseRef.current?.scrollIntoView({ block: "start" });
          }}
        />
      )}
      {accountOpen && buyer && !simulation && (
        <BuyerAccountDialog
          buyer={buyer}
          onSignOut={logout}
          onClose={() => setAccountOpen(false)}
        />
      )}
    </div>
  );
}
