import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Sprout, ArrowRight, WifiOff, BookOpen, Users } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Button, ErrorMessage, Field } from "../components/ui";
export default function Auth() {
  const {
    login,
    verifyMfa,
    notify,
    demoLogin,
    demo,
    error: connectionError,
  } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [challenge, setChallenge] = useState("");
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
        {!challenge && demo && (
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
        <form onSubmit={signIn} hidden={!!challenge}>
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
        </form>
        <p className="auth-note">
          New to Agribridge? Your cooperative or extension officer can help you
          get started.
        </p>
      </section>
    </div>
  );
}
