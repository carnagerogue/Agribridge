import {
  ArrowRight,
  CalendarDays,
  Check,
  ExternalLink,
  MapPin,
  PackageCheck,
  Truck,
  Warehouse,
  Sprout,
} from "lucide-react";
import { Badge, Button } from "../ui";
import type { ReactNode } from "react";
import { label, number, ugx } from "../../lib/format";
import { safeMarketSource, marketDate as date } from "../../lib/marketplace";
import type {
  BuyerDemand,
  MarketInterest,
  MarketMatch,
  MarketServiceQuote,
  SupplyListing,
} from "../../../server/marketplace-types";

export function BuyerCard({
  demand,
  match,
  interest,
  online,
  workspace,
  onOffer,
}: {
  demand: BuyerDemand;
  match?: MarketMatch;
  interest?: MarketInterest;
  online: boolean;
  workspace?: boolean;
  onOffer: () => void;
}) {
  const pending = interest && interest.status !== "closed";
  return (
    <article className={`market-buyer-card${match ? " has-match" : ""}`}>
      <header>
        <div className="market-crop-mark" aria-hidden="true">
          <Sprout size={23} strokeWidth={1.6} />
        </div>
        <div>
          <span className="market-record-label">
            Buyer request{demand.sample ? " · Sample" : ""}
          </span>
          <h3>
            {demand.crop}
            {demand.variety ? ` · ${demand.variety}` : ""}
          </h3>
          <p>{demand.organization}</p>
        </div>
        {match ? (
          <Badge tone="green">
            {workspace ? "Fits recorded produce" : "Fits your produce"}
          </Badge>
        ) : null}
      </header>
      <dl className="market-buyer-facts">
        <div>
          <dt>Quantity needed</dt>
          <dd>
            {number(demand.quantityKg)} <small>kg</small>
          </dd>
        </div>
        <div>
          <dt>Buyer price</dt>
          <dd>
            {demand.priceUgxPerKg === null ? (
              <span className="market-price-quote">To be agreed</span>
            ) : (
              <>
                {ugx(demand.priceUgxPerKg)} <small>/ kg</small>
              </>
            )}
          </dd>
        </div>
      </dl>
      <div className="market-record-meta">
        <span>
          <MapPin size={15} />
          {demand.district}
        </span>
        <span>
          <CalendarDays size={15} />
          By {date(demand.deadline)}
        </span>
      </div>
      <div className="market-buyer-requirements">
        <span>Quality & terms</span>
        <p>
          {[demand.grade, demand.requirements].filter(Boolean).join(". ") ||
            "Quality, handling and final terms need agreement with the buyer."}
        </p>
      </div>
      {match ? (
        <div className="market-match">
          <span>
            <Check size={15} />
            {number(match.quantityKg)} kg may fit this request
          </span>
          <p>{match.reasons.slice(0, 2).join(" · ")}</p>
          <details>
            <summary>What still needs checking</summary>
            <ul>
              {match.checks.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ul>
            <p>
              Compatibility is based on your recorded produce. It is not a
              confirmed purchase or quality approval.
            </p>
          </details>
        </div>
      ) : null}
      <footer>
        <span>
          {pending
            ? interest.status === "acknowledged"
              ? "Team is following up"
              : "Introduction requested"
            : "Confirm terms before committing"}
        </span>
        <Button
          variant={match ? "primary" : "secondary"}
          disabled={!online || !!pending}
          onClick={onOffer}
        >
          {pending ? (
            <>
              <Check size={16} />
              Interest sent
            </>
          ) : (
            <>
              {match ? "Request introduction" : "Offer produce"}
              <ArrowRight size={16} />
            </>
          )}
        </Button>
      </footer>
    </article>
  );
}

export function ServiceCard({ quote }: { quote: MarketServiceQuote }) {
  const Icon =
    quote.category === "transport"
      ? Truck
      : quote.category === "storage"
        ? Warehouse
        : Sprout;
  const source = safeMarketSource(quote.sourceUrl);
  return (
    <article className="market-service-card">
      <div className="market-service-heading">
        <span className={`market-service-icon service-${quote.category}`}>
          <Icon size={21} strokeWidth={1.6} />
        </span>
        <span className="market-record-label">
          {quote.category === "input" ? "Farm input" : label(quote.category)}
        </span>
        <Badge
          tone={
            quote.freshness === "current" &&
            quote.verificationStatus === "verified"
              ? "green"
              : "amber"
          }
        >
          {quote.sample
            ? "Sample quote"
            : quote.freshness === "expired"
              ? "Expired quote"
              : quote.freshness === "future"
                ? "Future-dated"
                : quote.verificationStatus === "verified"
                  ? "Team checked"
                  : "Reported"}
        </Badge>
      </div>
      <h3>{quote.name}</h3>
      <p className="market-service-provider">{quote.provider}</p>
      <p className="market-service-price">
        {ugx(quote.priceUgx)} <span>/ {quote.unit}</span>
      </p>
      <div className="market-record-meta">
        <span>
          <MapPin size={15} />
          {quote.district}
          {quote.community ? ` · ${quote.community}` : ""}
        </span>
      </div>
      {quote.notes ? (
        <p className="market-service-notes">{quote.notes}</p>
      ) : null}
      <footer>
        <span>
          Observed {date(quote.observedAt)} · valid to {date(quote.validUntil)}
        </span>
        {source ? (
          <a href={source} target="_blank" rel="noopener noreferrer">
            {quote.sourceTitle}
            <ExternalLink size={13} />
          </a>
        ) : (
          <span>Source: {quote.sourceTitle}</span>
        )}
      </footer>
    </article>
  );
}

export function SupplyCard({
  supply,
  matches,
  busy,
  online,
  onState,
  publication,
}: {
  supply: SupplyListing;
  matches: number;
  busy: boolean;
  online: boolean;
  onState: (status: SupplyListing["status"]) => void;
  publication?: ReactNode;
}) {
  return (
    <article className="market-supply-card">
      <div className="market-supply-top">
        <span className="market-crop-mark">
          <PackageCheck size={23} strokeWidth={1.5} />
        </span>
        <div>
          <h3>
            {supply.crop}
            {supply.variety ? ` · ${supply.variety}` : ""}
          </h3>
          <span>
            {supply.community}, {supply.district}
          </span>
        </div>
        <Badge tone={supply.status === "available" ? "green" : "neutral"}>
          {label(supply.status)}
        </Badge>
      </div>
      <div className="market-supply-values">
        <strong>
          {number(supply.remainingQuantityKg ?? supply.quantityKg)}{" "}
          <span>kg uncommitted</span>
        </strong>
        <strong>
          {supply.expectedPriceUgxPerKg === null
            ? "Price to discuss"
            : ugx(supply.expectedPriceUgxPerKg)}
          {supply.expectedPriceUgxPerKg !== null ? (
            <span> / kg asking</span>
          ) : null}
        </strong>
      </div>
      <div className="market-record-meta">
        <span>
          <CalendarDays size={15} />
          {date(supply.harvestFrom)} – {date(supply.harvestUntil)}
        </span>
      </div>
      <p className="market-supply-quality">
        {supply.grade
          ? `Reported grade: ${supply.grade}. `
          : "Grade not assessed. "}
        {supply.qualityNotes ||
          "Buyer inspection and final terms may be required."}
      </p>
      <footer>
        <span>
          {supply.sample ? "Sample produce · " : ""}
          {matches
            ? `${matches} compatible ${matches === 1 ? "request" : "requests"}`
            : "No compatible requests yet"}
        </span>
        <div>
          {supply.status === "available" ? (
            <>
              <Button
                variant="ghost"
                busy={busy}
                disabled={!online}
                onClick={() => onState("paused")}
              >
                Pause
              </Button>
              <Button
                variant="secondary"
                disabled={!online || busy}
                onClick={() => onState("sold")}
              >
                Mark sold
              </Button>
            </>
          ) : supply.status === "paused" ? (
            <Button
              variant="secondary"
              busy={busy}
              disabled={!online}
              onClick={() => onState("available")}
            >
              Make available
            </Button>
          ) : (
            <span className="market-status-final">
              <Check size={15} />
              Sold
            </span>
          )}
        </div>
      </footer>
      {publication}
    </article>
  );
}
