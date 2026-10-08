import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Plus,
  RotateCcw,
  ShieldCheck,
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
  Skeleton,
  fieldText,
} from "../components/ui";
import { request } from "../lib/api";
import { dateTime, label, number } from "../lib/format";
import type { AdminOverview, Role } from "../types";
import LessonEditorial from "../components/LessonEditorial";

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  active: boolean;
  passwordChangeRequired: boolean;
  mfaEnabled: boolean;
  createdAt: string;
};

export default function Admin() {
  const { user, online, notify } = useApp();
  const [overview, setOverview] = useState<AdminOverview | null>(null),
    [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [teamError, setTeamError] = useState(""),
    [loadedAt, setLoadedAt] = useState("");
  const [revision, setRevision] = useState(0),
    [adding, setAdding] = useState(false);
  const [accessChange, setAccessChange] = useState<TeamMember | null>(null),
    [mfaReset, setMfaReset] = useState<TeamMember | null>(null),
    [passwordReset, setPasswordReset] = useState<TeamMember | null>(null);
  const closeEditor = useCallback(() => setAdding(false), []);
  const closeAccess = useCallback(() => setAccessChange(null), []);
  const closeMfaReset = useCallback(() => setMfaReset(null), []);
  const closePasswordReset = useCallback(() => setPasswordReset(null), []);
  const admin = user?.role === "admin";
  useEffect(() => {
    let active = true;
    if (!online || !user || user.role === "farmer") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setTeamError("");
    void Promise.allSettled([
      request<AdminOverview>("/api/admin/overview"),
      admin
        ? request<TeamMember[]>("/api/admin/users")
        : Promise.resolve([] as TeamMember[]),
    ]).then(([summary, people]) => {
      if (!active) return;
      if (summary.status === "fulfilled") {
        setOverview(summary.value);
        setLoadedAt(new Date().toISOString());
      } else
        setError(
          summary.reason instanceof Error
            ? summary.reason.message
            : "Unable to load administration.",
        );
      if (people.status === "fulfilled") setTeam(people.value);
      else
        setTeamError(
          people.reason instanceof Error
            ? people.reason.message
            : "Unable to load team members.",
        );
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [revision, online, user?.id, admin]);
  async function createMember(form: FormData) {
    const email = fieldText(form, "email"),
      phone = fieldText(form, "phone");
    if (!email && !phone)
      throw new Error(
        "Add an email address or Uganda phone number for sign-in.",
      );
    await request<TeamMember>(
      "/api/admin/users",
      "POST",
      {
        name: fieldText(form, "name"),
        role: fieldText(form, "role"),
        password: String(form.get("password") ?? ""),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      },
      crypto.randomUUID(),
    );
    closeEditor();
    setRevision((value) => value + 1);
    notify(
      "Account created. Share the initial password securely; it must be changed at first sign-in.",
    );
  }
  async function changeAccess() {
    if (!accessChange) return;
    await request<TeamMember>(
      `/api/admin/users/${accessChange.id}`,
      "PATCH",
      { active: !accessChange.active },
      crypto.randomUUID(),
    );
    closeAccess();
    setRevision((value) => value + 1);
    notify(
      accessChange.active
        ? "Account access suspended. Existing sessions have ended."
        : "Account access restored.",
    );
  }
  async function setTemporaryPassword(form: FormData) {
    if (!passwordReset) return;
    await request<TeamMember>(
      `/api/admin/users/${passwordReset.id}/password`,
      "POST",
      { password: String(form.get("password") ?? "") },
      crypto.randomUUID(),
    );
    closePasswordReset();
    setRevision((value) => value + 1);
    notify(
      "Temporary password set. Share it securely; it must be changed at the next sign-in.",
    );
  }
  async function resetTwoFactor() {
    if (!mfaReset) return;
    await request<TeamMember>(
      `/api/admin/users/${mfaReset.id}/mfa`,
      "DELETE",
      undefined,
      crypto.randomUUID(),
    );
    closeMfaReset();
    setRevision((value) => value + 1);
    notify(
      "Two-factor sign-in was reset. That person was signed out and will set it up again at their next sign-in.",
    );
  }
  if (user?.role === "farmer")
    return (
      <Empty
        icon={ShieldCheck}
        title="Administration is restricted"
        body="Your cooperative's authorized staff manage team access and service connections."
      />
    );
  return (
    <>
      <PageHeader
        title="Administration"
        description="A clear view of your workspace, connections and team activity."
        action={
          <Button
            variant="secondary"
            disabled={!online}
            busy={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RotateCcw size={16} />
            Refresh
          </Button>
        }
      />
      {!online && (
        <Notice>
          Reconnect to load administration or manage accounts. These records are
          not stored for offline use.
        </Notice>
      )}
      {error && (
        <div className="op-error">
          <ErrorMessage message={error} />
          <Button
            variant="secondary"
            onClick={() => setRevision((value) => value + 1)}
            disabled={!online}
          >
            Try again
          </Button>
        </div>
      )}
      {loading && !overview ? (
        <Skeleton />
      ) : overview ? (
        <>
          <div className="stat-strip">
            {[
              { key: "farms", title: "Farm records" },
              { key: "contacts", title: "Relationships" },
              { key: "deals", title: "Trade opportunities" },
              { key: "reports", title: "Community reports" },
            ].map((item) => (
              <div className="stat" key={item.key}>
                <span>{item.title}</span>
                <strong>{number(overview.counts[item.key] ?? 0)}</strong>
              </div>
            ))}
          </div>
          <section className="panel op-integrations">
            <div className="panel-header">
              <h2>Service connections</h2>
              <span className="muted">Configuration status</span>
            </div>
            <div className="op-integration-list">
              {overview.integrations.map((integration) => (
                <article className="op-integration" key={integration.id}>
                  <span
                    className={`op-service-icon ${integration.status === "not_configured" ? "unready" : ""}`}
                  >
                    {integration.status === "configured" ||
                    integration.status === "available" ? (
                      <CheckCircle2 size={21} />
                    ) : (
                      <CircleDot size={21} />
                    )}
                  </span>
                  <div>
                    <h3>{integration.name}</h3>
                    <p>{integration.detail}</p>
                  </div>
                  <Badge
                    tone={
                      integration.status === "configured" ||
                      integration.status === "available"
                        ? "blue"
                        : integration.status === "failed"
                          ? "red"
                          : "amber"
                    }
                  >
                    {integration.status === "not_configured"
                      ? "Setup needed"
                      : label(integration.status)}
                  </Badge>
                </article>
              ))}
            </div>
            <div className="op-panel-note">
              <ShieldCheck size={16} />
              <span>
                Configuration is not proof of successful delivery. Confirm live
                provider tests before inviting users.
              </span>
            </div>
          </section>
        </>
      ) : !loading && !error ? (
        <Empty
          title="Administration is unavailable"
          body="Connect to load your workspace records."
        />
      ) : null}
      {admin && (
        <section className="panel op-team">
          <div className="panel-header">
            <div>
              <h2>People & access</h2>
              <p className="muted">
                Accounts are created within this organization.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => setAdding(true)}
              disabled={!online}
            >
              <Plus size={16} />
              Add member
            </Button>
          </div>
          {teamError && (
            <div className="op-panel-error">
              <ErrorMessage message={teamError} />
            </div>
          )}
          {loading && !team.length ? (
            <Skeleton />
          ) : team.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Sign-in</th>
                    <th>Role</th>
                    <th>Account</th>
                    <th>
                      <span className="sr-only">Manage access</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <strong>{member.name}</strong>
                        <small className="op-cell-secondary">
                          Added {dateTime(member.createdAt)}
                        </small>
                      </td>
                      <td>
                        {member.email || member.phone || "Not set"}
                        {member.email && member.phone && (
                          <small className="op-cell-secondary">
                            {member.phone}
                          </small>
                        )}
                      </td>
                      <td>
                        <Badge
                          tone={member.role === "admin" ? "blue" : "neutral"}
                        >
                          {label(member.role)}
                        </Badge>
                      </td>
                      <td>
                        <Badge
                          tone={
                            !member.active
                              ? "neutral"
                              : member.passwordChangeRequired
                                ? "amber"
                                : "green"
                          }
                        >
                          {!member.active
                            ? "Inactive"
                            : member.passwordChangeRequired
                              ? "Password change due"
                              : "Active"}
                        </Badge>
                        {(member.role === "admin" || member.mfaEnabled) && (
                          <small className="op-cell-secondary">
                            {member.mfaEnabled
                              ? "Two-factor sign-in on"
                              : "Two-factor sign-in not set up"}
                          </small>
                        )}
                      </td>
                      <td>
                        {member.id === user?.id ? (
                          <span className="muted">Your account</span>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              disabled={!online}
                              onClick={() => setAccessChange(member)}
                            >
                              {member.active ? "Suspend" : "Restore access"}
                            </Button>
                            {member.active && (
                              <Button
                                variant="ghost"
                                disabled={!online}
                                onClick={() => setPasswordReset(member)}
                              >
                                Set temporary password
                              </Button>
                            )}
                            {member.mfaEnabled && (
                              <Button
                                variant="ghost"
                                disabled={!online}
                                onClick={() => setMfaReset(member)}
                              >
                                Reset two-factor
                              </Button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !teamError ? (
            <Empty
              icon={Users}
              title="No team accounts loaded"
              body="Refresh your connection or add a member to this organization."
            />
          ) : null}
        </section>
      )}
      {admin && <LessonEditorial revision={revision} />}
      {overview && (
        <section className="panel op-audit">
          <div className="panel-header">
            <h2>Recent activity</h2>
            <Activity size={19} />
          </div>
          {overview.audit.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Person</th>
                    <th>Record type</th>
                    <th>Time · Kampala</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.audit.map((event) => (
                    <tr key={event.id}>
                      <td>{event.action.split(".").map(label).join(" · ")}</td>
                      <td>{event.actorName || "System"}</td>
                      <td>{label(event.entityType.replaceAll("-", " "))}</td>
                      <td>{dateTime(event.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              icon={Activity}
              title="No activity recorded yet"
              body="Workspace changes appear here as your team starts working."
            />
          )}
        </section>
      )}
      {loadedAt && (
        <p className="op-footnote">
          Last refreshed {dateTime(loadedAt)} · Times shown in Uganda time.
          Recent activity shows the latest recorded events.
        </p>
      )}
      {accessChange && admin && (
        <Modal
          title={
            accessChange.active
              ? "Suspend account access?"
              : "Restore account access?"
          }
          description={`${accessChange.name} · ${label(accessChange.role)}`}
          onClose={closeAccess}
        >
          <Form
            onSubmit={changeAccess}
            onCancel={closeAccess}
            submitLabel={
              accessChange.active ? "Suspend access" : "Restore access"
            }
          >
            <div className="op-full">
              <Notice tone={accessChange.active ? "warning" : "info"}>
                {accessChange.active
                  ? "This person will be signed out and unable to sign in. Their records remain in the workspace."
                  : "This person will be able to sign in again with their existing role and password."}
              </Notice>
            </div>
          </Form>
        </Modal>
      )}
      {passwordReset && admin && (
        <Modal
          title="Set a temporary password?"
          description={`${passwordReset.name} · ${label(passwordReset.role)}`}
          onClose={closePasswordReset}
        >
          <Form
            onSubmit={setTemporaryPassword}
            onCancel={closePasswordReset}
            submitLabel="Set temporary password"
          >
            <div className="op-full">
              <Notice tone="warning">
                Use this when someone cannot reset their own password by SMS.
                Confirm who is asking first. They will be signed out and must
                choose a new password at their next sign-in. Two-factor sign-in
                stays on.
              </Notice>
            </div>
            <Field label="Temporary password (at least 14 characters)">
              <input
                name="password"
                type="text"
                autoComplete="off"
                spellCheck={false}
                minLength={14}
                maxLength={256}
                required
              />
            </Field>
          </Form>
        </Modal>
      )}
      {mfaReset && admin && (
        <Modal
          title="Reset two-factor sign-in?"
          description={`${mfaReset.name} · ${label(mfaReset.role)}`}
          onClose={closeMfaReset}
        >
          <Form
            onSubmit={resetTwoFactor}
            onCancel={closeMfaReset}
            submitLabel="Reset two-factor sign-in"
          >
            <div className="op-full">
              <Notice tone="warning">
                Only do this after confirming who is asking, for example in
                person or by calling a number you already know. They will be
                signed out, their recovery codes stop working, and they set up
                two-factor sign-in again with their password.
              </Notice>
            </div>
          </Form>
        </Modal>
      )}
      {adding && admin && (
        <Modal
          title="Add a team member"
          description="Give each person their own account and the access they need."
          onClose={closeEditor}
          wide
        >
          <Form
            onSubmit={createMember}
            onCancel={closeEditor}
            submitLabel="Create account"
          >
            <Field label="Full name">
              <input
                name="name"
                required
                minLength={2}
                maxLength={160}
                autoComplete="name"
              />
            </Field>
            <Field label="Role">
              <select name="role" defaultValue="farmer">
                <option value="farmer">Farmer — personal farm workspace</option>
                <option value="operator">
                  Operator — cooperative operations
                </option>
                <option value="admin">
                  Administrator — operations and accounts
                </option>
              </select>
            </Field>
            <Field
              label="Email address"
              hint="Provide an email address, a phone number, or both."
            >
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
              />
            </Field>
            <Field
              label="Phone number"
              hint="Uganda format: +256 followed by the nine-digit number."
            >
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+2567XXXXXXXX"
                pattern="\+256[37][0-9]{8}"
              />
            </Field>
            <div className="op-full">
              <Field
                label="Initial password"
                hint="At least 14 characters. Share securely; the person must change it at first sign-in."
              >
                <input
                  name="password"
                  type="password"
                  minLength={14}
                  maxLength={200}
                  required
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <div className="op-full">
              <Notice>
                No invitation or password is sent automatically. Confirm the
                person's details before creating their account.
              </Notice>
            </div>
          </Form>
        </Modal>
      )}
    </>
  );
}
