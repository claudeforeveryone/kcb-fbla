import { useEffect, useState, type FormEvent } from "react";
import { useStore } from "../state";
import { GROUPS } from "../lib/content";
import { LEVELS, cloudConfigured, setMode, type Level } from "../lib/backend";
import { applyTheme, readTheme, type ThemePref } from "../components/Shell";
import { Page } from "../components/ui";

export default function Settings() {
  const { me, saveProfile, topics, profiles, signOut, backend, setNote } =
    useStore();
  const [name, setName] = useState(me?.name ?? "");
  const [grade, setGrade] = useState<string>(me?.grade ? String(me.grade) : "");
  const [event, setEvent] = useState(me?.event ?? "");
  const [level, setLevel] = useState<Level>(me?.level ?? "District");
  const [dates, setDates] = useState<Partial<Record<Level, string>>>(
    me?.comp_dates ?? {},
  );
  const [rival, setRival] = useState(me?.rival ?? "");
  const [theme, setTheme] = useState<ThemePref>(readTheme);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const target = location.hash.slice(1);
    if (target === "prep" || target === "password")
      document.getElementById(target)?.scrollIntoView();
  }, []);
  if (!me) return null;
  const ibc = topics.find((t) => t.slug === "intro-business-concepts");
  const ibcBlocked = event === ibc?.slug && grade !== "" && Number(grade) > 10;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setMsg("Your name can’t be blank.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await saveProfile({
        name: name.trim().slice(0, 40),
        grade: grade ? Number(grade) : null,
        event: event || null,
        level,
        comp_dates: dates,
        rival: rival || null,
      });
      setMsg("Saved.");
    } catch {
      setMsg("Could not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Settings">
      <form onSubmit={save} className="space-y-10">
        <section className="space-y-4" aria-labelledby="who-h">
          <h2 id="who-h" className="display text-2xl">
            Profile
          </h2>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <label className="block">
              <span className="label">Display name</span>
              <input
                className="field-input mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                required
              />
            </label>
            <label className="block">
              <span className="label">Grade</span>
              <select
                className="field-input mt-1"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              >
                <option value="">Not set</option>
                {[9, 10, 11, 12].map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="label">Rival (who you're compared with)</span>
            <select
              className="field-input mt-1"
              value={rival}
              onChange={(e) => setRival(e.target.value)}
            >
              <option value="">Whoever is just above me</option>
              {profiles
                .filter((p) => p.id !== me.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        </section>

        <section
          id="prep"
          className="space-y-4 scroll-mt-20"
          aria-labelledby="prep-h"
        >
          <h2 id="prep-h" className="display text-2xl">
            Exam prep
          </h2>
          <p className="text-ink-2">
            Your event drives readiness, weak spots and the Keep going
            suggestion.
          </p>
          <label className="block">
            <span className="label">Event</span>
            <select
              className="field-input mt-1"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
            >
              <option value="">Not chosen</option>
              {GROUPS.map((g) => (
                <optgroup key={g.id} label={g.label}>
                  {topics
                    .filter((t) => t.group === g.id)
                    .map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.name}
                        {t.gradeNote ? ` (${t.gradeNote})` : ""}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          {ibcBlocked && (
            <p className="text-sm text-danger">
              Introduction to Business Concepts is for grades 9 and 10 only.
            </p>
          )}
          <fieldset>
            <legend className="label mb-2">Competition level</legend>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((l) => (
                <button
                  type="button"
                  key={l.id}
                  className="chip"
                  aria-pressed={level === l.id}
                  onClick={() => setLevel(l.id)}
                >
                  {l.id}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            {LEVELS.map((l) => (
              <label key={l.id} className="block">
                <span className="label">{l.id} date</span>
                <input
                  type="date"
                  className="field-input mt-1"
                  value={dates[l.id] ?? ""}
                  onChange={(e) =>
                    setDates((x) => ({
                      ...x,
                      [l.id]: e.target.value || undefined,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={busy || ibcBlocked}>
            {busy ? "Saving…" : "Save"}
          </button>
          {msg && (
            <span
              role="status"
              className={msg === "Saved." ? "text-ok" : "text-danger"}
            >
              {msg}
            </span>
          )}
        </div>
      </form>

      <section className="mt-12 space-y-4" aria-labelledby="look-h">
        <h2 id="look-h" className="display text-2xl">
          Look
        </h2>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Colour mode"
        >
          {(["system", "light", "dark"] as ThemePref[]).map((t) => (
            <button
              key={t}
              className="chip capitalize"
              aria-pressed={theme === t}
              onClick={() => {
                setTheme(t);
                applyTheme(t);
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section
        className="mt-12 space-y-3 border-t border-rule pt-6"
        aria-labelledby="acct-h"
      >
        <h2 id="acct-h" className="display text-2xl">
          Account
        </h2>
        {backend?.kind === "local" ? (
          <>
            <p className="text-ink-2">
              You're in on-device mode. Your progress lives in this browser and
              moves to your account the first time you sign in to the chapter.
            </p>
            {cloudConfigured() && (
              <button className="btn" onClick={() => { setMode(null); location.assign(import.meta.env.BASE_URL); }}>
                Sign in to the chapter
              </button>
            )}
          </>
        ) : (
          <>
            <form
              id="password"
              className="flex scroll-mt-20 flex-wrap items-end gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (pw.length < 8) { setPwMsg({ ok: false, text: "Use at least 8 characters." }); return; }
                try {
                  await backend!.updatePassword(pw);
                  setPw("");
                  setPwMsg({ ok: true, text: "Password changed." });
                } catch (err) {
                  setPwMsg({ ok: false, text: err instanceof Error ? err.message : "Could not change the password." });
                }
              }}
            >
              <label className="block min-w-60 flex-1">
                <span className="label">New password</span>
                <input type="password" className="field-input mt-1" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} />
              </label>
              <button className="btn" disabled={!pw}>Change password</button>
              {pwMsg && <span role="status" className={pwMsg.ok ? "text-ok" : "text-danger"}>{pwMsg.text}</span>}
            </form>
            <button
              className="btn"
              onClick={() =>
                signOut().catch(() => setNote("Could not sign out."))
              }
            >
              Sign out
            </button>
          </>
        )}
      </section>
    </Page>
  );
}
