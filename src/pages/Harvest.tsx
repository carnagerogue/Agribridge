import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  ClipboardCheck,
  PackageCheck,
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
import {
  crops,
  date,
  dateTime,
  label,
  number,
  today,
  ugx,
} from "../lib/format";
import type {
  HarvestLot,
  Collection as HarvestCollection,
  Season,
} from "../types";
import "../styles/harvest.css";
import { useRecordDetails } from "../lib/useRecordDetails";

const qualityStatuses: HarvestLot["qualityStatus"][] = [
  "unassessed",
  "pending_test",
  "accepted",
  "on_hold",
  "rejected",
];
const collectionStatuses: HarvestCollection["status"][] = [
  "planning",
  "confirmed",
  "dispatched",
  "cancelled",
];
const qualityTone = (status: HarvestLot["qualityStatus"]) =>
  status === "accepted"
    ? "green"
    : status === "rejected"
      ? "red"
      : status === "on_hold" || status === "pending_test"
        ? "amber"
        : "neutral";
const collectionTone = (status: HarvestCollection["status"]) =>
  status === "dispatched"
    ? "green"
    : status === "confirmed"
      ? "blue"
      : status === "cancelled"
        ? "neutral"
        : "amber";

export function eligibleLots(
  lots: HarvestLot[],
  crop: string,
  collectionId?: string,
) {
  return lots.filter(
    (lot) =>
      lot.crop.trim().toLowerCase() === crop.trim().toLowerCase() &&
      lot.qualityStatus === "accepted" &&
      (!lot.allocation || lot.allocation.collectionId === collectionId),
  );
}

export function collectionLotRows(
  collection: HarvestCollection,
  lots: HarvestLot[],
) {
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  // Final collections retain their original manifest even when released lots change.
  if (collection.manifest)
    return collection.manifest.map((item) => ({
      id: item.lotId,
      code: item.lotCode,
      quantityKg: item.quantityKg,
      farmId: lotById.get(item.lotId)?.farmId,
    }));
  return collection.lotIds.map((id) => {
    const lot = lotById.get(id);
    return {
      id,
      code: lot?.lotCode ?? "Lot record",
      quantityKg: lot?.quantityKg ?? null,
      farmId: lot?.farmId,
    };
  });
}

function LotEditor({
  lot,
  season,
  onClose,
  onSaved,
}: {
  lot?: HarvestLot;
  season?: Season;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { data, mutate, user } = useApp();
  const [farmId, setFarmId] = useState(
    lot?.farmId ?? season?.farmId ?? data.farms[0]?.id ?? "",
  );
  const [crop, setCrop] = useState(
    lot?.crop ?? season?.crop ?? data.farms[0]?.crop ?? "",
  );
  const [method, setMethod] = useState<HarvestLot["measurementMethod"]>(
    lot?.measurementMethod ?? "not_recorded",
  );
  const seasons = data.seasons.filter((season) => season.farmId === farmId);
  async function save(form: FormData) {
    const moisture = fieldText(form, "moisturePercent");
    const body = {
      farmId,
      seasonId: fieldText(form, "seasonId"),
      crop,
      harvestDate: fieldText(form, "harvestDate"),
      quantityKg: fieldNumber(form, "quantityKg"),
      bagCount: fieldNumber(form, "bagCount"),
      storageLocation: fieldText(form, "storageLocation"),
      moisturePercent:
        method === "not_recorded" || !moisture ? null : Number(moisture),
      measurementMethod: method,
      testReference: fieldText(form, "testReference"),
      notes: fieldText(form, "notes"),
      ...(lot
        ? { version: lot.version }
        : { qualityStatus: "unassessed", qualityNotes: "" }),
    };
    const result = await mutate<HarvestLot>(
      lot ? `/api/lots/${lot.id}` : "/api/lots",
      lot ? "PATCH" : "POST",
      body,
      false,
    );
    if (!("queued" in result)) onSaved(result.id);
    onClose();
  }
  return (
    <Modal
      title={lot ? "Edit harvest lot" : "Record a harvest"}
      description="Keep each batch traceable to its farm, harvest date and storage place."
      onClose={onClose}
      wide
    >
      <Form
        onSubmit={save}
        onCancel={onClose}
        submitLabel={lot ? "Save harvest lot" : "Record harvest"}
      >
        <Field label="Farm">
          <select
            name="farmId"
            value={farmId}
            required
            disabled={!!lot}
            onChange={(event) => {
              setFarmId(event.target.value);
              setCrop(
                data.farms.find((farm) => farm.id === event.target.value)
                  ?.crop ?? "",
              );
            }}
          >
            {data.farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
                {user?.role !== "farmer" ? ` · ${farm.ownerName}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Season plan"
          hint="Optional. Record enough harvested weight in the season plan before linking a lot."
        >
          <select
            name="seasonId"
            key={farmId}
            defaultValue={
              seasons.some(
                (value) => value.id === (lot?.seasonId ?? season?.id),
              )
                ? (lot?.seasonId ?? season?.id)
                : ""
            }
            onChange={(event) => {
              const selected = seasons.find(
                (value) => value.id === event.target.value,
              );
              if (selected) setCrop(selected.crop);
            }}
          >
            <option value="">No linked season</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Crop">
          <input
            name="crop"
            list="harvest-crops"
            value={crop}
            onChange={(event) => setCrop(event.target.value)}
            required
            maxLength={160}
          />
          <datalist id="harvest-crops">
            {crops.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </datalist>
        </Field>
        <Field label="Harvest date">
          <input
            name="harvestDate"
            type="date"
            defaultValue={lot?.harvestDate ?? today()}
            max={today()}
            required
          />
        </Field>
        <Field
          label="Weight (kg)"
          hint="Record weighed quantity, not an estimated bag conversion."
        >
          <input
            name="quantityKg"
            type="number"
            min="0.01"
            max="10000000"
            step="0.01"
            defaultValue={lot?.quantityKg}
            required
          />
        </Field>
        <Field label="Number of bags" hint="Use 0 for unpackaged produce.">
          <input
            name="bagCount"
            type="number"
            min="0"
            max="1000000"
            step="1"
            defaultValue={lot?.bagCount ?? 0}
            required
          />
        </Field>
        <div className="op-full">
          <Field label="Storage location">
            <input
              name="storageLocation"
              defaultValue={lot?.storageLocation}
              maxLength={160}
              placeholder="e.g. North store, rack 2"
              required
            />
          </Field>
        </div>
        <Field label="Moisture measurement method">
          <select
            name="measurementMethod"
            value={method}
            onChange={(event) =>
              setMethod(event.target.value as HarvestLot["measurementMethod"])
            }
          >
            <option value="not_recorded">Not measured</option>
            <option value="meter">Moisture meter</option>
            <option value="lab_report">Laboratory report</option>
            <option value="other">Other documented method</option>
          </select>
        </Field>
        <Field
          label="Measured moisture (%)"
          hint="No automated safe-storage threshold is assumed."
        >
          <input
            name="moisturePercent"
            type="number"
            min="0"
            max="100"
            step="0.1"
            disabled={method === "not_recorded"}
            defaultValue={lot?.moisturePercent ?? ""}
          />
        </Field>
        <div className="op-full">
          <Field
            label="Measurement / test reference"
            hint="Record the test identifier or method. Do not enter private health information."
          >
            <input
              name="testReference"
              maxLength={200}
              defaultValue={lot?.testReference}
              disabled={method === "not_recorded"}
            />
          </Field>
        </div>
        <div className="op-full">
          <Field label="Harvest notes">
            <textarea
              name="notes"
              rows={3}
              maxLength={3000}
              defaultValue={lot?.notes}
            />
          </Field>
        </div>
        {lot?.qualityStatus === "accepted" && (
          <div className="op-full">
            <Notice tone="warning">
              Changing the crop, quantity, storage or measurement details
              requires a new quality review.
            </Notice>
          </div>
        )}
      </Form>
    </Modal>
  );
}

function QualityEditor({
  lot,
  onClose,
}: {
  lot: HarvestLot;
  onClose: () => void;
}) {
  const { mutate } = useApp();
  const [status, setStatus] = useState(lot.qualityStatus);
  async function save(form: FormData) {
    await mutate(
      `/api/lots/${lot.id}`,
      "PATCH",
      {
        version: lot.version,
        qualityStatus: status,
        qualityNotes: fieldText(form, "qualityNotes"),
      },
      false,
    );
    onClose();
  }
  const reviewed = ["accepted", "on_hold", "rejected"].includes(status);
  return (
    <Modal
      title="Review harvest quality"
      description={`${lot.lotCode} · ${lot.crop} · ${number(lot.quantityKg)} kg`}
      onClose={onClose}
    >
      <Form
        onSubmit={save}
        onCancel={onClose}
        submitLabel="Save quality review"
      >
        <div className="op-full">
          <Notice>
            This is an internal collection decision, not a food-safety,
            laboratory or export certificate. Check the buyer's specifications
            and document the evidence.
          </Notice>
        </div>
        <div className="op-full">
          <Field label="Quality decision">
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as HarvestLot["qualityStatus"])
              }
            >
              {qualityStatuses.map((value) => (
                <option key={value} value={value}>
                  {value === "accepted"
                    ? "Accepted for collection"
                    : label(value)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="op-full">
          <Field
            label="Review evidence and next steps"
            hint="Explain what was inspected, relevant test references and any follow-up required."
          >
            <textarea
              name="qualityNotes"
              defaultValue={lot.qualityNotes}
              rows={5}
              required={reviewed}
              minLength={reviewed ? 10 : undefined}
              maxLength={3000}
            />
          </Field>
        </div>
      </Form>
    </Modal>
  );
}

function CollectionEditor({
  collection,
  lots,
  onClose,
  onSaved,
}: {
  collection?: HarvestCollection;
  lots: HarvestLot[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { data, mutate } = useApp();
  const [crop, setCrop] = useState(
    collection?.crop ??
      lots.find((lot) => lot.qualityStatus === "accepted" && !lot.allocation)
        ?.crop ??
      crops[0],
  );
  const [selected, setSelected] = useState<string[]>(collection?.lotIds ?? []);
  const [target, setTarget] = useState(collection?.targetKg ?? 0);
  const options = eligibleLots(lots, crop, collection?.id);
  const selectedKg = options
    .filter((lot) => selected.includes(lot.id))
    .reduce((sum, lot) => sum + lot.quantityKg, 0);
  async function save(form: FormData) {
    const body = {
      name: fieldText(form, "name"),
      crop,
      buyer: fieldText(form, "buyer"),
      dealId: fieldText(form, "dealId"),
      targetKg: target,
      priceUgxPerKg: fieldNumber(form, "priceUgxPerKg"),
      collectionDate: fieldText(form, "collectionDate"),
      meetingPoint: fieldText(form, "meetingPoint"),
      destination: fieldText(form, "destination"),
      status: collection?.status ?? "planning",
      lotIds: selected,
      notes: fieldText(form, "notes"),
      ...(collection ? { version: collection.version } : {}),
    };
    const result = await mutate<HarvestCollection>(
      collection ? `/api/collections/${collection.id}` : "/api/collections",
      collection ? "PATCH" : "POST",
      body,
      false,
    );
    if (!("queued" in result)) onSaved(result.id);
    onClose();
  }
  if (collection?.status === "confirmed")
    return (
      <Modal
        title="Update collection arrangements"
        description={collection.name}
        onClose={onClose}
      >
        <Form
          onSubmit={async (form) => {
            await mutate(
              `/api/collections/${collection.id}`,
              "PATCH",
              {
                version: collection.version,
                collectionDate: fieldText(form, "collectionDate"),
                meetingPoint: fieldText(form, "meetingPoint"),
                destination: fieldText(form, "destination"),
                notes: fieldText(form, "notes"),
              },
              false,
            );
            onClose();
          }}
          onCancel={onClose}
          submitLabel="Save arrangements"
        >
          <div className="op-full">
            <Notice>
              The buyer, price and lots are confirmed. Cancel this collection to
              change its commercial terms or lot allocation.
            </Notice>
          </div>
          <Field label="Collection date">
            <input
              name="collectionDate"
              type="date"
              defaultValue={collection.collectionDate}
              required
            />
          </Field>
          <Field label="Meeting / pickup point">
            <input
              name="meetingPoint"
              defaultValue={collection.meetingPoint}
              maxLength={160}
              required
            />
          </Field>
          <div className="op-full">
            <Field label="Destination">
              <input
                name="destination"
                defaultValue={collection.destination}
                maxLength={160}
                required
              />
            </Field>
          </div>
          <div className="op-full">
            <Field label="Collection notes">
              <textarea
                name="notes"
                defaultValue={collection.notes}
                rows={3}
                maxLength={3000}
              />
            </Field>
          </div>
        </Form>
      </Modal>
    );
  return (
    <Modal
      title={collection ? "Edit buyer collection" : "Plan a buyer collection"}
      description="Bring accepted whole lots together for one buyer. A lot can belong to only one active collection."
      onClose={onClose}
      wide
    >
      <Form
        onSubmit={save}
        onCancel={onClose}
        submitLabel={collection ? "Save collection" : "Create collection"}
      >
        <Field label="Collection name">
          <input
            name="name"
            defaultValue={collection?.name}
            maxLength={160}
            placeholder="e.g. October maize collection"
            required
          />
        </Field>
        <Field label="Buyer">
          <input
            name="buyer"
            defaultValue={collection?.buyer}
            maxLength={160}
            required
          />
        </Field>
        <Field label="Crop">
          <input
            value={crop}
            onChange={(event) => {
              setCrop(event.target.value);
              setSelected([]);
            }}
            list="collection-crops"
            maxLength={160}
            required
          />
          <datalist id="collection-crops">
            {[...new Set([...crops, ...lots.map((lot) => lot.crop)])].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </datalist>
        </Field>
        <Field
          label="Trade opportunity"
          hint="Optional: link a matching buyer opportunity."
        >
          <select name="dealId" defaultValue={collection?.dealId ?? ""}>
            <option value="">No linked opportunity</option>
            {data.deals
              .filter(
                (deal) => deal.crop.toLowerCase() === crop.trim().toLowerCase(),
              )
              .map((deal) => (
                <option key={deal.id} value={deal.id}>
                  {deal.buyer} · {number(deal.quantityKg)} kg
                </option>
              ))}
          </select>
        </Field>
        <Field label="Target weight (kg)">
          <input
            type="number"
            value={target || ""}
            onChange={(event) => setTarget(Number(event.target.value))}
            min="0.01"
            max="10000000"
            step="0.01"
            required
          />
        </Field>
        <Field
          label="Proposed price (UGX per kg)"
          hint="An estimate, not a payment or buyer guarantee."
        >
          <input
            name="priceUgxPerKg"
            defaultValue={collection?.priceUgxPerKg}
            type="number"
            min="0"
            max="10000000"
            step="1"
            required
          />
        </Field>
        <Field label="Collection date">
          <input
            name="collectionDate"
            type="date"
            defaultValue={collection?.collectionDate ?? today()}
            required
          />
        </Field>
        <Field label="Meeting / pickup point">
          <input
            name="meetingPoint"
            defaultValue={collection?.meetingPoint}
            maxLength={160}
            required
          />
        </Field>
        <div className="op-full">
          <Field label="Destination">
            <input
              name="destination"
              defaultValue={collection?.destination}
              maxLength={160}
              required
            />
          </Field>
        </div>
        <fieldset className="op-fieldset op-full harvest-lot-picker">
          <legend>Accepted lots available for collection</legend>
          <p className="muted">
            {number(selectedKg)} kg selected
            {target > 0
              ? ` · ${number(Math.max(target - selectedKg, 0))} kg still needed`
              : ""}
            . Whole lots only.
          </p>
          {options.length ? (
            options.map((lot) => (
              <label className="harvest-lot-choice" key={lot.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(lot.id)}
                  onChange={(event) =>
                    setSelected((value) =>
                      event.target.checked
                        ? [...value, lot.id]
                        : value.filter((id) => id !== lot.id),
                    )
                  }
                />
                <span>
                  <strong>{lot.lotCode}</strong>
                  <small>
                    {data.farms.find((farm) => farm.id === lot.farmId)?.name ??
                      "Farm record"}{" "}
                    · {lot.storageLocation}
                  </small>
                </span>
                <b>{number(lot.quantityKg)} kg</b>
              </label>
            ))
          ) : (
            <p className="harvest-form-empty">
              No unallocated, accepted lots match this crop. You can save a plan
              now and add lots after quality review.
            </p>
          )}
        </fieldset>
        <div className="op-full">
          <Field label="Collection notes">
            <textarea
              name="notes"
              defaultValue={collection?.notes}
              rows={3}
              maxLength={3000}
            />
          </Field>
        </div>
      </Form>
    </Modal>
  );
}

function CollectionTransition({
  collection,
  status,
  onClose,
}: {
  collection: HarvestCollection;
  status: HarvestCollection["status"];
  onClose: () => void;
}) {
  const { mutate } = useApp();
  const explanation =
    status === "confirmed"
      ? "Confirm that the buyer, pickup date and collection arrangements have been agreed. Enough accepted lots must cover the target."
      : status === "dispatched"
        ? "Record that this produce has physically left for the destination. Dispatch locks this collection and its lots. It does not record delivery, payment or customs clearance."
        : "Cancel this collection and release its lots for another buyer. This action cannot be reversed; create a new plan if needed.";
  return (
    <Modal
      title={
        status === "confirmed"
          ? "Confirm collection"
          : status === "dispatched"
            ? "Record dispatch"
            : "Cancel collection"
      }
      description={collection.name}
      onClose={onClose}
    >
      <Form
        onSubmit={async () => {
          await mutate(
            `/api/collections/${collection.id}`,
            "PATCH",
            { version: collection.version, status },
            false,
          );
          onClose();
        }}
        onCancel={onClose}
        submitLabel={
          status === "confirmed"
            ? "Confirm collection"
            : status === "dispatched"
              ? "Record dispatch"
              : "Cancel collection"
        }
      >
        <div className="op-full">
          <Notice tone={status === "confirmed" ? "info" : "warning"}>
            {explanation}
          </Notice>
        </div>
        <label className="op-check op-full">
          <input type="checkbox" required />
          <span>I have checked these details and want to proceed.</span>
        </label>
      </Form>
    </Modal>
  );
}

export default function Harvest() {
  const { user, data, loading, error, online, refresh } = useApp();
  const staff = user?.role !== "farmer";
  const lots = data.lots,
    collections = data.collections;
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedSeason = data.seasons.find(
    (season) => season.id === searchParams.get("season"),
  );
  const [tab, setTab] = useState<"lots" | "collections">("lots");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selectedId, setSelectedId] = useState("");
  const { detailRef, listRef, openDetails, backToList } = useRecordDetails(
    setSelectedId,
    980,
  );
  const [lotEditor, setLotEditor] = useState<HarvestLot | "new" | null>(null),
    [qualityEditor, setQualityEditor] = useState<HarvestLot | null>(null);
  const [collectionEditor, setCollectionEditor] = useState<
      HarvestCollection | "new" | null
    >(null),
    [transition, setTransition] = useState<{
      collection: HarvestCollection;
      status: HarvestCollection["status"];
    } | null>(null);
  const closeLot = useCallback(() => setLotEditor(null), []),
    closeQuality = useCallback(() => setQualityEditor(null), []),
    closeCollection = useCallback(() => setCollectionEditor(null), []),
    closeTransition = useCallback(() => setTransition(null), []);
  const farmNames = useMemo(
    () => new Map(data.farms.map((farm) => [farm.id, farm.name])),
    [data.farms],
  );
  const visibleLots = lots.filter(
    (lot) =>
      (filter === "all" || lot.qualityStatus === filter) &&
      `${lot.lotCode} ${lot.crop} ${farmNames.get(lot.farmId) ?? ""} ${lot.storageLocation}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const visibleCollections = collections.filter(
    (collection) =>
      (filter === "all" || collection.status === filter) &&
      `${collection.name} ${collection.crop} ${collection.buyer} ${collection.destination}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selectedLot =
    visibleLots.find((lot) => lot.id === selectedId) ?? visibleLots[0];
  const selectedCollection =
    visibleCollections.find((collection) => collection.id === selectedId) ??
    visibleCollections[0];
  function changeTab(value: "lots" | "collections") {
    setTab(value);
    setFilter("all");
    setQuery("");
    setSelectedId("");
  }
  if (loading) return <Skeleton />;
  return (
    <>
      <PageHeader
        title="Harvest & collection"
        description={
          staff
            ? "Keep the farm, quality checks and buyer collection connected."
            : "Record what you harvested. Keep each batch traceable from field to buyer."
        }
        action={
          <Button
            onClick={() =>
              tab === "lots" ? setLotEditor("new") : setCollectionEditor("new")
            }
            disabled={!online || (tab === "lots" && !data.farms.length)}
          >
            <Plus size={17} />
            {tab === "lots" ? "Record harvest" : "Plan collection"}
          </Button>
        }
      />
      {!online && (
        <Notice tone="warning">
          Harvest and collection records require a connection. They are not
          saved for offline browsing.
        </Notice>
      )}
      {linkedSeason && tab === "lots" && (
        <div className="harvest-season-context">
          <span>
            New harvest lots will link to <strong>{linkedSeason.name}</strong>.
            The season records {number(linkedSeason.harvestedKg)} kg harvested.
          </span>
          <Button
            variant="ghost"
            onClick={() =>
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                next.delete("season");
                return next;
              })
            }
          >
            Clear season
          </Button>
        </div>
      )}
      {error && (
        <div className="op-error">
          <ErrorMessage message={error} />
          <Button
            variant="secondary"
            onClick={() => void refresh().catch(() => {})}
          >
            Retry
          </Button>
        </div>
      )}
      {online && (
        <div className="stat-strip harvest-stats">
          <div className="stat">
            <span>Recorded harvest</span>
            <strong>
              {number(lots.reduce((sum, lot) => sum + lot.quantityKg, 0))}{" "}
              <small>kg</small>
            </strong>
          </div>
          <div className="stat">
            <span>Ready, not allocated</span>
            <strong>
              {number(
                lots
                  .filter(
                    (lot) =>
                      lot.qualityStatus === "accepted" && !lot.allocation,
                  )
                  .reduce((sum, lot) => sum + lot.quantityKg, 0),
              )}{" "}
              <small>kg</small>
            </strong>
          </div>
          <div className="stat">
            <span>Awaiting review / testing</span>
            <strong>
              {number(
                lots.filter((lot) =>
                  ["unassessed", "pending_test"].includes(lot.qualityStatus),
                ).length,
              )}{" "}
              <small>
                {lots.filter((lot) =>
                  ["unassessed", "pending_test"].includes(lot.qualityStatus),
                ).length === 1
                  ? "lot"
                  : "lots"}
              </small>
            </strong>
          </div>
          {staff && (
            <div className="stat">
              <span>Active collections</span>
              <strong>
                {number(
                  collections.filter((collection) =>
                    ["planning", "confirmed"].includes(collection.status),
                  ).length,
                )}
              </strong>
            </div>
          )}
        </div>
      )}
      {staff && (
        <div className="tabs" role="tablist" aria-label="Harvest workspace">
          <button
            role="tab"
            aria-selected={tab === "lots"}
            className={tab === "lots" ? "active" : ""}
            onClick={() => changeTab("lots")}
          >
            Harvest lots <span>{lots.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === "collections"}
            className={tab === "collections" ? "active" : ""}
            onClick={() => changeTab("collections")}
          >
            Buyer collections <span>{collections.length}</span>
          </button>
        </div>
      )}
      <div className="toolbar">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={
            tab === "lots"
              ? "Search lot, crop or farm"
              : "Search collection or buyer"
          }
        />
        <select
          aria-label={
            tab === "lots"
              ? "Filter quality status"
              : "Filter collection status"
          }
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          {(tab === "lots" ? qualityStatuses : collectionStatuses).map(
            (status) => (
              <option key={status} value={status}>
                {label(status)}
              </option>
            ),
          )}
        </select>
        <span className="muted">
          {tab === "lots" ? visibleLots.length : visibleCollections.length}{" "}
          records
        </span>
      </div>
      {tab === "lots" ? (
        <div className="split-layout harvest-layout">
          <section className="panel">
            <div className="panel-header">
              <h2 ref={listRef} tabIndex={-1} className="op-focus-target">
                {staff ? "Harvest register" : "Your harvest lots"}
              </h2>
              <PackageCheck size={20} />
            </div>
            {!visibleLots.length ? (
              <Empty
                title={
                  query || filter !== "all"
                    ? "No matching harvest lots"
                    : "Start with your first harvest"
                }
                body={
                  query || filter !== "all"
                    ? "Try another crop, lot code or quality status."
                    : "A harvest lot keeps one batch, its storage place and quality checks together."
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
                  ) : !data.farms.length ? (
                    <Link className="text-link" to="/farms">
                      Add a farm first <ArrowRight size={15} />
                    </Link>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={!online}
                      onClick={() => setLotEditor("new")}
                    >
                      Record harvest
                    </Button>
                  )
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Lot / farm</th>
                      <th>Harvest</th>
                      <th>Quality</th>
                      <th>Allocation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLots.map((lot) => (
                      <tr
                        key={lot.id}
                        className={
                          selectedLot?.id === lot.id ? "op-selected-row" : ""
                        }
                      >
                        <td>
                          <button
                            className="op-record-link"
                            onClick={(event) =>
                              openDetails(lot.id, event.currentTarget)
                            }
                            aria-controls="harvest-record-detail"
                            aria-pressed={selectedLot?.id === lot.id}
                            aria-label={`Open ${lot.lotCode}`}
                          >
                            <strong>{lot.lotCode}</strong>
                            <small>
                              {farmNames.get(lot.farmId) ?? "Farm record"} ·{" "}
                              {lot.crop}
                            </small>
                          </button>
                        </td>
                        <td data-label="Harvest weight / date">
                          {number(lot.quantityKg)} kg
                          <span className="op-cell-secondary">
                            {date(lot.harvestDate)}
                          </span>
                        </td>
                        <td data-label="Quality review">
                          <Badge tone={qualityTone(lot.qualityStatus)}>
                            {label(lot.qualityStatus)}
                          </Badge>
                        </td>
                        <td data-label="Allocation">
                          {lot.allocation ? (
                            <Badge
                              tone={
                                lot.allocation.status === "dispatched"
                                  ? "green"
                                  : "blue"
                              }
                            >
                              {lot.allocation.status === "dispatched"
                                ? "Dispatched"
                                : "Allocated"}
                            </Badge>
                          ) : (
                            <span className="muted">Not allocated</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {selectedLot && (
            <aside
              className="panel detail-panel op-focus-target"
              id="harvest-record-detail"
              ref={detailRef}
              tabIndex={-1}
              aria-labelledby="harvest-record-name"
            >
              <button
                type="button"
                className="op-mobile-back text-link"
                onClick={backToList}
              >
                <ArrowLeft size={16} /> Back to harvest lots
              </button>
              <div className="op-detail-body">
                <div className="harvest-detail-heading">
                  <PackageCheck size={25} />
                  <Badge tone={qualityTone(selectedLot.qualityStatus)}>
                    {label(selectedLot.qualityStatus)}
                  </Badge>
                </div>
                <h2 id="harvest-record-name">{selectedLot.lotCode}</h2>
                <p className="muted">
                  {farmNames.get(selectedLot.farmId) ?? "Farm record"} ·{" "}
                  {selectedLot.crop}
                </p>
                <dl className="harvest-facts">
                  <div>
                    <dt>Recorded weight</dt>
                    <dd>{number(selectedLot.quantityKg)} kg</dd>
                  </div>
                  <div>
                    <dt>Harvest date</dt>
                    <dd>{date(selectedLot.harvestDate)}</dd>
                  </div>
                  <div>
                    <dt>Bags</dt>
                    <dd>{number(selectedLot.bagCount)}</dd>
                  </div>
                  <div>
                    <dt>Storage</dt>
                    <dd>{selectedLot.storageLocation}</dd>
                  </div>
                  <div>
                    <dt>Measured moisture</dt>
                    <dd>
                      {selectedLot.moisturePercent === null
                        ? "Not recorded"
                        : `${number(selectedLot.moisturePercent)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt>Method</dt>
                    <dd>{label(selectedLot.measurementMethod)}</dd>
                  </div>
                  {selectedLot.testReference && (
                    <div>
                      <dt>Test reference</dt>
                      <dd>{selectedLot.testReference}</dd>
                    </div>
                  )}
                </dl>
                <div className="harvest-review">
                  <h3>Quality record</h3>
                  <p>
                    {selectedLot.qualityNotes ||
                      "No quality review has been recorded."}
                  </p>
                  {selectedLot.qualityReviewedAt && (
                    <small className="muted">
                      Reviewed by{" "}
                      {selectedLot.qualityReviewedBy ?? "an operator"} ·{" "}
                      {dateTime(selectedLot.qualityReviewedAt)} EAT
                    </small>
                  )}
                  <p className="muted">
                    Internal acceptance is not a laboratory or export
                    certificate.
                  </p>
                </div>
                {selectedLot.notes && (
                  <div className="harvest-review">
                    <h3>Harvest notes</h3>
                    <p>{selectedLot.notes}</p>
                  </div>
                )}
                {selectedLot.allocation ? (
                  <Notice>
                    This lot is{" "}
                    {selectedLot.allocation.status === "dispatched"
                      ? "dispatched and locked"
                      : "allocated to a buyer collection and locked"}
                    .{" "}
                    {selectedLot.allocation.status !== "dispatched"
                      ? "The collection must release it before it can be changed."
                      : ""}
                  </Notice>
                ) : (
                  <div className="harvest-actions">
                    <Button
                      variant="secondary"
                      disabled={!online}
                      onClick={() => setLotEditor(selectedLot)}
                    >
                      <Pencil size={15} />
                      Edit lot
                    </Button>
                    {staff && (
                      <Button
                        disabled={!online}
                        onClick={() => setQualityEditor(selectedLot)}
                      >
                        <ClipboardCheck size={15} />
                        Review quality
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      ) : (
        <div className="split-layout harvest-layout">
          <section className="panel">
            <div className="panel-header">
              <h2 ref={listRef} tabIndex={-1} className="op-focus-target">
                Buyer collections
              </h2>
              <Truck size={20} />
            </div>
            {!visibleCollections.length ? (
              <Empty
                title={
                  query || filter !== "all"
                    ? "No matching collections"
                    : "Better together, batch by batch."
                }
                body={
                  query || filter !== "all"
                    ? "Try another buyer, crop or collection status."
                    : "Plan a shared pickup, add accepted lots and confirm when the buyer's quantity is covered."
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
                    <Button
                      variant="secondary"
                      disabled={!online}
                      onClick={() => setCollectionEditor("new")}
                    >
                      Plan collection
                    </Button>
                  )
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Collection / buyer</th>
                      <th>Weight / target</th>
                      <th>Pickup</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCollections.map((collection) => (
                      <tr
                        key={collection.id}
                        className={
                          selectedCollection?.id === collection.id
                            ? "op-selected-row"
                            : ""
                        }
                      >
                        <td>
                          <button
                            className="op-record-link"
                            onClick={(event) =>
                              openDetails(collection.id, event.currentTarget)
                            }
                            aria-controls="harvest-record-detail"
                            aria-pressed={
                              selectedCollection?.id === collection.id
                            }
                          >
                            <strong>{collection.name}</strong>
                            <small>
                              {collection.buyer} · {collection.crop}
                            </small>
                          </button>
                        </td>
                        <td data-label="Weight / target">
                          {number(collection.summary.allocatedKg)} kg
                          <span className="op-cell-secondary">
                            of {number(collection.targetKg)} kg target
                          </span>
                        </td>
                        <td data-label="Pickup date">
                          {date(collection.collectionDate)}
                        </td>
                        <td data-label="Collection status">
                          <Badge tone={collectionTone(collection.status)}>
                            {label(collection.status)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {selectedCollection && (
            <aside
              className="panel detail-panel op-focus-target"
              id="harvest-record-detail"
              ref={detailRef}
              tabIndex={-1}
              aria-labelledby="harvest-record-name"
            >
              <button
                type="button"
                className="op-mobile-back text-link"
                onClick={backToList}
              >
                <ArrowLeft size={16} /> Back to collections
              </button>
              <div className="op-detail-body">
                <div className="harvest-detail-heading">
                  <Truck size={25} />
                  <Badge tone={collectionTone(selectedCollection.status)}>
                    {label(selectedCollection.status)}
                  </Badge>
                </div>
                <h2 id="harvest-record-name">{selectedCollection.name}</h2>
                <p className="muted">
                  {selectedCollection.buyer} · {selectedCollection.crop}
                </p>
                <div className="harvest-progress">
                  <strong>
                    {number(selectedCollection.summary.allocatedKg)} kg{" "}
                    <span className="muted">
                      of {number(selectedCollection.targetKg)} kg
                    </span>
                  </strong>
                  <progress
                    max={100}
                    value={Math.min(
                      selectedCollection.summary.targetProgressPercent,
                      100,
                    )}
                    aria-label="Collection target coverage"
                  />
                  <small>
                    {selectedCollection.summary.contributorCount} contributing
                    {selectedCollection.summary.contributorCount === 1
                      ? " farmer"
                      : " farmers"}{" "}
                    · {selectedCollection.lotIds.length}{" "}
                    {selectedCollection.lotIds.length === 1 ? "lot" : "lots"}
                  </small>
                </div>
                <dl className="harvest-facts">
                  <div>
                    <dt>Proposed price</dt>
                    <dd>{ugx(selectedCollection.priceUgxPerKg)} / kg</dd>
                  </div>
                  <div>
                    <dt>Estimated value</dt>
                    <dd>{ugx(selectedCollection.summary.estimatedValueUgx)}</dd>
                  </div>
                  <div>
                    <dt>Collection date</dt>
                    <dd>{date(selectedCollection.collectionDate)}</dd>
                  </div>
                  <div>
                    <dt>Meeting point</dt>
                    <dd>{selectedCollection.meetingPoint}</dd>
                  </div>
                  <div>
                    <dt>Destination</dt>
                    <dd>{selectedCollection.destination}</dd>
                  </div>
                </dl>
                <p className="harvest-disclaimer">
                  Estimated produce value only. No payment, buyer guarantee or
                  transport charge is recorded here.
                </p>
                <div className="harvest-review">
                  <h3>
                    {selectedCollection.status === "cancelled"
                      ? "Original collection lots"
                      : "Allocated lots"}
                  </h3>
                  {selectedCollection.lotIds.length ? (
                    <ul className="harvest-allocated-list">
                      {collectionLotRows(selectedCollection, lots).map(
                        (lot) => (
                          <li key={lot.id}>
                            <span>
                              {lot.code}
                              <small>
                                {lot.farmId
                                  ? farmNames.get(lot.farmId)
                                  : "Farm record"}
                              </small>
                            </span>
                            <strong>
                              {lot.quantityKg !== null
                                ? `${number(lot.quantityKg)} kg`
                                : "Not available"}
                            </strong>
                          </li>
                        ),
                      )}
                    </ul>
                  ) : (
                    <p>No lots added yet.</p>
                  )}
                </div>
                {selectedCollection.notes && (
                  <div className="harvest-review">
                    <h3>Collection notes</h3>
                    <p>{selectedCollection.notes}</p>
                  </div>
                )}
                {selectedCollection.status === "planning" ||
                selectedCollection.status === "confirmed" ? (
                  <>
                    <div className="harvest-actions">
                      <Button
                        variant="secondary"
                        disabled={!online}
                        onClick={() => setCollectionEditor(selectedCollection)}
                      >
                        <Pencil size={15} />
                        Edit collection
                      </Button>
                      <Button
                        disabled={
                          !online ||
                          selectedCollection.summary.allocatedKg <
                            selectedCollection.targetKg
                        }
                        onClick={() =>
                          setTransition({
                            collection: selectedCollection,
                            status:
                              selectedCollection.status === "planning"
                                ? "confirmed"
                                : "dispatched",
                          })
                        }
                      >
                        {selectedCollection.status === "planning"
                          ? "Confirm"
                          : "Record dispatch"}
                        <ArrowRight size={15} />
                      </Button>
                    </div>
                    {selectedCollection.summary.allocatedKg <
                      selectedCollection.targetKg && (
                      <p className="harvest-disclaimer">
                        Add{" "}
                        {number(
                          selectedCollection.targetKg -
                            selectedCollection.summary.allocatedKg,
                        )}{" "}
                        kg of accepted lots to cover the target before
                        confirming.
                      </p>
                    )}
                    <button
                      className="text-link harvest-cancel"
                      disabled={!online}
                      onClick={() =>
                        setTransition({
                          collection: selectedCollection,
                          status: "cancelled",
                        })
                      }
                    >
                      Cancel collection
                    </button>
                  </>
                ) : (
                  <Notice>
                    {selectedCollection.status === "dispatched"
                      ? "Dispatch is recorded. This collection and its lots are locked."
                      : "Collection cancelled. Its lots have been released for other collections."}
                  </Notice>
                )}
              </div>
            </aside>
          )}
        </div>
      )}
      {lotEditor && (
        <LotEditor
          lot={lotEditor === "new" ? undefined : lotEditor}
          season={lotEditor === "new" ? linkedSeason : undefined}
          onClose={closeLot}
          onSaved={setSelectedId}
        />
      )}
      {qualityEditor && (
        <QualityEditor lot={qualityEditor} onClose={closeQuality} />
      )}
      {collectionEditor && (
        <CollectionEditor
          collection={collectionEditor === "new" ? undefined : collectionEditor}
          lots={lots}
          onClose={closeCollection}
          onSaved={setSelectedId}
        />
      )}
      {transition && (
        <CollectionTransition {...transition} onClose={closeTransition} />
      )}
    </>
  );
}
