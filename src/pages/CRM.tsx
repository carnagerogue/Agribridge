import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  CalendarPlus,
  Check,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Users,
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
  fieldText,
} from "../components/ui";
import { crops, date, initials, label, today } from "../lib/format";
import type { Channel, Contact, Task } from "../types";
import { useRecordDetails } from "../lib/useRecordDetails";

function ContactEditor({
  contact,
  onClose,
  onSaved,
}: {
  contact?: Contact;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { mutate } = useApp();
  const [channel, setChannel] = useState<Channel>(
    contact?.preferredChannel ?? "sms",
  );
  const [consent, setConsent] = useState(contact?.consent ?? false);
  async function save(form: FormData) {
    const body = {
      name: fieldText(form, "name"),
      phone: fieldText(form, "phone"),
      district: fieldText(form, "district"),
      type: fieldText(form, "type"),
      crop: fieldText(form, "crop"),
      stage: fieldText(form, "stage"),
      preferredChannel: channel,
      consent,
      notes: fieldText(form, "notes"),
      ...(contact ? { version: contact.version } : {}),
    };
    const result = await mutate<Contact>(
      contact ? `/api/contacts/${contact.id}` : "/api/contacts",
      contact ? "PATCH" : "POST",
      body,
      false,
    );
    if (!("queued" in result)) onSaved(result.id);
    onClose();
  }
  return (
    <Modal
      title={contact ? "Edit relationship" : "Add a relationship"}
      description="Keep the person, their needs and their preferred way to connect together."
      onClose={onClose}
      wide
    >
      <Form
        onSubmit={save}
        onCancel={onClose}
        submitLabel={contact ? "Save changes" : "Add contact"}
      >
        <Field label="Name or organization">
          <input
            name="name"
            defaultValue={contact?.name}
            required
            maxLength={160}
            autoComplete="name"
          />
        </Field>
        <Field
          label="Phone number"
          hint="Uganda format: +256 followed by the nine-digit number."
        >
          <input
            name="phone"
            type="tel"
            defaultValue={contact?.phone}
            placeholder="+2567XXXXXXXX"
            required
            pattern="\+256[37][0-9]{8}"
            autoComplete="tel"
          />
        </Field>
        <Field label="District">
          <input
            name="district"
            defaultValue={contact?.district}
            required
            maxLength={160}
          />
        </Field>
        <Field label="Relationship">
          <select name="type" defaultValue={contact?.type ?? "farmer"}>
            <option value="farmer">Farmer</option>
            <option value="buyer">Buyer</option>
            <option value="cooperative">Cooperative</option>
            <option value="supplier">Supplier</option>
          </select>
        </Field>
        <Field label="Main crop">
          <input
            name="crop"
            list="crm-crops"
            defaultValue={contact?.crop}
            required
            maxLength={160}
          />
          <datalist id="crm-crops">
            {crops.map((crop) => (
              <option key={crop} value={crop} />
            ))}
          </datalist>
        </Field>
        <Field label="Relationship status">
          <select name="stage" defaultValue={contact?.stage ?? "new"}>
            <option value="new">New</option>
            <option value="active">Active</option>
            <option value="follow_up">Needs follow-up</option>
          </select>
        </Field>
        <Field label="Preferred channel">
          <select
            value={channel}
            onChange={(event) => {
              setChannel(event.target.value as Channel);
              setConsent(false);
            }}
          >
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="voice">Phone call</option>
            <option value="ussd">USSD</option>
          </select>
        </Field>
        <label className="op-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>
            I confirm this person agreed to contact through{" "}
            {channel === "voice"
              ? "phone calls"
              : channel === "whatsapp"
                ? "WhatsApp"
                : channel.toUpperCase()}
            .
            <small>
              Record how and when they agreed in the notes. Leave unchecked if
              permission is unknown.
            </small>
          </span>
        </label>
        <div className="op-full">
          <Field
            label="Relationship notes"
            hint="Keep notes relevant to farming and support. Avoid health details or financial credentials."
          >
            <textarea
              name="notes"
              defaultValue={contact?.notes}
              maxLength={3000}
              rows={3}
            />
          </Field>
        </div>
      </Form>
    </Modal>
  );
}

export default function CRM() {
  const { user, data, loading, error, online, refresh, mutate } = useApp();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<Contact | "new" | null>(null),
    [followUp, setFollowUp] = useState<Contact | null>(null);
  const [actionError, setActionError] = useState(""),
    [busyTask, setBusyTask] = useState("");
  const { detailRef, listRef, openDetails, backToList } =
    useRecordDetails(setSelectedId);
  const closeEditor = useCallback(() => setEditor(null), []),
    closeFollowUp = useCallback(() => setFollowUp(null), []);
  const contacts = useMemo(
    () =>
      data.contacts.filter(
        (contact) =>
          (filter === "all" || contact.stage === filter) &&
          `${contact.name} ${contact.phone} ${contact.district} ${contact.crop}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [data.contacts, filter, query],
  );
  const selected =
    contacts.find((contact) => contact.id === selectedId) ?? contacts[0];
  const followUps = selected
    ? data.tasks.filter(
        (task) =>
          task.category === "follow_up" &&
          task.notes.includes(`[Contact: ${selected.id}]`),
      )
    : [];
  async function saveFollowUp(form: FormData) {
    if (!followUp) return;
    await mutate<Task>(
      "/api/tasks",
      "POST",
      {
        farmId: "",
        title: fieldText(form, "title"),
        dueDate: fieldText(form, "dueDate"),
        category: "follow_up",
        status: "pending",
        notes: `[Contact: ${followUp.id}] ${fieldText(form, "notes")}`,
      },
      false,
    );
    closeFollowUp();
  }
  async function complete(task: Task) {
    setBusyTask(task.id);
    setActionError("");
    try {
      await mutate(
        `/api/tasks/${task.id}`,
        "PATCH",
        { status: "completed", version: task.version },
        false,
      );
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Unable to complete this follow-up.",
      );
    } finally {
      setBusyTask("");
    }
  }
  if (user?.role === "farmer")
    return (
      <Empty
        title="Your farming workspace is ready"
        body="The relationship workspace is available to your cooperative's authorized team."
        action={
          <Link className="text-link" to="/">
            Go to Today <ArrowRight size={16} />
          </Link>
        }
      />
    );
  if (loading) return <Skeleton />;
  return (
    <>
      <PageHeader
        title="Farmers & CRM"
        description="Know the people behind every harvest. Make the next conversation count."
        action={
          <Button onClick={() => setEditor("new")} disabled={!online}>
            <Plus size={17} />
            Add contact
          </Button>
        }
      />
      {!online && (
        <Notice>
          Reconnect to view or update contact records. Contact information is
          not saved for offline access.
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
      <div className="stat-strip crm-summary">
        <div className="stat">
          <span>Relationships</span>
          <strong>{data.contacts.length}</strong>
        </div>
        <div className="stat">
          <span>Needs follow-up</span>
          <strong>
            {
              data.contacts.filter((contact) => contact.stage === "follow_up")
                .length
            }
          </strong>
        </div>
        <div className="stat">
          <span>Permission recorded</span>
          <strong>
            {data.contacts.filter((contact) => contact.consent).length}
          </strong>
        </div>
      </div>
      <div className="toolbar">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search names, districts or crops"
        />
        <select
          aria-label="Filter relationship status"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All relationships</option>
          <option value="new">New</option>
          <option value="active">Active</option>
          <option value="follow_up">Needs follow-up</option>
        </select>
      </div>
      <div className="split-layout op-crm-layout">
        <section className="panel">
          <div className="panel-header">
            <h2 ref={listRef} tabIndex={-1} className="op-focus-target">
              Your network
            </h2>
            <span className="muted">{contacts.length} contacts</span>
          </div>
          {contacts.length ? (
            <div className="table-wrap">
              <table
                className="data-table op-record-table"
                role="table"
                aria-label="Contacts"
              >
                <thead role="rowgroup">
                  <tr role="row">
                    <th scope="col">Contact</th>
                    <th scope="col">District / crop</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Open details</span>
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {contacts.map((contact) => (
                    <tr
                      role="row"
                      key={contact.id}
                      className={
                        selected?.id === contact.id ? "op-selected-row" : ""
                      }
                    >
                      <td role="cell">
                        <button
                          className="op-person"
                          onClick={(event) =>
                            openDetails(contact.id, event.currentTarget)
                          }
                          aria-controls="crm-record-detail"
                          aria-pressed={selected?.id === contact.id}
                        >
                          <span className="op-avatar">
                            {initials(contact.name)}
                          </span>
                          <span>
                            <strong>{contact.name}</strong>
                            <small>{label(contact.type)}</small>
                          </span>
                        </button>
                      </td>
                      <td role="cell" data-label="District / crop">
                        <span>{contact.district}</span>
                        <small className="op-cell-secondary">
                          {contact.crop}
                        </small>
                      </td>
                      <td role="cell" data-label="Status">
                        <Badge
                          tone={
                            contact.stage === "active"
                              ? "green"
                              : contact.stage === "follow_up"
                                ? "amber"
                                : "neutral"
                          }
                        >
                          {contact.stage === "follow_up"
                            ? "Follow up"
                            : label(contact.stage)}
                        </Badge>
                      </td>
                      <td role="cell">
                        <button
                          className="row-action"
                          onClick={(event) =>
                            openDetails(contact.id, event.currentTarget)
                          }
                          aria-controls="crm-record-detail"
                          aria-label={`View details for ${contact.name}`}
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
              icon={Users}
              title={
                query || filter !== "all"
                  ? "No matching contacts"
                  : "Every relationship starts here"
              }
              body={
                query || filter !== "all"
                  ? "Try another name, district or status."
                  : "Add a farmer, buyer, supplier or cooperative to organize your next conversation."
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
                    Add your first contact
                  </Button>
                )
              }
            />
          )}
        </section>
        {selected && (
          <aside
            className="panel detail-panel op-focus-target"
            id="crm-record-detail"
            ref={detailRef}
            tabIndex={-1}
            aria-labelledby="crm-record-name"
          >
            <button
              type="button"
              className="op-mobile-back text-link"
              onClick={backToList}
            >
              <ArrowLeft size={16} /> Back to contacts
            </button>
            <div className="panel-header">
              <span className="op-eyebrow">Relationship profile</span>
              <button
                className="row-action"
                onClick={() => setEditor(selected)}
                disabled={!online}
                aria-label={`Edit ${selected.name}`}
              >
                <Pencil size={17} />
              </button>
            </div>
            <div className="op-detail-body">
              <span className="op-avatar op-avatar-large">
                {initials(selected.name)}
              </span>
              <h2 id="crm-record-name">{selected.name}</h2>
              <p className="muted">
                {label(selected.type)} · {selected.crop}
              </p>
              <div className="op-contact-lines">
                <span>
                  <MapPin size={16} />
                  {selected.district}
                </span>
                <span>
                  <Phone size={16} />
                  {selected.phone}
                </span>
              </div>
              <div className="op-permission">
                <Badge tone={selected.consent ? "green" : "amber"}>
                  {selected.consent
                    ? "Permission recorded"
                    : "Permission not recorded"}
                </Badge>
                <p>
                  {selected.consent
                    ? `Preferred contact: ${selected.preferredChannel === "whatsapp" ? "WhatsApp" : label(selected.preferredChannel)}.`
                    : "Ask for permission before sending messages."}
                </p>
              </div>
              <div className="op-inline-actions">
                <Button
                  variant="secondary"
                  onClick={() => setFollowUp(selected)}
                  disabled={!online}
                >
                  <CalendarPlus size={16} />
                  Follow up
                </Button>
                <Link
                  className="text-link"
                  to={`/messages?contact=${encodeURIComponent(selected.id)}`}
                >
                  <Mail size={16} />
                  Message
                </Link>
              </div>
              <div className="op-note">
                <h3>Notes</h3>
                <p>
                  {selected.notes ||
                    "No notes yet. Add what will make your next conversation useful."}
                </p>
              </div>
              <div className="op-follow-ups">
                <h3>Follow-ups</h3>
                {followUps.length ? (
                  followUps.map((task) => (
                    <div className="op-follow-up" key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <small>
                          {date(task.dueDate)} · {label(task.status)}
                        </small>
                      </div>
                      {task.status !== "completed" && (
                        <button
                          className="row-action"
                          disabled={!online || busyTask === task.id}
                          onClick={() => void complete(task)}
                          aria-label={`Complete ${task.title}`}
                        >
                          <Check size={17} />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    No follow-ups recorded for this contact.
                  </p>
                )}
              </div>
              {actionError && <ErrorMessage message={actionError} />}
            </div>
          </aside>
        )}
      </div>
      {editor && (
        <ContactEditor
          contact={editor === "new" ? undefined : editor}
          onClose={closeEditor}
          onSaved={(id) => {
            setSelectedId(id);
            setQuery("");
            setFilter("all");
          }}
        />
      )}
      {followUp && (
        <Modal
          title={`Follow up with ${followUp.name}`}
          description="Add a clear next step to your team's task list."
          onClose={closeFollowUp}
        >
          <Form
            onSubmit={saveFollowUp}
            onCancel={closeFollowUp}
            submitLabel="Save follow-up"
          >
            <div className="op-full">
              <Field label="Next step">
                <input
                  name="title"
                  defaultValue={`Follow up with ${followUp.name}`.slice(0, 160)}
                  required
                  maxLength={160}
                />
              </Field>
            </div>
            <Field label="Due date">
              <input
                type="date"
                name="dueDate"
                defaultValue={today()}
                required
              />
            </Field>
            <div className="op-full">
              <Field label="Notes">
                <textarea
                  name="notes"
                  rows={3}
                  maxLength={2800}
                  placeholder="What should be discussed or checked?"
                />
              </Field>
            </div>
          </Form>
        </Modal>
      )}
    </>
  );
}
