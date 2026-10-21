import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Globe2, LockKeyhole } from "lucide-react";
import { Button, Form, Modal, Notice } from "../ui";
import type { SupplyListing } from "../../../server/marketplace-types";

/** Publishing is a separate, explicit choice from recording a farm's supply. */
export function SupplyPublication({
  supply,
  online,
  busy,
  onChange,
}: {
  supply: SupplyListing;
  online: boolean;
  busy: boolean;
  onChange: (published: boolean) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="market-publication">
      <div>
        {supply.published ? <Globe2 size={17} /> : <LockKeyhole size={17} />}
        <span>
          <strong>
            {supply.published ? "Published to buyers" : "Workspace only"}
          </strong>
          <small>
            {supply.published
              ? "Available, uncommitted produce can appear in the buyer marketplace."
              : "Choose when to share this listing with purchasing clients."}
          </small>
        </span>
      </div>
      <div className="market-publication-actions">
        {supply.published ? (
          <>
            <Link to="/buy">
              Buyer marketplace <ArrowUpRight size={14} />
            </Link>
            <Button
              variant="ghost"
              busy={busy}
              disabled={!online}
              onClick={() => setConfirming(true)}
            >
              Unpublish
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            disabled={!online || busy || supply.status !== "available"}
            onClick={() => setConfirming(true)}
          >
            Publish to buyers
          </Button>
        )}
      </div>
      {confirming ? (
        <Modal
          title={
            supply.published
              ? "Remove this public listing?"
              : "Publish this produce to buyers?"
          }
          description={`${supply.crop}${supply.variety ? ` · ${supply.variety}` : ""}`}
          onClose={() => setConfirming(false)}
        >
          <Form
            submitLabel={
              supply.published ? "Confirm unpublish" : "Confirm publication"
            }
            onCancel={() => setConfirming(false)}
            onSubmit={async () => {
              await onChange(!supply.published);
              setConfirming(false);
            }}
          >
            <Notice>
              {supply.published
                ? "New buyers will no longer find this listing. Existing order requests and accepted commitments remain in your records."
                : "Anyone can see your business name, community, district, produce details, harvest window and asking price. Your phone number and private farm records stay in your workspace. Buyers can request an order; you decide whether to accept it."}
            </Notice>
          </Form>
        </Modal>
      ) : null}
    </div>
  );
}
