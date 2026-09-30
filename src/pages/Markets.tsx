import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  MapPin,
  Plus,
  ShoppingBag,
  Scale,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Database,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import {
  Badge,
  Button,
  Empty,
  ErrorMessage,
  Field,
  Form,
  Modal,
  Notice,
  PageHeader,
  SearchInput,
  fieldNumber,
  fieldText,
} from "../components/ui";
import { crops, districts, label, number, ugx } from "../lib/format";
import { ApiError, rawRequest } from "../lib/api";
import {
  emptyMarketFilters,
  fromUgandaDateInput,
  marketArea,
  marketDataPath,
  marketDate,
  marketSourceLink,
  marketViewIsStale,
  observationFreshness,
  parsePublishedMarketData,
  publishedPriceLabel,
  reportingMonth,
  marketFiltersEqual,
  marketFilterDescription,
  shouldReadMarketView,
  secondaryMarketFilterCount,
  toUgandaDateInput,
  type MarketFilters,
  type PublishedMarketData,
} from "../lib/market-data";
import type { MarketPrice, Offer } from "../types";
import "../styles/market-data.css";
export default function Markets() {
  const { data, user, mutate, demo, notify, online } = useApp();
  const [tab, setTab] = useState<"published" | "prices" | "offers">(
      "published",
    ),
    [query, setQuery] = useState(""),
    [crop, setCrop] = useState("All crops"),
    [editor, setEditor] = useState<"price" | "offer" | null>(null),
    [editingPrice, setEditingPrice] = useState<MarketPrice | null>(null),
    [offer, setOffer] = useState<Offer | null>(null);
  const close = useCallback(() => {
    setEditor(null);
    setEditingPrice(null);
  }, []);
  const staff = !!user && user.role !== "farmer";
  const prices = data.marketPrices.filter(
    (p) =>
      (crop === "All crops" || p.crop === crop) &&
      `${p.crop} ${p.market} ${p.district}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const offers = data.offers.filter(
    (o) =>
      (crop === "All crops" || o.crop === crop) &&
      `${o.crop} ${o.district} ${o.sellerName}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="markets-page">
      <PageHeader
        title="Prices"
        description="Check a price before you sell."
        action={
          (tab === "offers" || (tab === "prices" && staff)) && (
            <Button
              disabled={!online}
              onClick={() => {
                setEditor(tab === "offers" ? "offer" : "price");
              }}
            >
              <Plus size={18} />
              {tab === "offers" ? "List produce" : "Record a local price"}
            </Button>
          )
        }
      />
      {demo && tab !== "published" && (
        <Notice>
          Sample market records for exploring the product. These are not live
          quotations or verified buyer commitments.
        </Notice>
      )}
      <div className="market-view-select">
        <Field label="Price information">
          <select
            value={tab}
            onChange={(event) => setTab(event.target.value as typeof tab)}
          >
            <option value="published">Published prices</option>
            <option value="prices">
              Local records{demo ? " (Sample)" : ""}
            </option>
            <option value="offers">
              Produce to buy or sell{demo ? " (Sample)" : ""}
            </option>
          </select>
        </Field>
      </div>
      {tab !== "published" && (
        <div className="toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search crops, markets or districts"
          />
          <select
            aria-label="Filter crop"
            value={crop}
            onChange={(e) => setCrop(e.target.value)}
          >
            <option>All crops</option>
            {crops.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      )}
      <div className="market-published-view" hidden={tab !== "published"}>
        <PublishedMarketPanel
          key={`${user?.organizationId}:${user?.id}`}
          visible={tab === "published"}
          onManual={() => {
            setTab("prices");
            if (staff && online) setEditor("price");
          }}
        />
      </div>
      {tab === "prices" ? (
        <>
          <Notice>
            These records come from your cooperative, not the published WFP
            dataset. A “verified” label means your team checked its stated
            source; it is not a guaranteed buyer quote. Retail or wholesale
            terms are not captured in this form, so confirm them before
            comparing.
          </Notice>
          <section className="panel table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Crop & market</th>
                  <th>District</th>
                  <th>Price / kg</th>
                  <th>Evidence</th>
                  <th>Reported</th>
                  {staff && (
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="table-primary">
                        <span className="round-icon">
                          <SproutMarket />
                        </span>
                        <span>
                          <strong>{p.crop}</strong>
                          <small>{p.market}</small>
                        </span>
                      </span>
                    </td>
                    <td>{p.district}</td>
                    <td className="numeric">
                      <strong>{ugx(p.priceUgx)}</strong>
                    </td>
                    <td>
                      <Badge
                        tone={
                          p.status === "verified"
                            ? "green"
                            : p.status === "sample"
                              ? "amber"
                              : "neutral"
                        }
                      >
                        {label(p.status)}
                      </Badge>
                      <small className="source-cell">{p.source}</small>
                    </td>
                    <td>{marketDate(p.observedAt, true)} EAT</td>
                    {staff && (
                      <td>
                        <button
                          className="row-action"
                          disabled={!online}
                          onClick={() => {
                            setEditingPrice(p);
                            setEditor("price");
                          }}
                        >
                          Review
                          <ArrowUpRight size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!prices.length && (
              <Empty
                icon={ChartNoAxesCombined}
                title="No prices match this search."
                body="Try another crop or district."
              />
            )}
          </section>
          <div className="market-advice">
            <Scale size={24} />
            <div>
              <h3>A better price is only part of the story.</h3>
              <p>
                Compare transport costs, quality requirements, payment timing,
                and the amount a buyer can take.
              </p>
            </div>
          </div>
        </>
      ) : tab === "offers" ? (
        <div className="offers-grid">
          {offers.map((o) => (
            <article className="panel offer-card" key={o.id}>
              <div className="offer-top">
                <ShoppingBag size={26} />
                <Badge tone={o.status === "available" ? "green" : "neutral"}>
                  {label(o.status)}
                </Badge>
              </div>
              <h2>{o.crop}</h2>
              <p className="muted">
                {number(o.quantityKg)} kg available in this record
              </p>
              <strong className="offer-price">
                {ugx(o.priceUgx)}
                <small> / kg</small>
              </strong>
              <p className="icon-text">
                <MapPin size={14} />
                {o.district}
              </p>
              <div className="offer-footer">
                <span>{o.sellerName}</span>
                <Button variant="ghost" onClick={() => setOffer(o)}>
                  Details
                  <ArrowUpRight size={16} />
                </Button>
              </div>
            </article>
          ))}
          {!offers.length && (
            <Empty
              title="Bring your harvest to market."
              body="Create a produce listing with quantity, location, and your asking price."
              action={
                <Button disabled={!online} onClick={() => setEditor("offer")}>
                  List produce
                </Button>
              }
            />
          )}
        </div>
      ) : null}
      {editor && (
        <Modal
          title={
            editor === "price"
              ? editingPrice
                ? "Review market price"
                : "Record a market price"
              : "Bring your produce to market"
          }
          description={
            editor === "price"
              ? "Record the source and date so others can judge the information."
              : "Listings are invitations to discuss. No payment is collected here."
          }
          onClose={close}
        >
          <Form
            onCancel={close}
            submitLabel={editor === "price" ? "Save price" : "Create listing"}
            onSubmit={async (fd) => {
              if (editor === "price") {
                await mutate(
                  editingPrice
                    ? `/api/market-prices/${editingPrice.id}`
                    : "/api/market-prices",
                  editingPrice ? "PATCH" : "POST",
                  {
                    crop: fieldText(fd, "crop"),
                    market: fieldText(fd, "market"),
                    district: fieldText(fd, "district"),
                    priceUgx: fieldNumber(fd, "priceUgx"),
                    unit: "kg",
                    observedAt: fromUgandaDateInput(
                      fieldText(fd, "observedAt"),
                    ),
                    source: fieldText(fd, "source"),
                    status: fieldText(fd, "status"),
                    ...(editingPrice ? { version: editingPrice.version } : {}),
                  },
                );
              } else {
                await mutate("/api/offers", "POST", {
                  crop: fieldText(fd, "crop"),
                  quantityKg: fieldNumber(fd, "quantityKg"),
                  priceUgx: fieldNumber(fd, "priceUgx"),
                  district: fieldText(fd, "district"),
                  sellerName: fieldText(fd, "sellerName"),
                  description: fieldText(fd, "description"),
                  status: "available",
                });
              }
              close();
            }}
          >
            <Field label="Crop">
              <select name="crop" defaultValue={editingPrice?.crop}>
                {crops.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="District">
              <select
                name="district"
                defaultValue={editingPrice?.district ?? "Nakaseke"}
              >
                {districts.map((d) => (
                  <option key={d.name}>{d.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Price per kg (UGX)">
              <input
                type="number"
                name="priceUgx"
                required
                min="1"
                max="100000000"
                step="1"
                defaultValue={editingPrice?.priceUgx}
              />
            </Field>
            {editor === "price" ? (
              <>
                <Field label="Market">
                  <input
                    name="market"
                    required
                    maxLength={120}
                    defaultValue={editingPrice?.market}
                  />
                </Field>
                <Field label="Date observed (Uganda time)">
                  <input
                    name="observedAt"
                    type="datetime-local"
                    required
                    defaultValue={toUgandaDateInput(editingPrice?.observedAt)}
                  />
                </Field>
                <Field label="Source">
                  <input
                    name="source"
                    required
                    maxLength={200}
                    placeholder="e.g. Market officer, price bulletin"
                    defaultValue={editingPrice?.source}
                  />
                </Field>
                <Field label="Verification">
                  <select
                    name="status"
                    defaultValue={
                      editingPrice?.status === "sample"
                        ? "reported"
                        : (editingPrice?.status ?? "reported")
                    }
                  >
                    <option value="reported">
                      Reported, awaiting verification
                    </option>
                    <option value="verified">Verified against source</option>
                  </select>
                </Field>
              </>
            ) : (
              <>
                <Field label="Quantity (kg)">
                  <input
                    name="quantityKg"
                    type="number"
                    required
                    min="1"
                    max="10000000"
                  />
                </Field>
                <Field label="Seller’s name">
                  <input
                    name="sellerName"
                    required
                    maxLength={120}
                    defaultValue={user?.name}
                  />
                </Field>
                <div className="full-width">
                  <Field label="Quality and availability">
                    <textarea
                      name="description"
                      required
                      maxLength={2000}
                      rows={3}
                      placeholder="Harvest date, variety, grade, collection terms"
                    />
                  </Field>
                </div>
              </>
            )}
          </Form>
        </Modal>
      )}
      {offer && (
        <Modal
          title={`${offer.crop} · ${number(offer.quantityKg)} kg`}
          onClose={() => setOffer(null)}
        >
          <div className="panel-body offer-detail">
            <Badge tone="green">{label(offer.status)}</Badge>
            <h3>{ugx(offer.priceUgx)} / kg</h3>
            <p>{offer.description}</p>
            <p>
              {offer.sellerName} · {offer.district}
            </p>
            <Notice>
              Confirm quality, availability, and payment terms through your
              cooperative before trading. Never send money based on an
              unverified listing.
            </Notice>
            {staff && (
              <div className="button-row">
                {(["available", "reserved", "sold"] as const).map((status) => (
                  <Button
                    key={status}
                    variant="secondary"
                    disabled={offer.status === status}
                    onClick={() =>
                      void mutate(`/api/offers/${offer.id}`, "PATCH", {
                        version: offer.version,
                        status,
                      })
                        .then(() => setOffer(null))
                        .catch((e) => notify(e.message))
                    }
                  >
                    {label(status)}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
function SproutMarket() {
  return <ShoppingBag size={18} />;
}

function PublishedMarketPanel({
  onManual,
  visible,
}: {
  onManual: () => void;
  visible: boolean;
}) {
  const { user, online, refresh } = useApp();
  const [filters, setFilters] = useState<MarketFilters>(emptyMarketFilters);
  const [draftFilters, setDraftFilters] =
    useState<MarketFilters>(emptyMarketFilters);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<string | null>>([]);
  const [snapshot, setSnapshot] = useState<{
    path: string;
    data: PublishedMarketData;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const sequence = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const loadedPath = useRef<string | null>(null);
  const reconnect = useRef(false);
  const path = marketDataPath(filters, cursor);
  const data = snapshot?.path === path ? snapshot.data : null;
  const source = (data ?? snapshot?.data)?.source;
  const admin = user?.role === "admin";
  const staff = !!user && user.role !== "farmer";

  const load = useCallback(
    async (checkPublisher = false) => {
      pending.current?.abort();
      const controller = new AbortController(),
        revision = ++sequence.current;
      pending.current = controller;
      const valid = () => active.current && revision === sequence.current;
      const timer = setTimeout(() => controller.abort(), 18_000);
      setLoading(true);
      setError("");
      async function read(url: string, method = "GET") {
        const response = await rawRequest(
          url,
          method,
          method === "POST" ? {} : undefined,
          undefined,
          controller.signal,
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new ApiError(
            response.status,
            result.error?.code ?? "SOURCE_UNAVAILABLE",
            result.error?.message ??
              "Published market data could not be loaded.",
          );
        return result;
      }
      try {
        if (checkPublisher) await read("/api/market-data/refresh", "POST");
        // The refresh endpoint returns its default page. Re-read the selected
        // filters so its unfiltered rows cannot be shown under active selections.
        const result = parsePublishedMarketData(await read(path));
        if (!valid()) return;
        loadedPath.current = path;
        reconnect.current = false;
        setSnapshot({ path, data: result });
      } catch (failure) {
        if (!valid()) return;
        if (
          failure instanceof ApiError &&
          failure.status === 409 &&
          failure.code === "CURSOR_EXPIRED"
        ) {
          loadedPath.current = null;
          setHistory([]);
          setCursor(null);
          setNotice(
            "The publisher snapshot changed while you were browsing. Returned to the first page so records from different snapshots are not mixed.",
          );
        } else {
          setError(
            failure instanceof Error
              ? failure.message
              : "The source is unavailable. Try again when connected.",
          );
          if (
            failure instanceof ApiError &&
            [401, 403].includes(failure.status)
          ) {
            setSnapshot(null);
            void refresh().catch(() => {});
          }
        }
      } finally {
        clearTimeout(timer);
        if (valid()) setLoading(false);
      }
    },
    [path, refresh],
  );

  useEffect(() => {
    active.current = visible;
    if (!online) reconnect.current = true;
    if (
      shouldReadMarketView({
        visible,
        online,
        path,
        loadedPath: loadedPath.current,
        reconnect: reconnect.current,
      })
    )
      void load();
    else if (!visible || !online) {
      pending.current?.abort();
      sequence.current += 1;
      setLoading(false);
    }
    return () => {
      active.current = false;
      sequence.current += 1;
      pending.current?.abort();
    };
  }, [load, online, path, visible]);

  function selectFilter(key: keyof MarketFilters, value: string) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }
  const stale = data ? marketViewIsStale(data, !!error, online) : false;
  const datasetLink = marketSourceLink(source?.datasetUrl);
  const downloadLink = marketSourceLink(source?.downloadUrl);
  const licenseLink = marketSourceLink(source?.license.url);
  const available = data?.status === "available";
  const activeFilters = Object.values(draftFilters).some(Boolean);
  const draftChanged = !marketFiltersEqual(draftFilters, filters);
  const options = (data ?? snapshot?.data)?.filters;
  const dropdowns: Array<{
    key: keyof MarketFilters;
    label: string;
    all: string;
    values: string[];
  }> = [
    {
      key: "category",
      label: "Category",
      all: "All categories",
      values: options?.categories ?? [],
    },
    {
      key: "commodity",
      label: "Crop or item",
      all: "All crops and items",
      values: options?.commodities ?? [],
    },
    {
      key: "market",
      label: "Market",
      all: "All markets",
      values: options?.markets ?? [],
    },
    {
      key: "priceType",
      label: "Price type",
      all: "All types",
      values: options?.priceTypes ?? [],
    },
    {
      key: "unit",
      label: "Original unit",
      all: "All units",
      values: options?.units ?? [],
    },
    {
      key: "currency",
      label: "Currency",
      all: "All currencies",
      values: options?.currencies ?? [],
    },
  ];
  const moreFilterCount = secondaryMarketFilterCount(draftFilters);
  function clearFilters() {
    setDraftFilters(emptyMarketFilters);
  }
  function showPrices() {
    if (!online || loading) return;
    setNotice("");
    setError("");
    if (marketFiltersEqual(draftFilters, filters) && cursor === null) {
      void load();
      return;
    }
    loadedPath.current = null;
    setFilters({ ...draftFilters });
    setCursor(null);
    setHistory([]);
  }
  const renderFilter = (dropdown: (typeof dropdowns)[number]) => (
    <Field key={dropdown.key} label={dropdown.label}>
      <select
        aria-label={`Published ${dropdown.label.toLowerCase()}`}
        value={draftFilters[dropdown.key]}
        disabled={!options}
        onChange={(event) => selectFilter(dropdown.key, event.target.value)}
      >
        <option value="">{dropdown.all}</option>
        {dropdown.values.map((value) => (
          <option value={value} key={value}>
            {value}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <div className="published-markets">
      <form
        className="market-search"
        onSubmit={(event) => {
          event.preventDefault();
          showPrices();
        }}
      >
        <div className="market-search-main">
          <div className="market-source-filters market-primary-filters">
            {dropdowns
              .filter(
                (dropdown) =>
                  dropdown.key === "commodity" || dropdown.key === "market",
              )
              .map(renderFilter)}
          </div>
          <Button
            className="market-show-prices"
            type="submit"
            busy={loading}
            disabled={!online}
          >
            Show prices
            {!loading && <ArrowRight size={17} />}
          </Button>
        </div>
        <div className="market-search-options">
          <Button
            type="button"
            variant="ghost"
            className="market-more-filters"
            aria-expanded={moreFiltersOpen}
            aria-controls="market-extra-filters"
            onClick={() => setMoreFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal size={16} />
            More filters
            {moreFilterCount > 0 && (
              <span className="market-filter-count">{moreFilterCount}</span>
            )}
          </Button>
          {activeFilters && (
            <Button
              type="button"
              variant="ghost"
              className="market-reset"
              onClick={clearFilters}
            >
              Clear selections
            </Button>
          )}
        </div>
        <div
          id="market-extra-filters"
          className="market-source-filters market-secondary-filters"
          hidden={!moreFiltersOpen}
        >
          {dropdowns
            .filter(
              (dropdown) =>
                dropdown.key !== "commodity" && dropdown.key !== "market",
            )
            .map(renderFilter)}
          <p className="market-filter-hint">
            Food and household items are included. Units and price types stay
            separate.
          </p>
        </div>
        {activeFilters && (
          <div
            className="market-active-filters"
            aria-label="Selected search filters"
          >
            {dropdowns
              .filter((dropdown) => draftFilters[dropdown.key])
              .map((dropdown) => (
                <button
                  key={dropdown.key}
                  type="button"
                  onClick={() => selectFilter(dropdown.key, "")}
                  aria-label={
                    "Clear " +
                    dropdown.label.toLowerCase() +
                    " filter: " +
                    draftFilters[dropdown.key]
                  }
                >
                  <span>{draftFilters[dropdown.key]}</span>
                  <X size={13} />
                </button>
              ))}
          </div>
        )}
        {draftChanged && (
          <p className="market-draft-notice" role="status">
            Selections changed. Choose Show prices to update the results below.
          </p>
        )}
      </form>

      <p className="market-source-brief">
        <strong>WFP / HDX monthly reference prices.</strong> Not today’s buyer
        quotes. Limited coverage; dates vary by market.
      </p>

      {notice && <Notice>{notice}</Notice>}
      {error && (
        <ErrorMessage
          message={
            error +
            (data
              ? " The last loaded copy remains below."
              : " No sample prices have been substituted.")
          }
        />
      )}
      {!online && (
        <Notice>
          Connection unavailable.{" "}
          {data
            ? "Showing only prices already loaded in this view. Check their observation dates."
            : "Reconnect to load published prices. Local records are a separate view."}
        </Notice>
      )}
      {data?.cacheStatus === "stale" && (
        <Notice tone="warning">
          Cached source retrieved {marketDate(data.source.retrievedAt, true)}{" "}
          EAT. The latest publisher check did not refresh it; observation dates
          are unchanged.
          {data.source.lastError
            ? " Source status: " + data.source.lastError
            : ""}
        </Notice>
      )}
      {data?.refreshState === "running" && (
        <Notice>
          The publisher check is running. Choose Show prices shortly to check
          again.
        </Notice>
      )}
      {data?.refreshState === "backoff" && (
        <Notice tone="warning">
          The publisher check needs more time.
          {data.source.nextRefreshAt
            ? " Next attempt no earlier than " +
              marketDate(data.source.nextRefreshAt, true) +
              " EAT."
            : ""}{" "}
          Existing observation dates have not changed.
        </Notice>
      )}

      {loading && !data ? (
        <div className="market-loading" role="status">
          <RefreshCw size={18} className="spin" />
          <div>
            <strong>Loading published prices</strong>
            <p>This may take a moment on a slow connection.</p>
          </div>
        </div>
      ) : available ? (
        <section
          className="market-results"
          aria-busy={loading}
          aria-labelledby="market-results-heading"
        >
          <div className="market-results-heading">
            <div>
              <h2 id="market-results-heading">
                {filters.commodity
                  ? filters.commodity + " prices"
                  : "Published prices"}
              </h2>
              <p className="market-applied-filters">
                Showing: {marketFilterDescription(filters)}
              </p>
            </div>
            <span className="market-result-state" role="status">
              {loading
                ? "Refreshing…"
                : number(data.total) +
                  (data.total === 1 ? " observation" : " observations") +
                  (stale ? " · Cached copy" : "")}
            </span>
          </div>
          <div className="panel market-observations">
            {data.items.length ? (
              <div className="published-price-list">
                <div className="published-price-columns" aria-hidden="true">
                  <span>Crop &amp; market</span>
                  <span>Price</span>
                  <span>Date observed</span>
                </div>
                {data.items.map((item) => (
                  <article key={item.id} className="published-price-row">
                    <div className="published-price-place">
                      <h3>{item.commodity}</h3>
                      <strong>{item.market}</strong>
                      <small>{marketArea(item)}</small>
                    </div>
                    <div className="published-price-amount">
                      <span className="market-mobile-label">Price</span>
                      <span>{publishedPriceLabel(item)}</span>
                      <div>
                        <Badge>{item.priceType}</Badge>
                      </div>
                    </div>
                    <div className="published-price-period">
                      <span className="market-mobile-label">Date observed</span>
                      <strong>{marketDate(item.observedAt)}</strong>
                      <span
                        className={"market-age market-age-" + item.freshness}
                      >
                        {observationFreshness(item)}
                      </span>
                    </div>
                    <div className="published-price-footer">
                      {datasetLink && (
                        <a
                          href={datasetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={source?.publisher}
                        >
                          Source: WFP / HDX
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <details className="published-price-details">
                        <summary>Price details</summary>
                        <dl>
                          <div>
                            <dt>Category</dt>
                            <dd>{item.category}</dd>
                          </div>
                          <div>
                            <dt>Reporting month</dt>
                            <dd>{reportingMonth(item.period)}</dd>
                          </div>
                          <div>
                            <dt>Original unit</dt>
                            <dd>{item.unit} · no conversion</dd>
                          </div>
                          <div>
                            <dt>Source flag</dt>
                            <dd>{item.priceFlag}</dd>
                          </div>
                        </dl>
                      </details>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                icon={ChartNoAxesCombined}
                title="No published prices for this search"
                body="Coverage is limited. Change the crop or market, then choose Show prices. Your cooperative may have a dated local quote."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear selections
                  </Button>
                }
              />
            )}
          </div>
          <div className="market-data-pagination">
            <small>
              Showing {data.items.length} of {number(data.total)} observations ·
              Page {history.length + 1}
            </small>
            <div>
              <Button
                variant="secondary"
                disabled={!history.length || loading || !online || draftChanged}
                onClick={() => {
                  setCursor(history.at(-1) ?? null);
                  setHistory((current) => current.slice(0, -1));
                }}
              >
                <ArrowLeft size={15} />
                Previous
              </Button>
              <Button
                variant="primary"
                disabled={
                  !data.nextCursor || loading || !online || draftChanged
                }
                onClick={() => {
                  setHistory((current) => [...current, cursor]);
                  setCursor(data.nextCursor);
                }}
              >
                Next
                <ArrowRight size={15} />
              </Button>
            </div>
          </div>
        </section>
      ) : !loading ? (
        <section className="panel">
          <Empty
            icon={Database}
            title={
              data?.refreshState === "running"
                ? "Published prices are being retrieved"
                : "Published prices are unavailable"
            }
            body="No current price is confirmed here. Ask your cooperative or a market officer for a dated local quote before agreeing to sell."
            action={
              staff ? (
                <Button
                  variant="secondary"
                  disabled={!online}
                  onClick={onManual}
                >
                  <Plus size={16} />
                  Record a local price
                </Button>
              ) : (
                <Link className="text-link" to="/settings">
                  Contact your cooperative
                  <ArrowUpRight size={15} />
                </Link>
              )
            }
          />
        </section>
      ) : null}

      <details className="panel market-about">
        <summary>About these prices</summary>
        <div className="market-about-intro">
          <h3>{source?.title ?? "Uganda — WFP Food Prices"}</h3>
          <p>{source?.publisher ?? "World Food Programme, via HDX"}</p>
          <p>
            Coverage is limited and uneven. Newer settlement observations do not
            update older city-market or wholesale prices. Each row is the latest
            published observation for that market, item, price type and unit—not
            a buyer’s commitment.
          </p>
          <p>
            Retail, wholesale and farm-gate prices differ. No currency, bag or
            kilogram conversions are made here. Confirm quality, transport
            costs, deductions and payment terms with your buyer.
          </p>
        </div>
        <div className="market-source-facts">
          <div>
            <span>Newest period anywhere in source</span>
            <strong>{reportingMonth(source?.latestObservationAt)}</strong>
            <small>Not every market is updated to this month</small>
          </div>
          <div>
            <span>Source file updated</span>
            <strong>{marketDate(source?.sourceUpdatedAt)}</strong>
            <small>Publisher metadata, not an observation date</small>
          </div>
          <div>
            <span>Agribridge last retrieved</span>
            <strong>{marketDate(source?.retrievedAt, true)}</strong>
            <small>
              {source?.retrievedAt
                ? "Uganda time (EAT)"
                : "No successful download confirmed"}
            </small>
          </div>
        </div>
        <div className="market-source-links">
          {datasetLink && (
            <a href={datasetLink} target="_blank" rel="noopener noreferrer">
              Publisher dataset
              <ExternalLink size={13} />
            </a>
          )}
          {downloadLink && (
            <a href={downloadLink} target="_blank" rel="noopener noreferrer">
              Original data file
              <ExternalLink size={13} />
            </a>
          )}
          {licenseLink && (
            <a
              href={licenseLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={source?.license.name}
              title={source?.license.name}
            >
              CC BY-IGO 3.0
              <ExternalLink size={13} />
            </a>
          )}
          {admin && (
            <Button
              variant="ghost"
              disabled={!online || loading || data?.refreshState === "running"}
              onClick={() => {
                setNotice("");
                void load(true);
              }}
            >
              Check publisher for updates
            </Button>
          )}
        </div>
        <p className="market-attribution">
          WFP / HDX data filtered and formatted by Agribridge. No endorsement
          implied.
        </p>
      </details>
    </div>
  );
}
