import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Sprout, ArrowRight, WifiOff, BookOpen, Users } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Button, ErrorMessage, Field } from "../components/ui";
export default function Auth() {
  const {
    login,
    verifyMfa,
    requestRecovery,
    confirmRecovery,
    notify,
    demoLogin,
    demo,
    error: connectionError,
  } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [challenge, setChallenge] = useState(""),
    // Password recovery: the number a code was requested for, if any.
    [recovery, setRecovery] = useState<{
      phone: string;
      message?: string;
    } | null>(null);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy("login");
    setError("");
    try {
      const next = await login(
        String(data.get("email")),
        String(data.get("password")),
      );
      if (next) setChallenge(next.challenge);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function sendResetCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = String(new FormData(event.currentTarget).get("phone"));
    setBusy("recovery");
    setError("");
    try {
      setRecovery({ phone, message: await requestRecovery(phone) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirm")) {
      setError("The new passwords must match.");
      return;
    }
    setBusy("reset");
    setError("");
    try {
      const next = await confirmRecovery(
        recovery!.phone,
        String(data.get("code")),
        String(data.get("password")),
      );
      setRecovery(null);
      if (next) setChallenge(next.challenge);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function confirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy("code");
    setError("");
    try {
      const { recoveryCodesRemaining } = await verifyMfa(
        challenge,
        String(data.get("code")),
      );
      if (recoveryCodesRemaining !== undefined)
        notify(
          `Recovery code used. ${recoveryCodesRemaining} left. Ask another administrator to reset two-factor sign-in if your phone is lost.`,
        );
    } catch (e) {
      const failure = e as Error & { code?: string };
      if (failure.code === "MFA_CHALLENGE_EXPIRED") setChallenge("");
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }
  async function tryDemo(role: "farmer" | "operator" | "admin") {
    setBusy(role);
    setError("");
    try {
      await demoLogin(role);
      // Preserve errors here if sign-in fails; successful demos start at Home.
      navigate("/", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <div className="brand">
          <Sprout size={34} />
          Agribridge
        </div>
        <div>
          <h1>
            Better seasons.
            <br />
            Stronger communities.
          </h1>
          <p>
            Practical knowledge, fairer markets, and the right support. Built
            around the way you farm.
          </p>
          <ul>
            <li>
              <WifiOff />
              Built for days with little connection
            </li>
            <li>
              <BookOpen />
              Short lessons. Useful next steps.
            </li>
            <li>
              <Users />
              Your cooperative, working together
            </li>
          </ul>
        </div>
        <small>Rooted in Uganda. Growing together.</small>
      </section>
      <section className="auth-form">
        <Sprout size={35} className="auth-sprout" />
        <h2>Welcome to Agribridge.</h2>
        <p>Everything for your next growing season.</p>
        {(error || connectionError) && (
          <ErrorMessage message={error || connectionError} />
        )}
        {challenge && (
          <form onSubmit={confirmCode}>
            <p>
              Enter the 6-digit code from your authenticator app. If your phone
              is unavailable, use one of your recovery codes.
            </p>
            <Field label="Authentication code">
              <input
                name="code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                autoCapitalize="none"
                spellCheck={false}
                required
                minLength={6}
                maxLength={20}
                autoFocus
              />
            </Field>
            <Button type="submit" busy={busy === "code"} disabled={!!busy}>
              Verify and sign in
              <ArrowRight size={17} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!!busy}
              onClick={() => {
                setChallenge("");
                setError("");
              }}
            >
              Use a different account
            </Button>
          </form>
        )}
        {recovery && !challenge && (
          <div>
            <h3>Reset your password</h3>
            {!recovery.message ? (
              <form onSubmit={sendResetCode}>
                <p>
                  Enter the mobile number on your account. We will send a
                  6-digit code by SMS.
                </p>
                <Field label="Mobile number">
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    defaultValue={recovery.phone || "+256"}
                    pattern="\+256[37][0-9]{8}"
                    title="A Uganda number such as +2567XXXXXXXX"
                  />
                </Field>
                <Button
                  type="submit"
                  busy={busy === "recovery"}
                  disabled={!!busy}
                >
                  Send code
                  <ArrowRight size={17} />
                </Button>
              </form>
            ) : (
              <form onSubmit={resetPassword}>
                <p role="status">{recovery.message}</p>
                <Field label="Code from SMS">
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
                <Field label="New password">
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={14}
                    maxLength={256}
                    required
                  />
                </Field>
                <Field label="Confirm new password">
                  <input
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={14}
                    required
                  />
                </Field>
                <Button type="submit" busy={busy === "reset"} disabled={!!busy}>
                  Set new password
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!!busy}
                  onClick={() => setRecovery({ phone: recovery.phone })}
                >
                  Send a new code
                </Button>
              </form>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={!!busy}
              onClick={() => {
                setRecovery(null);
                setError("");
              }}
            >
              Back to sign in
            </Button>
          </div>
        )}
        {!challenge && !recovery && demo && (
          <div className="demo-entry">
            <span className="small-label">EXPLORE THE WORKING DEMO</span>
            <p>
              Try both sides of Agribridge with clearly marked sample records.
            </p>
            <Button
              busy={busy === "farmer"}
              disabled={!!busy}
              onClick={() => void tryDemo("farmer")}
            >
              Try farmer demo
              <ArrowRight size={18} />
            </Button>
            <Button
              variant="secondary"
              busy={busy === "operator"}
              disabled={!!busy}
              onClick={() => void tryDemo("operator")}
            >
              Try cooperative demo
              <Users size={18} />
            </Button>
            <div className="auth-divider">or sign in to your account</div>
          </div>
        )}
        <form onSubmit={signIn} hidden={!!challenge || !!recovery}>
          <Field label="Email or phone number">
            <input
              name="email"
              type="text"
              autoComplete="username"
              required
              placeholder="you@example.com or +256…"
            />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={12}
            />
          </Field>
          <Button
            type="submit"
            variant={demo ? "secondary" : "primary"}
            busy={busy === "login"}
            disabled={!!busy}
          >
            Sign in
            <ArrowRight size={17} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!!busy}
            onClick={() => {
              setRecovery({ phone: "" });
              setError("");
            }}
          >
            Forgot your password?
          </Button>
        </form>
        <p className="auth-note">
          New to Agribridge? Your cooperative or extension officer can help you
          get started.
        </p>
      </section>
    </div>
  );
}
