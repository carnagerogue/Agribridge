import { useState } from "react";
import {
  Badge,
  Field,
  Form,
  Modal,
  Notice,
  fieldNumber,
  fieldText,
} from "../ui";
import { crops, districts, number, ugx } from "../../lib/format";
import { daysFromToday, marketDate as date } from "../../lib/marketplace";
import type {
  BuyerDemand,
  MarketProfile,
  SupplyListing,
} from "../../../server/marketplace-types";

type Save = (path: string, body: unknown, message: string) => Promise<void>;
type FormProps = { onClose: () => void; onSave: Save };

function CropOptions({ selected }: { selected?: string }) {
  return (
    <>
      {selected && !crops.includes(selected) ? (
        <option>{selected}</option>
      ) : null}
      {crops.map((crop) => (
        <option key={crop}>{crop}</option>
      ))}
    </>
  );
}

function DistrictOptions({ selected }: { selected?: string }) {
  return (
    <>
      {selected && !districts.some((item) => item.name === selected) ? (
        <option>{selected}</option>
      ) : null}
      {districts.map((district) => (
        <option key={district.name}>{district.name}</option>
      ))}
    </>
  );
}

export function BusinessForm({
  profile,
  name,
  initialDistrict,
  onClose,
  onSave,
}: FormProps & {
  profile: MarketProfile | null;
  name: string;
  initialDistrict?: string;
}) {
  return (
    <Modal
      title={profile ? "Edit your business" : "Register your business"}
      description="One profile connects your produce, community and market opportunities."
      onClose={onClose}
    >
      <Form
        onCancel={onClose}
        submitLabel={profile ? "Save business" : "Create profile"}
        onSubmit={async (form) => {
          const farmSize = fieldText(form, "farmSizeAcres");
          await onSave(
            "/api/marketplace/profile",
            {
              name: fieldText(form, "name"),
              businessName: fieldText(form, "businessName"),
              phone: fieldText(form, "phone"),
              district: fieldText(form, "district"),
              community: fieldText(form, "community"),
              farmSizeAcres: farmSize ? Number(farmSize) : null,
              crops: fieldText(form, "crops")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              language: fieldText(form, "language"),
              ...(profile ? { version: profile.version } : {}),
            },
            profile
              ? "Business profile updated."
              : "Your business profile is ready. You can now list produce.",
          );
        }}
      >
        <Field label="Your full name">
          <input
            name="name"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            defaultValue={profile?.name || name}
          />
        </Field>
        <Field label="Business or farm name">
          <input
            name="businessName"
            required
            minLength={2}
            maxLength={160}
            defaultValue={profile?.businessName}
            placeholder="The name buyers will recognize"
          />
        </Field>
        <Field
          label="Phone number"
          hint="Use +256 followed by your mobile number. Payment details are verified separately."
        >
          <input
            name="phone"
            type="tel"
            required
            pattern="\+256[37][0-9]{8}"
            autoComplete="tel"
            placeholder="+256700000000"
            defaultValue={profile?.phone}
          />
        </Field>
        <Field label="Preferred language">
          <select name="language" defaultValue={profile?.language || "en"}>
            <option value="en">English</option>
            <option value="lg">Luganda</option>
          </select>
        </Field>
        <Field label="District">
          <select
            name="district"
            defaultValue={
              profile?.district || initialDistrict || districts[0].name
            }
          >
            <DistrictOptions selected={profile?.district || initialDistrict} />
          </select>
        </Field>
        <Field label="Community or village">
          <input
            name="community"
            required
            minLength={2}
            maxLength={120}
            autoComplete="address-level3"
            defaultValue={profile?.community}
            placeholder="Your community"
          />
        </Field>
        <Field
          label="Farm size (acres)"
          hint="Optional. Your own estimate, not a land ownership record."
        >
          <input
            name="farmSizeAcres"
            type="number"
            min="0.01"
            max="100000"
            step="0.01"
            defaultValue={profile?.farmSizeAcres ?? ""}
          />
        </Field>
        <Field
          label="Crops and varieties"
          hint="Separate crops with commas, for example Maize, Beans."
        >
          <input
            name="crops"
            required
            maxLength={600}
            defaultValue={profile?.crops.join(", ") || ""}
            placeholder="Maize, Beans"
          />
        </Field>
        <div className="market-form-full">
          <Notice>
            Your profile stays within your cooperative workspace. Publishing
            produce does not share your private phone number or farm notes.
          </Notice>
        </div>
      </Form>
    </Modal>
  );
}

export function SupplyForm({
  profile,
  demand,
  onClose,
  onSave,
}: FormProps & { profile: MarketProfile; demand?: BuyerDemand | null }) {
  return (
    <Modal
      title="List your produce"
      description="Tell the team what you have, where it is and when it will be ready."
      onClose={onClose}
    >
      <Form
        onCancel={onClose}
        submitLabel="Save listing"
        onSubmit={async (form) =>
          onSave(
            "/api/marketplace/supply",
            {
              crop: fieldText(form, "crop"),
              variety: fieldText(form, "variety"),
              quantityKg: fieldNumber(form, "quantityKg"),
              expectedPriceUgxPerKg: fieldText(form, "expectedPriceUgxPerKg")
                ? fieldNumber(form, "expectedPriceUgxPerKg")
                : null,
              harvestFrom: fieldText(form, "harvestFrom"),
              harvestUntil: fieldText(form, "harvestUntil"),
              district: fieldText(form, "district"),
              community: fieldText(form, "community"),
              grade: fieldText(form, "grade"),
              qualityNotes: fieldText(form, "qualityNotes"),
              status: "available",
            },
            "Produce listed. Check Find buyers for compatible requests.",
          )
        }
      >
        {demand && (
          <div className="market-form-full market-target-request">
            <Badge tone="green">Buyer request</Badge>
            <p>
              {demand.organization} is looking for {number(demand.quantityKg)}{" "}
              kg of {demand.crop.toLowerCase()}
              {demand.variety ? ` (${demand.variety})` : ""}.
            </p>
          </div>
        )}
        <Field label="Crop">
          <select
            name="crop"
            defaultValue={demand?.crop || profile.crops[0] || crops[0]}
          >
            <CropOptions selected={demand?.crop || profile.crops[0]} />
          </select>
        </Field>
        <Field
          label="Variety"
          hint="Use the name you know; leave blank if unsure."
        >
          <input
            name="variety"
            maxLength={100}
            defaultValue={demand?.variety || ""}
            placeholder="For example, white maize"
          />
        </Field>
        <Field label="Available quantity (kg)">
          <input
            name="quantityKg"
            type="number"
            required
            min="0.1"
            max="100000000"
            step="0.1"
            placeholder="500"
          />
        </Field>
        <Field
          label="Asking price (UGX / kg)"
          hint="Optional. Leave blank to discuss a price."
        >
          <input
            name="expectedPriceUgxPerKg"
            type="number"
            min="1"
            max="100000000"
            step="1"
            placeholder="Open to a quote"
          />
        </Field>
        <Field label="Ready from">
          <input
            name="harvestFrom"
            type="date"
            required
            defaultValue={daysFromToday(0)}
          />
        </Field>
        <Field label="Available until">
          <input
            name="harvestUntil"
            type="date"
            required
            defaultValue={daysFromToday(30)}
          />
        </Field>
        <Field label="District">
          <select name="district" defaultValue={profile.district}>
            <DistrictOptions selected={profile.district} />
          </select>
        </Field>
        <Field label="Community / collection area">
          <input
            name="community"
            required
            minLength={2}
            maxLength={120}
            defaultValue={profile.community}
          />
        </Field>
        <Field
          label="Reported grade"
          hint="This is your description. A buyer may require inspection."
        >
          <input name="grade" maxLength={100} placeholder="Not yet assessed" />
        </Field>
        <Field label="Quality and handling notes">
          <textarea
            name="qualityNotes"
            rows={3}
            maxLength={1200}
            placeholder="Drying, storage or measured quality information"
          />
        </Field>
      </Form>
    </Modal>
  );
}

export function InterestForm({
  demand,
  supply,
  onClose,
  onSave,
}: FormProps & { demand: BuyerDemand; supply: SupplyListing[] }) {
  const [supplyId, setSupplyId] = useState(supply[0]?.id || "");
  const selected = supply.find((item) => item.id === supplyId);
  return (
    <Modal
      title="Offer your produce"
      description={`Send an offer of interest for ${demand.organization}'s request. Your team will help confirm the terms.`}
      onClose={onClose}
    >
      <Form
        onCancel={onClose}
        submitLabel="Send interest"
        onSubmit={async (form) =>
          onSave(
            "/api/marketplace/interest",
            {
              supplyId: fieldText(form, "supplyId"),
              demandId: demand.id,
              message: fieldText(form, "message"),
            },
            "Your interest has been recorded for broker follow-up.",
          )
        }
      >
        <div className="market-form-full market-interest-summary">
          <strong>
            {demand.crop}
            {demand.variety ? ` · ${demand.variety}` : ""}
          </strong>
          <span>
            {number(demand.quantityKg)} kg requested · {demand.district} ·
            needed by {date(demand.deadline)}
          </span>
          <span>
            {demand.priceUgxPerKg === null
              ? "Price to be agreed"
              : `${ugx(demand.priceUgxPerKg)} / kg offered`}
          </span>
        </div>
        <div className="market-form-full">
          <Field label="Choose your produce">
            <select
              required
              name="supplyId"
              value={supplyId}
              onChange={(event) => setSupplyId(event.target.value)}
            >
              {supply.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.crop}
                  {item.variety ? ` · ${item.variety}` : ""} —{" "}
                  {number(item.quantityKg)} kg, {item.community}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {selected && (
          <div className="market-form-full">
            <Notice>
              Offering{" "}
              {number(Math.min(selected.quantityKg, demand.quantityKg))} kg for
              discussion. Quantity, quality, transport and final price still
              need agreement; this does not reserve stock or confirm a sale.
            </Notice>
          </div>
        )}
        <div className="market-form-full">
          <Field
            label="Message to the team"
            hint="Do not include payment PINs or private documents."
          >
            <textarea
              name="message"
              rows={3}
              maxLength={1000}
              placeholder="Share anything the team should know about availability or collection."
            />
          </Field>
        </div>
      </Form>
    </Modal>
  );
}

export function DemandForm({ onClose, onSave }: FormProps) {
  return (
    <Modal
      title="Record a buyer request"
      description="Only record actual demand that your organization is authorized to coordinate."
      onClose={onClose}
    >
      <Form
        onCancel={onClose}
        submitLabel="Publish request"
        onSubmit={async (form) =>
          onSave(
            "/api/marketplace/demand",
            {
              organization: fieldText(form, "organization"),
              crop: fieldText(form, "crop"),
              variety: fieldText(form, "variety"),
              grade: fieldText(form, "grade"),
              quantityKg: fieldNumber(form, "quantityKg"),
              priceUgxPerKg: fieldText(form, "priceUgxPerKg")
                ? fieldNumber(form, "priceUgxPerKg")
                : null,
              district: fieldText(form, "district"),
              availableFrom: fieldText(form, "availableFrom"),
              deadline: fieldText(form, "deadline"),
              requirements: fieldText(form, "requirements"),
              status: "open",
            },
            "Buyer request published to your cooperative workspace.",
          )
        }
      >
        <Field label="Buying organization">
          <input
            required
            name="organization"
            minLength={2}
            maxLength={160}
            placeholder="Organization with confirmed demand"
          />
        </Field>
        <Field label="Crop">
          <select name="crop">
            <CropOptions />
          </select>
        </Field>
        <Field label="Variety">
          <input name="variety" maxLength={100} />
        </Field>
        <Field label="Required grade">
          <input
            name="grade"
            maxLength={100}
            placeholder="Specify inspection requirements below"
          />
        </Field>
        <Field label="Quantity needed (kg)">
          <input
            required
            name="quantityKg"
            type="number"
            min="0.1"
            max="100000000"
            step="0.1"
          />
        </Field>
        <Field
          label="Offer price (UGX / kg)"
          hint="Leave blank when the price needs a quote."
        >
          <input
            name="priceUgxPerKg"
            type="number"
            min="1"
            max="100000000"
            step="1"
          />
        </Field>
        <Field label="Collection / delivery district">
          <select name="district">
            <DistrictOptions />
          </select>
        </Field>
        <Field label="Buying from">
          <input
            name="availableFrom"
            type="date"
            required
            defaultValue={daysFromToday(0)}
          />
        </Field>
        <Field label="Required by">
          <input
            name="deadline"
            type="date"
            required
            defaultValue={daysFromToday(30)}
          />
        </Field>
        <Field label="Quality, delivery and other terms">
          <textarea
            name="requirements"
            rows={3}
            maxLength={1200}
            placeholder="Document what still needs checking before a sale."
          />
        </Field>
      </Form>
    </Modal>
  );
}

export function ServiceForm({ onClose, onSave }: FormProps) {
  return (
    <Modal
      title="Record an input or logistics quote"
      description="Keep the source and dates so farmers can judge whether a cost is useful."
      onClose={onClose}
    >
      <Form
        onCancel={onClose}
        submitLabel="Save quote"
        onSubmit={async (form) =>
          onSave(
            "/api/marketplace/services",
            {
              category: fieldText(form, "category"),
              name: fieldText(form, "name"),
              provider: fieldText(form, "provider"),
              district: fieldText(form, "district"),
              community: fieldText(form, "community"),
              crop: fieldText(form, "crop"),
              priceUgx: fieldNumber(form, "priceUgx"),
              unit: fieldText(form, "unit"),
              sourceTitle: fieldText(form, "sourceTitle"),
              sourceUrl: fieldText(form, "sourceUrl"),
              observedAt: fieldText(form, "observedAt"),
              validUntil: fieldText(form, "validUntil"),
              verificationStatus: fieldText(form, "verificationStatus"),
              notes: fieldText(form, "notes"),
            },
            "Quote recorded with its source and validity dates.",
          )
        }
      >
        <Field label="Category">
          <select name="category">
            <option value="input">Farm input</option>
            <option value="transport">Transport</option>
            <option value="storage">Storage</option>
          </select>
        </Field>
        <Field label="Product or service">
          <input
            required
            name="name"
            minLength={2}
            maxLength={160}
            placeholder="For example, seed or maize transport"
          />
        </Field>
        <Field label="Supplier / provider">
          <input required name="provider" minLength={2} maxLength={160} />
        </Field>
        <Field label="District">
          <select name="district">
            <DistrictOptions />
          </select>
        </Field>
        <Field label="Community or route">
          <input name="community" maxLength={120} />
        </Field>
        <Field
          label="Crop"
          hint="Optional when the quote applies to many crops."
        >
          <input name="crop" maxLength={100} />
        </Field>
        <Field label="Price (UGX)">
          <input
            required
            name="priceUgx"
            type="number"
            min="1"
            max="1000000000"
            step="1"
          />
        </Field>
        <Field label="Price unit">
          <input
            required
            name="unit"
            minLength={1}
            maxLength={80}
            placeholder="50 kg bag, tonne / trip, kg / month…"
          />
        </Field>
        <Field label="Source name">
          <input
            required
            name="sourceTitle"
            minLength={2}
            maxLength={200}
            placeholder="Provider price list / staff-confirmed quote"
          />
        </Field>
        <Field
          label="Source link"
          hint="Optional HTTPS link to the published price."
        >
          <input
            name="sourceUrl"
            type="url"
            maxLength={1000}
            placeholder="https://"
          />
        </Field>
        <Field label="Observed on">
          <input
            name="observedAt"
            type="date"
            required
            defaultValue={daysFromToday(0)}
          />
        </Field>
        <Field label="Valid until">
          <input
            name="validUntil"
            type="date"
            required
            defaultValue={daysFromToday(14)}
          />
        </Field>
        <Field label="Source review">
          <select name="verificationStatus">
            <option value="reported">
              Reported, not independently checked
            </option>
            <option value="verified">Checked by our team</option>
          </select>
        </Field>
        <Field label="What this price includes">
          <textarea
            name="notes"
            rows={3}
            maxLength={1200}
            placeholder="Route, loading, storage conditions, taxes or other exclusions"
          />
        </Field>
      </Form>
    </Modal>
  );
}
