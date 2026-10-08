import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Button, ErrorMessage, Field, Notice } from "../components/ui";
import { useApp } from "../context/AppContext";
import "../styles/security.css";

/** Administrators reach the workspace only after two-factor sign-in is on. */
export default function MfaSetup() {
  const { setupMfa, enableMfa, logout } = useApp();
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [key, setKey] = useState<{ secret: string; otpauthUri: string } | null>(
      null,
    ),
    [saved, setSaved] = useState<{
      recoveryCodes: string[];
      finish: () => Promise<void>;
    } | null>(null);
  async function run(name: string, work: () => Promise<void>) {
    setBusy(name);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code"));
    void run("enable", async () => setSaved(await enableMfa(code)));
  }
  return (
    <div className="password-page">
      <div className="panel">
        <ShieldCheck size={35} />
        {saved ? (
          <>
            <h1>Save your recovery codes.</h1>
            <p>
              Each code signs you in once if your phone is lost or replaced.
              Write them down or print them, and keep them somewhere private.
              They will not be shown again.
            </p>
            <ol className="recovery-codes" aria-label="Recovery codes">
              {saved.recoveryCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ol>
            {error && <ErrorMessage message={error} />}
            <Button
              busy={busy === "finish"}
              onClick={() => void run("finish", saved.finish)}
            >
              I have saved these codes
            </Button>
          </>
        ) : (
          <>
            <h1>Protect administrator access.</h1>
            <p>
              Administrators confirm each sign-in with a code from an
              authenticator app, such as Google Authenticator, Microsoft
              Authenticator or Aegis. Install one on your phone first.
            </p>
            {error && <ErrorMessage message={error} />}
            {!key ? (
              <Button
                busy={busy === "setup"}
                onClick={() =>
                  void run("setup", async () => setKey(await setupMfa()))
                }
              >
                Set up two-factor sign-in
              </Button>
            ) : (
              <form onSubmit={confirm}>
                <p>
                  On this phone,{" "}
                  <a href={key.otpauthUri}>open the key in your app</a>. On
                  another device, add an account in the app and type this setup
                  key:
                </p>
                <code className="mfa-key" aria-label="Setup key">
                  {key.secret}
                </code>
                <Notice>
                  Keep this key private. Anyone with it can create your codes.
                </Notice>
                <Field label="6-digit code from the app">
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                  />
                </Field>
                <Button type="submit" busy={busy === "enable"}>
                  Turn on two-factor sign-in
                </Button>
              </form>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => void logout().catch((e) => setError(e.message))}
            >
              Sign out
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
