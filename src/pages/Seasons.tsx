import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Plus,
  Pencil,
  Sprout,
  Calculator,
  PackageCheck,
  CloudSun,
  BookOpen,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import {
  Badge,
  Button,
  Empty,
  Field,
  Form,
  Modal,
  Notice,
  PageHeader,
  fieldNumber,
  fieldText,
} from "../components/ui";
import { date, label, number, today, ugx } from "../lib/format";
import { seasonNumbers } from "../lib/season";
import type { Season, SeasonCost, SeasonSale } from "../types";
import "../styles/planning.css";

function SeasonEditor({
  season,
  farmId,
  onClose,
}: {
  season?: Season;
  farmId?: string;
  onClose: () => void;
}) {
  const { data, mutate } = useApp();
  const [selectedFarm, setSelectedFarm] = useState(
    season?.farmId ?? farmId ?? data.farms[0]?.id ?? "",
  );
  const farm = data.farms.find((item) => item.id === selectedFarm);
  const [costs, setCosts] = useState<SeasonCost[]>(
    season?.costs ?? [
      {
        id: crypto.randomUUID(),
        category: "seed",
        label: "Seed or planting material",
        plannedUgx: 0,
        actualUgx: null,
      },
    ],
  );
  function updateCost(index: number, update: Partial<SeasonCost>) {
    setCosts((current) =>
      current.map((cost, i) => (i === index ? { ...cost, ...update } : cost)),
    );
  }
  return (
    <Modal
      wide
      title={season ? "Update your season" : "A plan you can count on."}
      description="Your estimates, in your own numbers. No yield or price is guaranteed."
      onClose={onClose}
    >
      <Form
        onCancel={onClose}
        submitLabel={season ? "Save season" : "Create season"}
        onSubmit={async (fd) => {
          if (!farm) throw new Error("Choose a farm first.");
          await mutate(
            season ? `/api/seasons/${season.id}` : "/api/seasons",
            season ? "PATCH" : "POST",
            {
              farmId: selectedFarm,
              name: fieldText(fd, "name"),
              crop: season?.crop ?? farm.crop,
              areaAcres: season?.areaAcres ?? farm.areaAcres,
              plantingDate: fieldText(fd, "plantingDate"),
              expectedHarvestDate: fieldText(fd, "expectedHarvestDate"),
              expectedHarvestKg: fieldNumber(fd, "expectedHarvestKg"),
              reserveKg: fieldNumber(fd, "reserveKg"),
              expectedPriceUgx: fieldNumber(fd, "expectedPriceUgx"),
              contingencyUgx: fieldNumber(fd, "contingencyUgx"),
              harvestedKg: fieldNumber(fd, "harvestedKg"),
              status: fieldText(fd, "status"),
              costs,
              sales: season?.sales ?? [],
              notes: fieldText(fd, "notes"),
              ...(season ? { version: season.version } : {}),
            },
          );
          onClose();
        }}
      >
        <Field label="Farm">
          <select
            value={selectedFarm}
            disabled={!!season}
            onChange={(e) => setSelectedFarm(e.target.value)}
          >
            {data.farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} · {f.crop}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Season name">
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={season?.name}
            placeholder="e.g. Second rains 2026"
          />
        </Field>
        <Field
          label="Planned planting date"
          hint="Confirm soil moisture, variety and timing with a local extension officer."
        >
          <input
            name="plantingDate"
            type="date"
            required
            defaultValue={season?.plantingDate ?? farm?.plantedAt ?? today()}
          />
        </Field>
        <Field label="Expected harvest date">
          <input
            name="expectedHarvestDate"
            type="date"
            required
            defaultValue={season?.expectedHarvestDate}
          />
        </Field>
        <Field
          label="Expected total harvest (kg)"
          hint="Your estimate, not an AI prediction."
        >
          <input
            name="expectedHarvestKg"
            type="number"
            required
            min="0"
            max="1000000000"
            step="0.1"
            defaultValue={season?.expectedHarvestKg ?? 0}
          />
        </Field>
        <Field label="Keep for food, seed or other uses (kg)">
          <input
            name="reserveKg"
            type="number"
            required
            min="0"
            step="0.1"
            defaultValue={season?.reserveKg ?? 0}
          />
        </Field>
        <Field
          label="Expected farm-gate price (UGX/kg)"
          hint="Use the price you expect to receive, after any buyer deductions."
        >
          <input
            name="expectedPriceUgx"
            type="number"
            required
            min="0"
            max="100000000"
            step="1"
            defaultValue={season?.expectedPriceUgx ?? 0}
          />
        </Field>
        <Field label="Extra cost allowance (UGX)">
          <input
            name="contingencyUgx"
            type="number"
            required
            min="0"
            step="1"
            defaultValue={season?.contingencyUgx ?? 0}
          />
        </Field>
        <section className="season-cost-editor">
          <h3>Plan costs. Record what you spend.</h3>
          <p>
            Include transport and storage. Leave spent blank if not yet
            recorded; 0 means no cash expense.
          </p>
          {costs.map((cost, index) => (
            <div className="season-cost-row" key={cost.id}>
              <Field label={`Cost ${index + 1}`}>
                <input
                  value={cost.label}
                  required
                  maxLength={160}
                  onChange={(e) => updateCost(index, { label: e.target.value })}
                />
              </Field>
              <Field label="Category">
                <select
                  value={cost.category}
                  onChange={(e) =>
                    updateCost(index, {
                      category: e.target.value as SeasonCost["category"],
                    })
                  }
                >
                  {[
                    "seed",
                    "inputs",
                    "labour",
                    "equipment",
                    "transport",
                    "storage",
                    "other",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {label(c)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Planned UGX">
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={cost.plannedUgx}
                  onChange={(e) =>
                    updateCost(index, { plannedUgx: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Spent UGX">
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Not recorded"
                  value={cost.actualUgx ?? ""}
                  onChange={(e) =>
                    updateCost(index, {
                      actualUgx:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                className="season-remove-cost"
                aria-label={`Remove cost ${index + 1}`}
                onClick={() =>
                  setCosts((current) =>
                    current.filter((item) => item.id !== cost.id),
                  )
                }
              >
                <X size={15} />
                Remove cost
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={costs.length >= 30}
            onClick={() =>
              setCosts((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  category: "other",
                  label: "",
                  plannedUgx: 0,
                  actualUgx: null,
                },
              ])
            }
          >
            <Plus size={16} />
            Add a cost
          </Button>
        </section>
        <Field
          label="Harvest recorded so far (kg)"
          hint="Season total. Harvest lots are separate traceability records; not automatically added here."
        >
          <input
            name="harvestedKg"
            type="number"
            min="0"
            step="0.1"
            required
            defaultValue={season?.harvestedKg ?? 0}
          />
        </Field>
        <Field label="Season status">
          <select name="status" defaultValue={season?.status ?? "planning"}>
            {["planning", "active", "closed"].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Planning notes">
          <textarea
            name="notes"
            maxLength={3000}
            rows={3}
            defaultValue={season?.notes}
            placeholder="Assumptions, variety, water access, or advice to confirm"
          />
        </Field>
      </Form>
    </Modal>
  );
}

function SaleEditor({
  season,
  sale,
  onClose,
}: {
  season: Season;
  sale?: SeasonSale;
  onClose: () => void;
}) {
  const { mutate } = useApp();
  return (
    <Modal
      title={sale ? "Update sale record" : "Record a sale"}
      description="Record keeping only. Agribridge does not collect or transfer this money."
      onClose={onClose}
    >
      <Form
        onCancel={onClose}
        submitLabel="Save sale record"
        onSubmit={async (fd) => {
          const next = {
            id: sale?.id ?? crypto.randomUUID(),
            date: fieldText(fd, "date"),
            buyer: fieldText(fd, "buyer"),
            quantityKg: fieldNumber(fd, "quantityKg"),
            unitPriceUgx: fieldNumber(fd, "unitPriceUgx"),
            receivedUgx: fieldNumber(fd, "receivedUgx"),
          };
          const sales = sale
            ? season.sales.map((item) => (item.id === sale.id ? next : item))
            : [...season.sales, next];
          await mutate(`/api/seasons/${season.id}`, "PATCH", {
            version: season.version,
            sales,
          });
          onClose();
        }}
      >
        <Field label="Sale date">
          <input
            type="date"
            name="date"
            required
            defaultValue={sale?.date ?? today()}
          />
        </Field>
        <Field label="Buyer name or reference">
          <input
            name="buyer"
            required
            maxLength={160}
            placeholder="Use a business reference where possible"
            defaultValue={sale?.buyer}
          />
        </Field>
        <Field label="Quantity sold (kg)">
          <input
            type="number"
            name="quantityKg"
            min="0.1"
            step="0.1"
            required
            defaultValue={sale?.quantityKg}
          />
        </Field>
        <Field label="Agreed price (UGX/kg)">
          <input
            type="number"
            name="unitPriceUgx"
            min="1"
            step="1"
            required
            defaultValue={sale?.unitPriceUgx}
          />
        </Field>
        <Field
          label="Money received so far (UGX)"
          hint="Enter the total received to date, not only the latest instalment."
        >
          <input
            type="number"
            name="receivedUgx"
            min="0"
            step="1"
            required
            defaultValue={sale?.receivedUgx ?? 0}
          />
        </Field>
      </Form>
    </Modal>
  );
}

export default function Seasons() {
  const { data, online } = useApp();
  const [params] = useSearchParams();
  const farmId = params.get("farm") ?? "";
  const seasons = (data.seasons ?? []).filter(
    (s) => !farmId || s.farmId === farmId,
  );
  const [editor, setEditor] = useState<Season | "new" | null>(null),
    [sale, setSale] = useState<{ season: Season; sale?: SeasonSale } | null>(
      null,
    );
  const [selected, setSelected] = useState("");
  const active = seasons.find((s) => s.id === selected) ?? seasons[0];
  const totals = active ? seasonNumbers(active) : null;
  const farm = data.farms.find((f) => f.id === active?.farmId);
  return (
    <>
      <PageHeader
        title="Season planner"
        description="Plan what to grow. Protect what you keep. Know what a sale really leaves."
        action={
          <Button
            disabled={!online || !data.farms.length}
            onClick={() => setEditor("new")}
          >
            <Plus size={18} />
            Plan a season
          </Button>
        }
      />
      {!online && (
        <Notice tone="warning">
          Season budgets and sales need a connection. Private financial records
          are not stored for offline browsing.
        </Notice>
      )}
      <details className="panel season-input-check">
        <summary>Before you spend: check your planting material</summary>
        <div>
          <p>
            Keep the seller's name, variety or batch reference, and receipt
            details in your season notes. Confirm suitability and current
            supplier authorization with a local extension officer or the
            relevant authority.
          </p>
          <p>
            NARO's published guidance describes varietal identification numbers
            for NARO seed. Its linked licence list is dated October 2023; it is
            not live supplier verification, and a printed code alone does not
            prove authenticity.
          </p>
          <a
            className="text-link"
            href="https://naro.go.ug/e-library/reports/licenced-seed-companies-to-commercialize-naro-plant-varieties/"
            target="_blank"
            rel="noreferrer"
          >
            Read NARO seed guidance
            <ArrowRight size={15} />
          </a>
          <a
            className="text-link"
            href="https://www.agriculture.go.ug/directorate-of-crop-resources/"
            target="_blank"
            rel="noreferrer"
          >
            MAAIF crop inspection and certification
            <ArrowRight size={15} />
          </a>
        </div>
      </details>
      {!seasons.length ? (
        <Empty
          icon={Sprout}
          title="Start with your own numbers."
          body={
            data.farms.length
              ? "Choose a farm, estimate your costs, and keep some harvest for your household."
              : "Add your farm first, then build a season plan."
          }
          action={
            <Link className="button button-secondary" to="/farms">
              My farms
              <ArrowRight size={16} />
            </Link>
          }
        />
      ) : (
        <>
          <div
            className="season-picker"
            role="group"
            aria-label="Choose season"
          >
            {seasons.map((s) => (
              <button
                key={s.id}
                className={s.id === active?.id ? "selected" : ""}
                onClick={() => setSelected(s.id)}
              >
                <Sprout size={17} />
                <span>
                  {s.name}
                  <small>
                    {s.crop} ·{" "}
                    {data.farms.find((f) => f.id === s.farmId)?.name ?? "Farm"}
                  </small>
                </span>
                <Badge>{label(s.status)}</Badge>
              </button>
            ))}
          </div>
          {active && totals && (
            <>
              <section className="panel season-heading">
                <div>
                  <span className="eyebrow">
                    {farm?.district} · {number(active.areaAcres)} acres
                  </span>
                  <h2>{active.name}</h2>
                  <p>
                    Planting {date(active.plantingDate)} · Expected harvest{" "}
                    {date(active.expectedHarvestDate)}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={!online}
                  onClick={() => setEditor(active)}
                >
                  <Pencil size={16} />
                  Update plan & costs
                </Button>
              </section>
              <div className="season-metrics">
                <section className="panel">
                  <span>Planned costs + allowance</span>
                  <strong>{ugx(totals.plannedCost)}</strong>
                  <small>{ugx(totals.actualCost)} costs recorded so far</small>
                </section>
                <section className="panel">
                  <span>Harvest planned for sale</span>
                  <strong>{number(totals.saleableKg)} kg</strong>
                  <small>
                    {number(active.reserveKg)} kg kept for food, seed or other
                    uses
                  </small>
                </section>
                <section className="panel">
                  <span>Planned cash margin</span>
                  <strong className={totals.margin < 0 ? "negative" : ""}>
                    {ugx(totals.margin)}
                  </strong>
                  <small>
                    Expected sales less planned costs. Not guaranteed profit.
                  </small>
                </section>
              </div>
              <div className="season-detail-grid">
                <section className="panel season-analysis">
                  <div className="panel-header">
                    <h2>A reality check</h2>
                    <Calculator size={21} />
                  </div>
                  <dl>
                    <div>
                      <dt>Expected sales value</dt>
                      <dd>{ugx(totals.revenue)}</dd>
                    </div>
                    <div>
                      <dt>Break-even selling price</dt>
                      <dd>
                        {totals.breakEven === null
                          ? "No saleable harvest"
                          : `${ugx(totals.breakEven)} / kg`}
                      </dd>
                    </div>
                    <div>
                      <dt>If harvest and price each fall 20%</dt>
                      <dd className={totals.downside < 0 ? "negative" : ""}>
                        {ugx(totals.downside)}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    Stress test keeps your household reserve and planned costs
                    unchanged. This is arithmetic, not a forecast. Unrecorded
                    costs, unpaid family work, and asset depreciation are not
                    included.
                  </p>
                  <Link className="text-link" to="/markets">
                    Check price sources and dates
                    <ArrowRight size={16} />
                  </Link>
                </section>
                <section className="panel season-analysis">
                  <div className="panel-header">
                    <h2>Cash you can account for</h2>
                    <Button
                      variant="secondary"
                      disabled={!online || active.sales.length >= 100}
                      onClick={() => setSale({ season: active })}
                    >
                      <Plus size={16} />
                      Record sale
                    </Button>
                  </div>
                  <dl>
                    <div>
                      <dt>Harvest recorded</dt>
                      <dd>{number(active.harvestedKg)} kg</dd>
                    </div>
                    <div>
                      <dt>Sales recorded</dt>
                      <dd>
                        {number(totals.soldKg)} kg · {ugx(totals.salesValue)}
                      </dd>
                    </div>
                    <div>
                      <dt>Still to receive</dt>
                      <dd>{ugx(totals.outstanding)}</dd>
                    </div>
                    <div>
                      <dt>Received less costs recorded</dt>
                      <dd className={totals.cashBalance < 0 ? "negative" : ""}>
                        {ugx(totals.cashBalance)}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    Based only on records entered here.{" "}
                    {active.costs.filter((c) => c.actualUgx === null).length}{" "}
                    cost lines not yet recorded. Not a bank balance, invoice, or
                    payment confirmation.
                  </p>
                </section>
              </div>
              <section className="panel season-next">
                <h2>Put the plan into practice</h2>
                <div>
                  <Link
                    to={`/weather?district=${encodeURIComponent(farm?.district ?? "Nakaseke")}`}
                  >
                    <CloudSun />
                    <span>
                      Check local weather
                      <small>Forecasts with source and update time</small>
                    </span>
                    <ArrowRight size={16} />
                  </Link>
                  <Link to={`/learn?crop=${encodeURIComponent(active.crop)}`}>
                    <BookOpen />
                    <span>
                      Build your crop knowledge
                      <small>Check whether guidance is locally reviewed</small>
                    </span>
                    <ArrowRight size={16} />
                  </Link>
                  <Link to={`/harvest?season=${active.id}`}>
                    <PackageCheck />
                    <span>
                      Record the harvest
                      <small>Keep lots traceable for collection</small>
                    </span>
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </section>
              {active.sales.length > 0 && (
                <section className="panel season-sales">
                  <div className="panel-header">
                    <h2>Your sale records</h2>
                  </div>
                  {active.sales.map((s) => (
                    <div className="season-sale" key={s.id}>
                      <div>
                        <strong>{s.buyer}</strong>
                        <small>
                          {date(s.date)} · {number(s.quantityKg)} kg ×{" "}
                          {ugx(s.unitPriceUgx)}
                        </small>
                      </div>
                      <div>
                        <strong>{ugx(s.receivedUgx)} received</strong>
                        <small>
                          {ugx(
                            Math.round(s.quantityKg * s.unitPriceUgx) -
                              s.receivedUgx,
                          )}{" "}
                          outstanding
                        </small>
                      </div>
                      <Button
                        variant="ghost"
                        disabled={!online}
                        onClick={() => setSale({ season: active, sale: s })}
                      >
                        <Pencil size={15} />
                        Update record
                      </Button>
                    </div>
                  ))}
                </section>
              )}
              {active.notes && <Notice>{active.notes}</Notice>}
            </>
          )}
        </>
      )}
      {editor && (
        <SeasonEditor
          season={editor === "new" ? undefined : editor}
          farmId={farmId}
          onClose={() => setEditor(null)}
        />
      )}
      {sale && (
        <SaleEditor
          season={sale.season}
          sale={sale.sale}
          onClose={() => setSale(null)}
        />
      )}
    </>
  );
}
