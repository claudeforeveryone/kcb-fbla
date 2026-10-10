import { useState, type FormEvent } from "react";
import { useStore } from "../state";
import { setMode as setBackendMode } from "../lib/backend";
import { Wordmark } from "../components/Shell";

type Mode = "in" | "up" | "reset";

export default function Login() {
  const { backend, enter, error } = useStore();
  const local = backend?.kind === "local";
  const [mode, setMode] = useState<Mode>(local ? "up" : "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!backend) return;
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "in") await backend.signIn(email.trim(), password);
      else if (mode === "up") {
        if (!name.trim())
          throw new Error("Add your name so the chapter knows who you are.");
        if (!local && password.length < 8)
          throw new Error("Use at least 8 characters for the password.");
        await backend.signUp(
          email.trim(),
          password,
          name.trim().slice(0, 40),
          grade ? Number(grade) : null,
        );
      } else {
        await backend.resetPassword(email.trim());
        setMsg({ ok: true, text: "Check your email for a reset link." });
        setBusy(false);
        return;
      }
      await enter();
    } catch (err) {
      setMsg({
        ok: false,
        text:
          err instanceof Error
            ? err.message
            : "Something went wrong. Try again.",
      });
      setBusy(false);
    }
  };

  return (
    <div className="bg-field text-on-field flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <Wordmark />
        <h1 className="display mt-8 text-5xl">
          {mode === "in"
            ? "Sign in"
            : mode === "up"
              ? local
                ? "Start studying"
                : "Join the chapter"
              : "Reset password"}
        </h1>
        <p className="mt-2 text-on-field-2">
          {local
            ? "The chapter database isn't connected yet, so your progress saves on this device for now and moves to your account later."
            : "Tests, vocab and a chapter-wide leaderboard for KCB FBLA."}
        </p>
        {error && <p className="mt-3 text-on-field-2">{error}</p>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "up" && (
            <div className="grid grid-cols-[2fr_1fr] gap-3">
              <Field label="Name">
                <input
                  className="login-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={40}
                  required
                />
              </Field>
              <Field label="Grade">
                <select
                  className="login-input"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                >
                  <option value="">—</option>
                  {[9, 10, 11, 12].map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          {!local && (
            <Field label="Email">
              <input
                className="login-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </Field>
          )}
          {!local && mode !== "reset" && (
            <Field label="Password">
              <input
                className="login-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "in" ? "current-password" : "new-password"
                }
                required
                minLength={mode === "up" ? 8 : undefined}
              />
            </Field>
          )}
          <button
            className="btn btn-gold w-full min-h-12 text-lg"
            disabled={busy}
          >
            {busy
              ? "One moment…"
              : mode === "in"
                ? "Sign in"
                : mode === "up"
                  ? local
                    ? "Start"
                    : "Create account"
                  : "Send reset link"}
          </button>
          {msg && (
            <p
              role={msg.ok ? "status" : "alert"}
              className={
                msg.ok ? "text-on-field" : "text-on-field font-semibold"
              }
              style={msg.ok ? undefined : { color: "#ffb4a8" }}
            >
              {msg.text}
            </p>
          )}
        </form>
        {!local && (
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-on-field-2">
            {mode !== "in" && (
              <button
                className="underline hover:text-on-field"
                onClick={() => {
                  setMode("in");
                  setMsg(null);
                }}
              >
                I have an account
              </button>
            )}
            {mode !== "up" && (
              <button
                className="underline hover:text-on-field"
                onClick={() => {
                  setMode("up");
                  setMsg(null);
                }}
              >
                Create an account
              </button>
            )}
            {mode === "in" && (
              <button
                className="underline hover:text-on-field"
                onClick={() => {
                  setMode("reset");
                  setMsg(null);
                }}
              >
                Forgot password
              </button>
            )}
          </div>
        )}
        {!local && (
          <p className="mt-8 border-t border-on-field-2/20 pt-4 text-sm text-on-field-2">
            Can't get into an account yet?{" "}
            <button className="font-semibold text-on-field underline" onClick={() => { setBackendMode("local"); location.reload(); }}>
              Study on this device
            </button>
            . Your progress moves to your account the first time you sign in.
          </p>
        )}
      </div>
      <p className="px-4 pb-6 text-center text-xs text-on-field-2 opacity-60">
        made by J <span aria-hidden>♡</span>
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label text-on-field-2">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
