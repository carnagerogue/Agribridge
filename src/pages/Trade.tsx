import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe2,
  Pencil,
  Plus,
  Truck,
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
  Skeleton,
  fieldNumber,
  fieldText,
} from "../components/ui";
import { crops, label, number, ugx } from "../lib/format";
import type { Deal } from "../types";
import { useRecordDetails } from "../lib/useRecordDetails";

const stages: Deal["stage"][] = [
  "inquiry",
  "qualified",
  "contracted",
  "in_transit",
  "delivered",
];
const readiness = [
  "Buyer due diligence",
  "Quality specification",
  "Quantity and delivery agreement",
  "Contract signed",
  "Origin and traceability",
  "Destination requirements checked",
  "Transport booked",
  "Documents reviewed",
];

function DealEditor({
  deal,
  onClose,
  onSaved,
}: {
  deal?: Deal;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { mutate } = useApp();
  async function save(form: FormData) {
    const body = {
      buyer: fieldText(form, "buyer"),
      crop: fieldText(form, "crop"),
      quantityKg: fieldNumber(form, "quantityKg"),
      priceUgx: fieldNumber(form, "priceUgx"),
      destination: fieldText(form, "destination"),
      incoterm: fieldText(form, "incoterm"),
      stage: fieldText(form, "stage"),
      checklist: form.getAll("checklist").map(String),
      notes: fieldText(form, "notes"),
      ...(deal ? { version: deal.version } : {}),
    };
    const result = await mutate<Deal>(
      deal ? `/api/deals/${deal.id}` : "/api/deals",
      deal ? "PATCH" : "POST",
      body,
      false,
    );
    if (!("queued" in result)) onSaved(result.id);
    onClose();
  }
  return (
    <Modal
      title={deal ? "Edit trade opportunity" : "Create trade opportunity"}
      description="Bring the buyer, product, terms and next steps into one record."
      onClose={onClose}
      wide
    >
      <Form
        onSubmit={save}
        onCancel={onClose}
        submitLabel={deal ? "Save opportunity" : "Create opportunity"}
      >
        <Field label="Buyer or trading partner">
          <input
            name="buyer"
            defaultValue={deal?.buyer}
            required
            maxLength={160}
          />
        </Field>
        <Field label="Crop">
          <input
            name="crop"
            list="trade-crops"
            defaultValue={deal?.crop}
            required
            maxLength={160}
          />
          <datalist id="trade-crops">
            {crops.map((crop) => (
              <option key={crop} value={crop} />
            ))}
          </datalist>
        </Field>
        <Field label="Quantity (kg)">
          <input
            name="quantityKg"
            type="number"
            defaultValue={deal?.quantityKg}
            min="0.1"
            max="1000000000"
            step="0.1"
            required
          />
        </Field>
        <Field label="Quoted price (UGX per kg)">
          <input
            name="priceUgx"
            type="number"
            defaultValue={deal?.priceUgx}
            min="1"
            max="1000000000"
            step="1"
            required
          />
        </Field>
        <Field
          label="Destination"
          hint="City and country, including inbound destinations in Uganda."
        >
          <input
            name="destination"
            defaultValue={deal?.destination}
            placeholder="Kigali, Rwanda"
            required
            maxLength={160}
          />
        </Field>
        <Field
          label="Agreed trade term"
          hint="Match the term and named place in your contract."
        >
          <select name="incoterm" defaultValue={deal?.incoterm ?? "FCA"}>
            {["EXW", "FCA", "FOB", "CIF", "DAP"].map((term) => (
              <option key={term}>{term}</option>
            ))}
          </select>
        </Field>
        <Field label="Stage">
          <select name="stage" defaultValue={deal?.stage ?? "inquiry"}>
            {stages.map((stage) => (
              <option key={stage} value={stage}>
                {label(stage)}
              </option>
            ))}
          </select>
        </Field>
        <div className="op-full">
          <fieldset className="op-fieldset">
            <legend>Readiness checks already completed</legend>
            <div className="op-checkbox-grid">
              {[...new Set([...readiness, ...(deal?.checklist ?? [])])].map(
                (item) => (
                  <label className="op-check" key={item}>
                    <input
                      name="checklist"
                      type="checkbox"
                      value={item}
                      defaultChecked={deal?.checklist.includes(item)}
                    />
                    <span>{item}</span>
                  </label>
                ),
              )}
            </div>
          </fieldset>
        </div>
        <div className="op-full">
          <Field label="Notes and named delivery place">
            <textarea
              name="notes"
              defaultValue={deal?.notes}
              rows={3}
              maxLength={3000}
              placeholder="Record important dates, the named delivery place and who owns the next action."
            />
          </Field>
        </div>
      </Form>
    </Modal>
  );
}

export default function Trade() {
  const { user, data, loading, error, online, refresh, mutate } = useApp();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<Deal | "new" | null>(null),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  const { detailRef, listRef, openDetails, backToList } = useRecordDetails(
    (id) => {
      setSelectedId(id);
      setActionError("");
    },
  );
  const closeEditor = useCallback(() => setEditor(null), []);
  const deals = useMemo(
    () =>
      data.deals.filter(
        (deal) =>
          (filter === "all" || filter === deal.stage) &&
          `${deal.buyer} ${deal.crop} ${deal.destination}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [data.deals, filter, query],
  );
  const selected = deals.find((deal) => deal.id === selectedId) ?? deals[0];
  const nextStage = selected && stages[stages.indexOf(selected.stage) + 1];
  async function update(body: Partial<Deal>) {
    if (!selected) return;
    setBusy(true);
    setActionError("");
    try {
      await mutate(
        `/api/deals/${selected.id}`,
        "PATCH",
        { ...body, version: selected.version },
        false,
      );
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Unable to update this opportunity.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (user?.role === "farmer")
    return (
      <Empty
        icon={Globe2}
        title="Trade is managed by your cooperative"
        body="Your authorized trade team coordinates buyers, agreements and cross-border readiness."
      />
    );
  if (loading) return <Skeleton />;
  return (
    <>
      <PageHeader
        title="Trade desk"
        description="From a buyer's interest to a well-prepared delivery."
        action={
          <Button onClick={() => setEditor("new")} disabled={!online}>
            <Plus size={17} />
            New opportunity
          </Button>
        }
      />
      {!online && (
        <Notice>
          Trade records need a connection and are not stored on this device for
          offline use.
        </Notice>
      )}
      {error && (
        <div className="op-error">
          <ErrorMessage message={error} />
          <Button
            variant="secondary"
            onClick={() => void refresh().catch(() => {})}
          >
            Try again
          </Button>
        </div>
      )}
      <div className="stat-strip">
        <div className="stat">
          <span>Open opportunities</span>
          <strong>
            {data.deals.filter((deal) => deal.stage !== "delivered").length}
          </strong>
        </div>
        <div className="stat">
          <span>Quoted pipeline value</span>
          <strong className="op-stat-value">
            {ugx(
              data.deals
                .filter((deal) => deal.stage !== "delivered")
                .reduce(
                  (sum, deal) => sum + deal.priceUgx * deal.quantityKg,
                  0,
                ),
            )}
          </strong>
        </div>
        <div className="stat">
          <span>In transit</span>
          <strong>
            {data.deals.filter((deal) => deal.stage === "in_transit").length}
          </strong>
        </div>
      </div>
      <div className="toolbar">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search buyers, crops or destinations"
        />
        <select
          aria-label="Filter trade stage"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All stages</option>
          {stages.map((stage) => (
            <option key={stage} value={stage}>
              {label(stage)}
            </option>
          ))}
        </select>
      </div>
      <div className="split-layout op-trade-layout">
        <section className="panel">
          <div className="panel-header">
            <h2 ref={listRef} tabIndex={-1} className="op-focus-target">
              Opportunities
            </h2>
            <span className="muted">{deals.length} records</span>
          </div>
          {deals.length ? (
            <div className="table-wrap">
              <table
                className="data-table op-record-table"
                role="table"
                aria-label="Trade opportunities"
              >
                <thead role="rowgroup">
                  <tr role="row">
                    <th scope="col">Buyer / destination</th>
                    <th scope="col">Product</th>
                    <th scope="col">Stage</th>
                    <th scope="col">
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {deals.map((deal) => (
                    <tr
                      role="row"
                      key={deal.id}
                      className={
                        selected?.id === deal.id ? "op-selected-row" : ""
                      }
                    >
                      <td role="cell">
                        <button
                          className="op-record-link"
                          onClick={(event) =>
                            openDetails(deal.id, event.currentTarget)
                          }
                          aria-controls="trade-record-detail"
                          aria-pressed={selected?.id === deal.id}
                        >
                          <strong>{deal.buyer}</strong>
                          <small>{deal.destination}</small>
                        </button>
                      </td>
                      <td role="cell" data-label="Product">
                        {deal.crop}
                        <small className="op-cell-secondary">
                          {number(deal.quantityKg)} kg · {deal.incoterm}
                        </small>
                      </td>
                      <td role="cell" data-label="Stage">
                        <Badge
                          tone={
                            deal.stage === "delivered"
                              ? "green"
                              : deal.stage === "in_transit"
                                ? "blue"
                                : "neutral"
                          }
                        >
                          {label(deal.stage)}
                        </Badge>
                      </td>
                      <td role="cell">
                        <button
                          className="row-action"
                          onClick={(event) =>
                            openDetails(deal.id, event.currentTarget)
                          }
                          aria-controls="trade-record-detail"
                          aria-label={`View details for trade with ${deal.buyer}`}
                        >
                          <span className="op-card-action-label">
                            View details
                          </span>
                          <ArrowRight size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              icon={Truck}
              title={
                query || filter !== "all"
                  ? "No matching opportunities"
                  : "Start your next trade"
              }
              body={
                query || filter !== "all"
                  ? "Try another buyer, crop or stage."
                  : "Record a buyer inquiry and work through the details with your team."
              }
              action={
                query || filter !== "all" ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={() => setEditor("new")} disabled={!online}>
                    Create opportunity
                  </Button>
                )
              }
            />
          )}
        </section>
        {selected && (
          <aside
            className="panel detail-panel op-focus-target"
            id="trade-record-detail"
            ref={detailRef}
            tabIndex={-1}
            aria-labelledby="trade-record-name"
          >
            <button
              type="button"
              className="op-mobile-back text-link"
              onClick={backToList}
            >
              <ArrowLeft size={16} /> Back to opportunities
            </button>
            <div className="panel-header">
              <span className="op-eyebrow">Trade detail</span>
              <button
                className="row-action"
                disabled={!online || busy}
                onClick={() => setEditor(selected)}
                aria-label="Edit selected trade"
              >
                <Pencil size={17} />
              </button>
            </div>
            <div className="op-detail-body">
              <h2 id="trade-record-name">{selected.buyer}</h2>
              <p className="muted">
                <Globe2 size={16} className="op-inline-icon" />
                {selected.destination}
              </p>
              <dl className="op-facts">
                <div>
                  <dt>Product</dt>
                  <dd>{selected.crop}</dd>
                </div>
                <div>
                  <dt>Quantity</dt>
                  <dd>{number(selected.quantityKg)} kg</dd>
                </div>
                <div>
                  <dt>Price per kg</dt>
                  <dd>{ugx(selected.priceUgx)}</dd>
                </div>
                <div>
                  <dt>Quoted value</dt>
                  <dd>{ugx(selected.quantityKg * selected.priceUgx)}</dd>
                </div>
                <div>
                  <dt>Trade term</dt>
                  <dd>{selected.incoterm}</dd>
                </div>
              </dl>
              <ol className="op-stage-track" aria-label="Trade progress">
                {stages.map((stage, index) => (
                  <li
                    key={stage}
                    className={
                      index <= stages.indexOf(selected.stage) ? "reached" : ""
                    }
                    aria-current={stage === selected.stage ? "step" : undefined}
                  >
                    <span>
                      {index < stages.indexOf(selected.stage) ? (
                        <Check size={12} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <small>{label(stage)}</small>
                  </li>
                ))}
              </ol>
              {nextStage && (
                <Button
                  variant="secondary"
                  onClick={() => void update({ stage: nextStage })}
                  busy={busy}
                  disabled={!online}
                >
                  Move to {label(nextStage).toLowerCase()}
                  <ArrowRight size={16} />
                </Button>
              )}
              <div className="op-checklist">
                <div className="op-section-title">
                  <h3>Readiness</h3>
                  <span className="muted">
                    {selected.checklist.length} completed
                  </span>
                </div>
                {[...new Set([...readiness, ...selected.checklist])].map(
                  (item) => (
                    <label className="op-check" key={item}>
                      <input
                        type="checkbox"
                        checked={selected.checklist.includes(item)}
                        disabled={!online || busy}
                        onChange={() =>
                          void update({
                            checklist: selected.checklist.includes(item)
                              ? selected.checklist.filter(
                                  (check) => check !== item,
                                )
                              : [...selected.checklist, item],
                          })
                        }
                      />
                      <span>{item}</span>
                    </label>
                  ),
                )}
              </div>
              <div className="op-note">
                <h3>Team notes</h3>
                <p>{selected.notes || "No notes recorded."}</p>
              </div>
              {actionError && <ErrorMessage message={actionError} />}
            </div>
          </aside>
        )}
      </div>
      <p className="op-footnote">
        Readiness and stages are team records. Confirm commodity and destination
        requirements with your freight and customs partners. This workspace does
        not clear goods or process payments.
      </p>
      {editor && (
        <DealEditor
          deal={editor === "new" ? undefined : editor}
          onClose={closeEditor}
          onSaved={(id) => {
            setSelectedId(id);
            setQuery("");
            setFilter("all");
            setActionError("");
          }}
        />
      )}
    </>
  );
}
