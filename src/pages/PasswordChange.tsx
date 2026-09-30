import { useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { Button, ErrorMessage, Field } from "../components/ui";
import { useApp } from "../context/AppContext";
export default function PasswordChange() {
  const { changePassword, logout } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (data.get("password") !== data.get("confirm")) {
      setError("The new passwords must match.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(
        String(data.get("current")),
        String(data.get("password")),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="password-page">
      <div className="panel">
        <LockKeyhole size={35} />
        <h1>Make this account yours.</h1>
        <p>
          Replace your initial password before opening your workspace. Use at
          least 14 characters, such as several memorable words.
        </p>
        {error && <ErrorMessage message={error} />}
        <form onSubmit={submit}>
          <Field label="Initial / current password">
            <input
              type="password"
              name="current"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="New password">
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={14}
              maxLength={256}
              required
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              name="confirm"
              autoComplete="new-password"
              minLength={14}
              required
            />
          </Field>
          <Button type="submit" busy={busy}>
            Set my password
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void logout().catch((e) => setError(e.message))}
          >
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
