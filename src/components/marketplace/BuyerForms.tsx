import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCheck,
  CreditCard,
  MapPin,
} from "lucide-react";
import { Button, Field, Form, Modal } from "../ui";
import type { BuyerAccount, BuyerListing } from "../../../server/buyer-types";
import type { BuyerOrder } from "../../../server/buyer-order-types";
import type { BuyerOrderInput, BuyerSignup } from "../../lib/buyer-api";
import {
  buyerDate,
  buyerEarliestDate,
  buyerMoney,
  buyerNumber,
  buyerToday,
  previewBuyerTotal,
  validateBuyerOrder,
  type BuyerOrderDraft,
} from "../../lib/buyer-marketplace";

export function BuyerAuthDialog({
  mode,
  onMode,
  onSubmit,
  onClose,
}: {
  mode: "login" | "signup";
  onMode: (mode: "login" | "signup") => void;
  onSubmit: (mode: "login" | "signup", data: BuyerSignup) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={
        mode === "signup"
          ? "Your next supplier starts here."
          : "Welcome back, buyer."
      }
      description="A buyer account keeps your requests together. Farm workspace accounts use a separate sign-in."
      onClose={onClose}
      wide={mode === "signup"}
    >
      <div className="buyer-dialog">
        <div
          className="buyer-auth-modes"
          role="group"
          aria-label="Buyer account access"
        >
          <button
            type="button"
            aria-pressed={mode === "signup"}
            disabled={busy}
            onClick={() => onMode("signup")}
          >
            Create buyer account
          </button>
          <button
            type="button"
            aria-pressed={mode === "login"}
            disabled={busy}
            onClick={() => onMode("login")}
          >
            Sign in
          </button>
        </div>
        <Form
          key={mode}
          submitLabel={
            mode === "signup" ? "Create buyer account" : "Sign in as buyer"
          }
          onCancel={onClose}
          onSubmit={async (data) => {
            setBusy(true);
            try {
              await onSubmit(mode, {
                name: String(data.get("name") || "").trim(),
                businessName: String(data.get("businessName") || "").trim(),
                phone: String(data.get("phone") || "").trim(),
                email: String(data.get("email") || "").trim(),
                district: String(data.get("district") || "").trim(),
                community: String(data.get("community") || "").trim(),
                password: String(data.get("password") || ""),
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "signup" && (
            <>
              <Field label="Your name">
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                />
              </Field>
              <Field label="Business or organisation (optional)">
                <input
                  name="businessName"
                  autoComplete="organization"
                  maxLength={160}
                  placeholder="Restaurant, shop, cooperative…"
                />
              </Field>
            </>
          )}
          <Field
            label="Uganda phone number"
            hint="Use your phone number to sign in. It is not verified by this form."
          >
            <input
              name="phone"
              type="tel"
              autoComplete="username"
              inputMode="tel"
              required
              maxLength={30}
              placeholder="07xx xxx xxx or +256…"
            />
          </Field>
          {mode === "signup" && (
            <>
              <Field label="Email (optional)">
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={240}
                />
              </Field>
              <Field label="District">
                <input
                  name="district"
                  autoComplete="address-level2"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="e.g. Kampala"
                />
              </Field>
              <Field label="Community or trading centre (optional)">
                <input
                  name="community"
                  autoComplete="address-level3"
                  maxLength={120}
                />
              </Field>
            </>
          )}
          <div className="buyer-form-full">
            <Field
              label="Password"
              hint={
                mode === "signup"
                  ? "Use at least 14 characters. Never enter a mobile-money PIN."
                  : undefined
              }
            >
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                required
                minLength={mode === "signup" ? 14 : 1}
                maxLength={128}
              />
            </Field>
          </div>
        </Form>
      </div>
    </Modal>
  );
}

export function BuyerOrderDialog({
  listing,
  buyer,
  onSubmit,
  onClose,
  simulation = false,
}: {
  listing: BuyerListing;
  buyer: BuyerAccount;
  onSubmit: (body: BuyerOrderInput) => Promise<void>;
  onClose: () => void;
  simulation?: boolean;
}) {
  const [draft, setDraft] = useState<BuyerOrderDraft>({
    quantityKg: String(Math.min(100, Math.floor(listing.availableQuantityKg))),
    deliveryLocation: [buyer.community, buyer.district]
      .filter(Boolean)
      .join(", "),
    requestedDeliveryDate: "",
    message: "",
  });
  const total = previewBuyerTotal(listing, draft.quantityKg);
  function update(key: keyof BuyerOrderDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  return (
    <Modal
      title={
        simulation
          ? "Review a sample order request"
          : "Review your order request"
      }
      description={
        simulation
          ? "A browser-only walkthrough. Use fictional details; nothing is sent to a seller."
          : "The seller will review availability and agree the next steps with you."
      }
      onClose={onClose}
      wide
    >
      <div className="buyer-dialog">
        <div className="buyer-review-item">
          <span className="buyer-review-icon">
            <Building2 size={24} />
          </span>
          <div>
            <strong>{listing.variety || listing.crop}</strong>
            <span>
              {listing.sellerName} · {listing.district}
            </span>
          </div>
          <span>
            {listing.priceUgxPerKg === null
              ? "Price to agree"
              : buyerMoney(listing.priceUgxPerKg)}
            <small>/ kg</small>
          </span>
        </div>
        {listing.sample && (
          <p className="buyer-sample-note">
            {simulation
              ? "BROWSER PREVIEW · This sample stays on this page. No account or real order is created."
              : "SAMPLE LISTING · This request creates a demo record, not a real purchase."}
          </p>
        )}
        <Form
          onCancel={onClose}
          submitLabel={
            simulation ? "Create sample request" : "Send order request"
          }
          onSubmit={async () => {
            const problem = validateBuyerOrder(listing, draft, buyerToday());
            if (problem) throw new Error(problem);
            await onSubmit({
              supplyId: listing.id,
              listingVersion: listing.version,
              quantityKg: Number(draft.quantityKg),
              deliveryLocation: draft.deliveryLocation.trim(),
              requestedDeliveryDate: draft.requestedDeliveryDate || null,
              message: draft.message.trim(),
            });
          }}
        >
          <Field
            label="Quantity (kg)"
            hint={`${buyerNumber(listing.availableQuantityKg)} kg currently available`}
          >
            <input
              name="quantityKg"
              type="number"
              min={1}
              step={1}
              max={Math.floor(listing.availableQuantityKg)}
              required
              value={draft.quantityKg}
              onChange={(event) => update("quantityKg", event.target.value)}
            />
          </Field>
          <Field
            label="Preferred date (optional)"
            hint="The seller will confirm timing with you."
          >
            <input
              name="requestedDeliveryDate"
              type="date"
              min={buyerEarliestDate(listing, buyerToday())}
              value={draft.requestedDeliveryDate}
              onChange={(event) =>
                update("requestedDeliveryDate", event.target.value)
              }
            />
          </Field>
          <div className="buyer-form-full">
            <Field
              label="Delivery or collection location"
              hint="A request for this location; delivery is not yet arranged."
            >
              <input
                name="deliveryLocation"
                minLength={2}
                maxLength={240}
                required
                value={draft.deliveryLocation}
                onChange={(event) =>
                  update("deliveryLocation", event.target.value)
                }
                placeholder="District, trading centre or collection point"
              />
            </Field>
          </div>
          <div className="buyer-form-full">
            <Field label="Message to the seller (optional)">
              <textarea
                name="message"
                rows={3}
                maxLength={600}
                value={draft.message}
                onChange={(event) => update("message", event.target.value)}
                placeholder="Your quality requirements, collection plans or questions"
              />
            </Field>
          </div>
          <div className="buyer-order-total buyer-form-full">
            <span>
              {simulation ? "Sample produce value" : "Estimated produce value"}
              <strong>
                {total === null ? "Choose a valid quantity" : buyerMoney(total)}
              </strong>
            </span>
            <p>
              {simulation
                ? "Fictional prices, calculated in your browser. No seller quote or delivery arrangement."
                : "The server confirms the amount when your request is saved. Transport, storage and delivery costs are not included."}
            </p>
          </div>
          <div className="buyer-order-explainer buyer-form-full">
            <CreditCard size={19} />
            <p>
              No payment is taken. This is an order request, subject to seller
              acceptance. Sending a request does not reserve stock.
            </p>
          </div>
        </Form>
      </div>
    </Modal>
  );
}

export function BuyerConfirmation({
  order,
  onOrders,
  onClose,
  simulation = false,
}: {
  order: BuyerOrder;
  onOrders: () => void;
  onClose: () => void;
  simulation?: boolean;
}) {
  return (
    <Modal
      title={
        simulation ? "Sample request created." : "Your request is on its way."
      }
      description={
        simulation
          ? "This stays in your browser. No seller has received a message or order."
          : "The seller must accept before the order is confirmed."
      }
      onClose={onClose}
    >
      <div className="buyer-dialog buyer-confirmation">
        <span className="buyer-confirmation-mark">
          <CheckCheck size={30} />
        </span>
        <p className="buyer-confirmation-status">
          {order.sample ? "SAMPLE REQUEST SAVED" : "ORDER REQUEST SAVED"}
        </p>
        <h3>
          {buyerNumber(order.quantityKg)} kg · {order.crop}
        </h3>
        <p>{order.sellerName}</p>
        <dl>
          <div>
            <dt>Produce value</dt>
            <dd>{buyerMoney(order.totalUgx)}</dd>
          </div>
          <div>
            <dt>Delivery / collection</dt>
            <dd>{order.deliveryLocation}</dd>
          </div>
          {order.requestedDeliveryDate && (
            <div>
              <dt>Preferred date</dt>
              <dd>{buyerDate(order.requestedDeliveryDate)}</dd>
            </div>
          )}
        </dl>
        <p className="buyer-help">
          {simulation
            ? "Fictional amount calculated in your browser. Reset or reload the page to clear sample requests. No payment has occurred."
            : "This amount was calculated by the server. Delivery is not included. No payment has been collected."}
        </p>
        <Button onClick={onOrders}>
          {simulation ? "View sample requests" : "Track my request"}{" "}
          <ArrowRight size={16} />
        </Button>
      </div>
    </Modal>
  );
}

export function BuyerAccountDialog({
  buyer,
  onSignOut,
  onClose,
}: {
  buyer: BuyerAccount;
  onSignOut: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Your buyer account"
      description="Your buying profile is separate from farm workspace access."
      onClose={onClose}
    >
      <div className="buyer-dialog">
        <div className="buyer-account-card">
          <Building2 size={27} />
          <div>
            <strong>{buyer.businessName || buyer.name}</strong>
            <span>{buyer.businessName ? buyer.name : "Individual buyer"}</span>
          </div>
        </div>
        <dl className="buyer-account-details">
          <div>
            <dt>Phone</dt>
            <dd>
              {buyer.phone}{" "}
              <small>{buyer.phoneVerified ? "Verified" : "Not verified"}</small>
            </dd>
          </div>
          {buyer.email && (
            <div>
              <dt>Email</dt>
              <dd>{buyer.email}</dd>
            </div>
          )}
          <div>
            <dt>Location</dt>
            <dd>
              <MapPin size={13} />{" "}
              {[buyer.community, buyer.district].filter(Boolean).join(", ")}
            </dd>
          </div>
        </dl>
        <Form
          onSubmit={async () => onSignOut()}
          submitLabel="Sign out of buyer account"
          onCancel={onClose}
        >
          <div className="buyer-form-full buyer-help">
            Signing out of this buyer account does not change a farm workspace
            session.
          </div>
        </Form>
      </div>
    </Modal>
  );
}
