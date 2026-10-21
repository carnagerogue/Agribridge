import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  CloudSun,
  Handshake,
  Leaf,
  MapPin,
  PackageCheck,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sprout,
  Truck,
  UserRound,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import {
  Badge,
  Button,
  Empty,
  ErrorMessage,
  Notice,
  PageHeader,
  SearchInput,
  Skeleton,
} from "../components/ui";
import {
  BuyerCard,
  ServiceCard,
  SupplyCard,
} from "../components/marketplace/MarketCards";
import {
  BusinessForm,
  DemandForm,
  InterestForm,
  ServiceForm,
  SupplyForm,
} from "../components/marketplace/MarketForms";
import { MarketDesk } from "../components/marketplace/MarketDesk";
import { MarketConnections } from "../components/MarketConnections";
import { SupplyPublication } from "../components/marketplace/SupplyPublication";
import { SellerBuyerOrders } from "../components/marketplace/SellerBuyerOrders";
import { rawRequest, request } from "../lib/api";
import { districts, label, number, today } from "../lib/format";
import {
  demandSearch,
  errorText,
  marketCategories,
  marketDate as date,
  serviceSearch,
  supplySearch,
  type ServiceCategory,
} from "../lib/marketplace";
import type {
  BuyerDemand,
  MarketMatch,
  MarketOverview,
  SupplyListing,
} from "../../server/marketplace-types";
import "../styles/marketplace.css";
import "../styles/market-buyers.css";

type Tab = "buyers" | "produce" | "services" | "business" | "connections";
type Editor = "business" | "supply" | "interest" | "demand" | "service" | null;
const sections: { id: Tab; label: string; icon: typeof Handshake }[] = [
  { id: "buyers", label: "Find buyers", icon: Handshake },
  { id: "produce", label: "My produce", icon: PackageCheck },
  { id: "services", label: "Inputs & logistics", icon: Truck },
  { id: "business", label: "My business", icon: Building2 },
  { id: "connections", label: "Orders & updates", icon: Bell },
];
const PAGE_SIZE = 50;

export default function Marketplace() {
  const { user } = useApp();
  return <MarketWorkspace key={`${user?.organizationId}:${user?.id}`} />;
}

function mergeRecords<T extends { id: string }>(first: T[], next: T[]) {
  return [
    ...new Map([...first, ...next].map((item) => [item.id, item])).values(),
  ];
}

function MarketWorkspace() {
  const { user, data: farmData, online, notify } = useApp();
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [tab, setTab] = useState<Tab>("buyers");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [district, setDistrict] = useState("");
  const [category, setCategory] = useState<ServiceCategory>("all");
  const [onlyMatching, setOnlyMatching] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [selectedDemand, setSelectedDemand] = useState<BuyerDemand | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const generation = useRef(0);
  const mounted = useRef(true);
  const mutationKeys = useRef(new Map<string, string>());
  const stateLock = useRef(false);
  const staff = user?.role === "admin" || user?.role === "operator";
  const profile = overview?.profile ?? null;

  const read = useCallback(
    async (offset = 0) => {
      if (!online) return;
      const current = ++generation.current;
      setRefreshing(true);
      setError("");
      try {
        const response = await rawRequest(
          `/api/marketplace/overview?limit=${PAGE_SIZE}&offset=${offset}`,
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error?.message ||
              "The marketplace could not load. Please try again.",
          );
        if (!mounted.current || current !== generation.current) return;
        const incoming = result as MarketOverview;
        setOverview((previous) =>
          offset > 0 && previous
            ? {
                ...incoming,
                supply: mergeRecords(previous.supply, incoming.supply),
                demand: mergeRecords(previous.demand, incoming.demand),
                services: mergeRecords(previous.services, incoming.services),
                interests: mergeRecords(previous.interests, incoming.interests),
                matches: mergeRecords(previous.matches, incoming.matches),
              }
            : incoming,
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
    if (online) void read();
    else setLoading(false);
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [online, read]);

  function keyFor(path: string, body: unknown) {
    const fingerprint = `${path}:${JSON.stringify(body)}`;
    const existing = mutationKeys.current.get(fingerprint);
    if (existing) return existing;
    const key = crypto.randomUUID();
    mutationKeys.current.set(fingerprint, key);
    return key;
  }

  async function save(path: string, body: unknown, message: string) {
    if (!online) throw new Error("Reconnect to save this market record.");
    await request(path, "POST", body, keyFor(path, body));
    if (!mounted.current) return;
    setEditor(null);
    setSelectedDemand(null);
    notify(message);
    await read();
  }

  async function updateSupply(
    supply: SupplyListing,
    status: SupplyListing["status"],
  ) {
    if (!online || stateLock.current) return;
    stateLock.current = true;
    setBusyId(supply.id);
    setError("");
    const body = { version: supply.version, status };
    try {
      await request(
        `/api/marketplace/supply/${supply.id}`,
        "PATCH",
        body,
        keyFor(`supply:${supply.id}`, body),
      );
      notify(
        status === "sold"
          ? "Produce marked sold. This does not record a payment."
          : status === "paused"
            ? "Listing paused."
            : "Produce is available again.",
      );
      await read();
    } catch (failure) {
      if (mounted.current) setError(errorText(failure));
    } finally {
      stateLock.current = false;
      if (mounted.current) setBusyId("");
    }
  }

  function startListing(demand?: BuyerDemand) {
    setSelectedDemand(demand ?? null);
    setEditor(profile ? "supply" : "business");
  }

  async function publishSupply(supply: SupplyListing, published: boolean) {
    if (!online || stateLock.current)
      throw new Error("Reconnect and wait for the current change to finish.");
    stateLock.current = true;
    setBusyId(supply.id);
    const body = { version: supply.version, published };
    try {
      await request(
        `/api/marketplace/supply/${encodeURIComponent(supply.id)}/publication`,
        "POST",
        body,
        keyFor(`publication:${supply.id}`, body),
      );
      notify(
        published
          ? "Produce published to the buyer marketplace."
          : "Public listing removed.",
      );
      await read();
    } catch (failure) {
      // Refresh the version after a conflict while retaining the dialog's error.
      await read();
      throw failure;
    } finally {
      stateLock.current = false;
      if (mounted.current) setBusyId("");
    }
  }

  function offerFor(demand: BuyerDemand) {
    setSelectedDemand(demand);
    const matchingSupply =
      overview?.supply.filter(
        (item) =>
          (staff || item.profileId === profile?.id) &&
          item.status === "available" &&
          item.crop.toLowerCase() === demand.crop.toLowerCase(),
      ) || [];
    setEditor(
      matchingSupply.length ? "interest" : profile ? "supply" : "business",
    );
  }

  function changeTab(value: Tab) {
    setTab(value);
    setQuery("");
    setDistrict("");
  }
  const availableSupply =
    overview?.supply.filter((item) => item.status === "available") || [];
  const openDemand =
    overview?.demand.filter(
      (item) => item.status === "open" && item.deadline.slice(0, 10) >= today(),
    ) || [];
  const matchesByDemand = new Map<string, MarketMatch>();
  overview?.matches.forEach((match) => {
    const current = matchesByDemand.get(match.demandId);
    if (!current || match.quantityKg > current.quantityKg)
      matchesByDemand.set(match.demandId, match);
  });
  const filteredDemand = openDemand
    .filter(
      (item) =>
        demandSearch(item, deferredQuery) &&
        (!district || item.district === district) &&
        (!onlyMatching || matchesByDemand.has(item.id)),
    )
    .sort(
      (a, b) =>
        Number(matchesByDemand.has(b.id)) - Number(matchesByDemand.has(a.id)) ||
        a.deadline.localeCompare(b.deadline),
    );
  const filteredSupply =
    overview?.supply.filter(
      (item) =>
        supplySearch(item, deferredQuery) &&
        (!district || item.district === district),
    ) || [];
  const filteredServices =
    overview?.services.filter(
      (item) =>
        serviceSearch(item, deferredQuery) &&
        (!district || item.district === district) &&
        (category === "all" || item.category === category),
    ) || [];
  const matchingSupplies = selectedDemand
    ? overview?.supply.filter(
        (item) =>
          (staff || item.profileId === profile?.id) &&
          item.status === "available" &&
          item.crop.toLowerCase() === selectedDemand.crop.toLowerCase(),
      ) || []
    : [];
  const hasMore =
    overview && Object.values(overview.pagination.hasMore).some(Boolean);
  const nextOffset = overview
    ? overview.pagination.offset + overview.pagination.limit
    : 0;

  return (
    <div className="marketplace-page">
      <PageHeader
        title="Marketplace"
        description="Bring your harvest closer to its next buyer."
        action={
          <Button disabled={!online} onClick={() => startListing()}>
            <Plus size={17} />
            List my produce
          </Button>
        }
      />
      {!online ? (
        <Notice tone="warning">
          The marketplace needs a connection to check demand and save changes.
          Your saved farm records remain available in Farms.
        </Notice>
      ) : null}
      {overview?.sample ? (
        <div className="market-sample-notice">
          <Leaf size={15} />
          <span>
            Demo workspace · all sample buyers, produce and service quotes are
            illustrative.
          </span>
        </div>
      ) : null}
      {error ? <ErrorMessage message={error} /> : null}
      {loading ? (
        <Skeleton />
      ) : !overview ? (
        <Empty
          icon={Handshake}
          title={
            online
              ? "Your market workspace could not open."
              : "Connect to find your next market."
          }
          body="Check your connection, then refresh to see available buyers and services."
          action={
            <Button disabled={!online} onClick={() => void read()}>
              <RefreshCw size={16} />
              Try again
            </Button>
          }
        />
      ) : (
        <>
          <section
            className="marketplace-intro"
            aria-labelledby="market-intro-title"
          >
            <div className="marketplace-intro-copy">
              <span className="market-intro-kicker">
                <span />
                From farm to opportunity
              </span>
              <h2 id="market-intro-title">
                Your produce.
                <br /> A wider market.
              </h2>
              <p>
                Find real buyer requests, plan your next harvest and understand
                the costs between your farm and the market.
              </p>
              <div className="market-intro-actions">
                <Button onClick={() => startListing()} disabled={!online}>
                  {profile ? "Add available produce" : "Register my business"}
                  <ArrowRight size={16} />
                </Button>
                <Link to="/markets">
                  Check market prices
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
            <div className="marketplace-intro-image">
              <img
                src="/images/agribridge-market-640.webp"
                srcSet="/images/agribridge-market-640.webp 640w, /images/agribridge-market-1024.webp 1024w"
                sizes="(max-width: 700px) 100vw, 34vw"
                alt=""
                width="640"
                height="420"
              />
              <span>Connect. Agree. Grow.</span>
            </div>
          </section>
          <div
            className="market-overview-strip"
            aria-label="Current market workspace"
          >
            <span>
              <Handshake size={18} />
              <strong>{openDemand.length}</strong> buyer{" "}
              {openDemand.length === 1 ? "request" : "requests"}
            </span>
            <span>
              <PackageCheck size={18} />
              <strong>{availableSupply.length}</strong> available{" "}
              {availableSupply.length === 1 ? "listing" : "listings"}
            </span>
            <span>
              <MapPin size={18} />
              <strong>{profile?.district || "Your community"}</strong>
              <button onClick={() => setEditor("business")} disabled={!online}>
                {profile ? "Edit business" : "Set up business"}
                <ArrowRight size={13} />
              </button>
            </span>
          </div>
          <div
            className="market-tabs"
            role="tablist"
            aria-label="Marketplace sections"
          >
            {sections.map(({ id, label: sectionLabel, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                aria-controls={`market-panel-${id}`}
                id={`market-tab-${id}`}
                className={tab === id ? "active" : ""}
                onClick={() => changeTab(id)}
                onKeyDown={(event) => {
                  const index = sections.findIndex(
                    (section) => section.id === id,
                  );
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % sections.length
                      : event.key === "ArrowLeft"
                        ? (index - 1 + sections.length) % sections.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? sections.length - 1
                            : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  changeTab(sections[next].id);
                  document
                    .getElementById(`market-tab-${sections[next].id}`)
                    ?.focus();
                }}
              >
                <Icon size={17} />
                {id === "produce" && staff ? "Produce" : sectionLabel}
                {id === "buyers" && openDemand.length ? (
                  <span>{openDemand.length}</span>
                ) : null}
              </button>
            ))}
          </div>
          {tab !== "business" && tab !== "connections" ? (
            <div className="market-toolbar">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={
                  tab === "buyers"
                    ? "Search crop, buyer or community…"
                    : tab === "services"
                      ? "Search input, service or provider…"
                      : "Search your produce…"
                }
              />
              <label className="market-district-filter">
                <MapPin size={15} />
                <span className="sr-only">Filter by district</span>
                <select
                  value={district}
                  onChange={(event) => setDistrict(event.target.value)}
                  aria-label="Filter by district"
                >
                  <option value="">All districts</option>
                  {districts.map((item) => (
                    <option key={item.name}>{item.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </label>
              <Button
                variant="ghost"
                onClick={() => void read()}
                busy={refreshing}
                disabled={!online}
                aria-label="Refresh marketplace"
              >
                <RefreshCw size={16} />
              </Button>
            </div>
          ) : null}
          <section
            id={`market-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`market-tab-${tab}`}
            className="market-panel"
          >
            {tab === "buyers" ? (
              <>
                <div className="market-section-heading">
                  <div>
                    <h2>
                      {onlyMatching
                        ? "Requests that fit your produce"
                        : "Find your next buyer"}
                    </h2>
                    <p>
                      Actual demand recorded by your team. Final terms are
                      agreed together.
                    </p>
                  </div>
                  <div className="market-heading-actions">
                    {availableSupply.length ? (
                      <label className="market-match-toggle">
                        <input
                          type="checkbox"
                          checked={onlyMatching}
                          onChange={(event) =>
                            setOnlyMatching(event.target.checked)
                          }
                        />
                        <SlidersHorizontal size={15} />
                        Fits my produce
                      </label>
                    ) : null}
                    {staff ? (
                      <Button
                        variant="secondary"
                        disabled={!online}
                        onClick={() => setEditor("demand")}
                      >
                        <Plus size={16} />
                        Add buyer request
                      </Button>
                    ) : null}
                  </div>
                </div>
                {filteredDemand.length ? (
                  <div className="market-buyer-grid">
                    {filteredDemand.map((demand) => (
                      <BuyerCard
                        key={demand.id}
                        demand={demand}
                        match={matchesByDemand.get(demand.id)}
                        workspace={staff}
                        interest={overview.interests.find(
                          (interest) =>
                            interest.demandId === demand.id &&
                            interest.supplyId ===
                              matchesByDemand.get(demand.id)?.supplyId &&
                            interest.status !== "closed",
                        )}
                        online={online}
                        onOffer={() => offerFor(demand)}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty
                    icon={Handshake}
                    title={
                      query || district || onlyMatching
                        ? "No requests match these filters."
                        : "The next opportunity starts with your produce."
                    }
                    body={
                      query || district || onlyMatching
                        ? "Try another crop or district, or switch off the match filter."
                        : "List what you have and when it will be ready. Your team can help connect it to real buyer demand."
                    }
                    action={
                      <Button
                        variant="secondary"
                        disabled={!online}
                        onClick={() => startListing()}
                      >
                        <Plus size={16} />
                        List produce
                      </Button>
                    }
                  />
                )}
              </>
            ) : null}
            {tab === "produce" ? (
              <>
                <div className="market-section-heading">
                  <div>
                    <h2>
                      {staff
                        ? "Produce in your workspace"
                        : "Your available harvest"}
                    </h2>
                    <p>
                      Keep quantities and availability current so introductions
                      start with useful information.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={!online}
                    onClick={() => startListing()}
                  >
                    <Plus size={16} />
                    Add produce
                  </Button>
                </div>
                {filteredSupply.length ? (
                  <div className="market-supply-grid">
                    {filteredSupply.map((supply) => (
                      <SupplyCard
                        key={supply.id}
                        supply={supply}
                        matches={
                          overview.matches.filter(
                            (match) => match.supplyId === supply.id,
                          ).length
                        }
                        online={online}
                        busy={busyId === supply.id}
                        onState={(status) => void updateSupply(supply, status)}
                        publication={
                          <SupplyPublication
                            supply={supply}
                            online={online}
                            busy={busyId === supply.id}
                            onChange={(published) =>
                              publishSupply(supply, published)
                            }
                          />
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <Empty
                    icon={Sprout}
                    title="Tell the market what you're growing."
                    body="Add the variety, quantity and harvest window. You can discuss price and quality before a sale."
                    action={
                      <Button disabled={!online} onClick={() => startListing()}>
                        <Plus size={16} />
                        List my produce
                      </Button>
                    }
                  />
                )}
                {overview.interests.length ? (
                  <section className="market-followups">
                    <h3>Introductions & follow-up</h3>
                    <p>
                      Your team coordinates the next conversation. An
                      introduction is not a confirmed order.
                    </p>
                    {overview.interests.map((interest) => {
                      const demand = overview.demand.find(
                        (item) => item.id === interest.demandId,
                      );
                      return (
                        <div key={interest.id}>
                          <Handshake size={18} />
                          <span>
                            <strong>
                              {demand?.organization || "Buyer request"}
                            </strong>
                            <small>
                              {demand?.crop || "Produce introduction"} ·
                              requested {date(interest.createdAt)}
                            </small>
                          </span>
                          <Badge
                            tone={
                              interest.status === "acknowledged"
                                ? "green"
                                : "neutral"
                            }
                          >
                            {label(interest.status)}
                          </Badge>
                        </div>
                      );
                    })}
                  </section>
                ) : null}
              </>
            ) : null}
            {tab === "services" ? (
              <>
                <div className="market-section-heading">
                  <div>
                    <h2>Know the costs around your harvest</h2>
                    <p>
                      Compare sourced input, transport and storage quotes. Check
                      the unit and what is included.
                    </p>
                  </div>
                  {staff ? (
                    <Button
                      variant="secondary"
                      disabled={!online}
                      onClick={() => setEditor("service")}
                    >
                      <Plus size={16} />
                      Record a quote
                    </Button>
                  ) : null}
                </div>
                <div
                  className="market-category-tabs"
                  aria-label="Service category"
                >
                  {marketCategories.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={category === item.value}
                      className={category === item.value ? "active" : ""}
                      onClick={() => setCategory(item.value)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {filteredServices.length ? (
                  <div className="market-service-grid">
                    {filteredServices.map((quote) => (
                      <ServiceCard key={quote.id} quote={quote} />
                    ))}
                  </div>
                ) : (
                  <Empty
                    icon={Truck}
                    title="No sourced quotes for this search."
                    body="Try another district or service. The market desk can explain what is recorded; unavailable prices are never estimated."
                  />
                )}
              </>
            ) : null}
            {tab === "connections" ? (
              <>
                <SellerBuyerOrders online={online} onChange={read} />
                <MarketConnections />
              </>
            ) : null}
            {tab === "business" ? (
              <BusinessOverview
                profile={profile}
                onEdit={() => setEditor("business")}
                online={online}
              />
            ) : null}
          </section>
          {hasMore && tab !== "business" && tab !== "connections" ? (
            <div className="market-load-more">
              <p>Search covers the records loaded in this workspace.</p>
              <Button
                variant="secondary"
                disabled={!online}
                busy={refreshing}
                onClick={() => void read(nextOffset)}
              >
                Load more records
                <ChevronDown size={16} />
              </Button>
            </div>
          ) : null}
          <MarketDesk
            online={online}
            district={profile?.district || farmData.farms[0]?.district}
            crop={profile?.crops[0]}
          />
          <div className="market-support-links">
            <Link to="/weather">
              <CloudSun size={19} />
              <span>
                <strong>Plan around the forecast</strong>
                <small>Dated forecasts and official warning status</small>
              </span>
              <ArrowRight size={17} />
            </Link>
            <Link to="/settings">
              <Bell size={19} />
              <span>
                <strong>Connection & support</strong>
                <small>WhatsApp readiness and your channel preferences</small>
              </span>
              <ArrowRight size={17} />
            </Link>
          </div>
        </>
      )}
      {editor === "business" ? (
        <BusinessForm
          profile={profile}
          name={user?.name || ""}
          initialDistrict={farmData.farms[0]?.district}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      ) : null}
      {editor === "supply" && profile ? (
        <SupplyForm
          profile={profile}
          demand={selectedDemand}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      ) : null}
      {editor === "interest" && selectedDemand && matchingSupplies.length ? (
        <InterestForm
          demand={selectedDemand}
          supply={matchingSupplies}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      ) : null}
      {editor === "demand" && staff ? (
        <DemandForm onClose={() => setEditor(null)} onSave={save} />
      ) : null}
      {editor === "service" && staff ? (
        <ServiceForm onClose={() => setEditor(null)} onSave={save} />
      ) : null}
    </div>
  );
}

function BusinessOverview({
  profile,
  online,
  onEdit,
}: {
  profile: MarketOverview["profile"];
  online: boolean;
  onEdit: () => void;
}) {
  if (!profile)
    return (
      <section className="market-business-empty">
        <span>
          <Building2 size={34} strokeWidth={1.3} />
        </span>
        <h2>Give your farm a place in the market.</h2>
        <p>
          Your business profile connects your crops, location and harvest plans.
          It helps the team find relevant buyers and services.
        </p>
        <Button onClick={onEdit} disabled={!online}>
          Register my business
          <ArrowRight size={16} />
        </Button>
        <small>
          No email address is needed. Your account and payment verification
          remain separate.
        </small>
      </section>
    );
  return (
    <section className="market-business">
      <header>
        <span className="market-business-avatar">
          <Building2 size={30} strokeWidth={1.3} />
        </span>
        <div>
          <span className="market-record-label">
            Your business profile{profile.sample ? " · Sample" : ""}
          </span>
          <h2>{profile.businessName}</h2>
          <p>
            <MapPin size={15} />
            {profile.community}, {profile.district}
          </p>
        </div>
        <Button variant="secondary" onClick={onEdit} disabled={!online}>
          Edit business
        </Button>
      </header>
      <dl>
        <div>
          <dt>
            <UserRound size={16} />
            Farmer / representative
          </dt>
          <dd>{profile.name}</dd>
        </div>
        <div>
          <dt>Contact number</dt>
          <dd>{profile.phone}</dd>
        </div>
        <div>
          <dt>Farm size</dt>
          <dd>
            {profile.farmSizeAcres === null
              ? "Not recorded"
              : `${number(profile.farmSizeAcres)} acres`}
          </dd>
        </div>
        <div>
          <dt>Preferred language</dt>
          <dd>{profile.language === "lg" ? "Luganda" : "English"}</dd>
        </div>
        <div className="market-business-crops">
          <dt>
            <Sprout size={16} />
            What you grow
          </dt>
          <dd>
            {profile.crops.map((crop) => (
              <span key={crop}>{crop}</span>
            ))}
          </dd>
        </div>
        <div>
          <dt>
            <CalendarDays size={16} />
            Last updated
          </dt>
          <dd>{date(profile.updatedAt)}</dd>
        </div>
      </dl>
      <Notice>
        The contact number is self-reported. It does not verify payment
        ownership. Your team keeps payment checks and private records separate
        from market introductions.
      </Notice>
    </section>
  );
}
