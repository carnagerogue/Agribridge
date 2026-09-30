import { useCallback, useState } from "react";
import {
  Plus,
  Droplets,
  Leaf,
  Users,
  ShieldCheck,
  ChevronRight,
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
  fieldText,
} from "../components/ui";
import { dateTime, districts, label } from "../lib/format";
import type { Report } from "../types";
const names = {
  crop_pest: "Crop pests",
  crop_disease: "Crop health",
  standing_water: "Standing water",
};
export default function Community() {
  const { data, user, mutate, notify } = useApp();
  const [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<Report | null>(null),
    [filter, setFilter] = useState("all");
  const close = useCallback(() => setCreating(false), []);
  const staff = user?.role !== "farmer";
  const reports = data.reports.filter(
    (r) => filter === "all" || r.status === filter,
  );
  return (
    <>
      <PageHeader
        title="Community"
        description="Notice something? Help your local team understand what needs attention."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus size={18} />
            Report a concern
          </Button>
        }
      />
      <div className="community-intro">
        <div>
          <Users size={29} />
          <h2>Small observations can make a difference.</h2>
          <p>
            Report crop changes or standing water. Your local team can review
            the concern, arrange a visit, and record what happens next.
          </p>
        </div>
        <div className="privacy-note">
          <ShieldCheck size={24} />
          <strong>Your community’s privacy comes first.</strong>
          <p>
            Describe the environment. Leave out patient names, medical records,
            and other people’s personal details.
          </p>
        </div>
      </div>
      <div className="toolbar">
        <h2>{staff ? "Reports for review" : "Your reports"}</h2>
        <select
          aria-label="Filter report status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {["submitted", "reviewing", "resolved"].map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>
      <section className="panel">
        {reports.map((report) => (
          <button
            className="report-row"
            key={report.id}
            onClick={() => setSelected(report)}
          >
            <span
              className={`round-icon ${report.kind === "standing_water" ? "water-icon" : ""}`}
            >
              {report.kind === "standing_water" ? (
                <Droplets size={24} />
              ) : (
                <Leaf size={24} />
              )}
            </span>
            <span className="report-copy">
              <strong>{names[report.kind]}</strong>
              <span>{report.description}</span>
              <small>
                {report.district} · {dateTime(report.createdAt)}
              </small>
            </span>
            <Badge
              tone={
                report.status === "resolved"
                  ? "green"
                  : report.status === "reviewing"
                    ? "amber"
                    : "neutral"
              }
            >
              {label(report.status)}
            </Badge>
            <ChevronRight size={18} />
          </button>
        ))}
        {!reports.length && (
          <Empty
            icon={Users}
            title="No reports to show."
            body="When you notice a concern, describe it here so your local team can review it."
          />
        )}
      </section>
      <Notice>
        Environmental observations are not confirmed malaria cases or crop
        diagnoses. Standing-water management requires local assessment. Do not
        drain wetlands, enter unsafe water, or apply chemicals based on an app
        report.
      </Notice>
      {creating && (
        <Modal
          title="What have you noticed?"
          description="A clear observation helps the right person follow up."
          onClose={close}
        >
          <Form
            onCancel={close}
            submitLabel="Submit report"
            onSubmit={async (fd) => {
              await mutate("/api/reports", "POST", {
                kind: fieldText(fd, "kind"),
                district: fieldText(fd, "district"),
                farmId: fieldText(fd, "farmId") || undefined,
                description: fieldText(fd, "description"),
                status: "submitted",
              });
              close();
            }}
          >
            <Field label="Type of concern">
              <select name="kind">
                {Object.entries(names).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="District">
              <select
                name="district"
                defaultValue={data.farms[0]?.district ?? "Nakaseke"}
              >
                {districts.map((d) => (
                  <option key={d.name}>{d.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Related farm (optional)">
              <select name="farmId">
                <option value="">Not a farm report</option>
                {data.farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="full-width">
              <Field
                label="Describe what you see"
                hint="Include when it started and the area affected. Do not include private health information."
              >
                <textarea
                  name="description"
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={5}
                  placeholder="e.g. Water remains beside the main footpath after rainfall…"
                />
              </Field>
            </div>
          </Form>
        </Modal>
      )}
      {selected && (
        <Modal
          title={names[selected.kind]}
          description={`${selected.district} · ${dateTime(selected.createdAt)}`}
          onClose={() => setSelected(null)}
        >
          <div className="panel-body">
            <Badge tone="amber">{label(selected.status)}</Badge>
            <p className="report-description">{selected.description}</p>
            {staff && (
              <div className="button-row">
                {(["submitted", "reviewing", "resolved"] as const).map(
                  (status) => (
                    <Button
                      key={status}
                      variant={status === "resolved" ? "primary" : "secondary"}
                      disabled={selected.status === status}
                      onClick={() =>
                        void mutate(`/api/reports/${selected.id}`, "PATCH", {
                          version: selected.version,
                          status,
                        })
                          .then(() => setSelected(null))
                          .catch((e) => notify(e.message))
                      }
                    >
                      {status === "reviewing"
                        ? "Start review"
                        : status === "resolved"
                          ? "Mark resolved"
                          : "Return to submitted"}
                    </Button>
                  ),
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
