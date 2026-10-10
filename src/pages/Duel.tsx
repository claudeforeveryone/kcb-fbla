import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../state";
import { GROUPS } from "../lib/content";
import { Empty, Page } from "../components/ui";

export default function Duel() {
  const [sp] = useSearchParams();
  const { me, profiles, topics, backend, refresh } = useStore();
  const nav = useNavigate();
  const others = profiles.filter((p) => p.id !== me?.id);
  const [vs, setVs] = useState(sp.get("vs") ?? others[0]?.id ?? "");
  const [topic, setTopic] = useState(me?.event ?? topics[0]?.slug ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (backend?.kind === "local")
    return (
      <Page title="1v1">
        <Empty title="1v1 needs the chapter database">
          Once it's connected you can challenge anyone on the board.
        </Empty>
      </Page>
    );
  if (!others.length)
    return (
      <Page title="1v1">
        <Empty title="No one to challenge yet">
          Get another member signed up and come back.
        </Empty>
      </Page>
    );

  const go = async () => {
    if (!backend || !vs || !topic) return;
    setBusy(true);
    setErr(null);
    try {
      const seed = Math.random().toString(36).slice(2);
      const d = await backend.createDuel({
        topic,
        seed,
        size: 10,
        opponent: vs,
      });
      await refresh();
      nav(`/play/run?kind=duel&id=${d.id}`);
    } catch {
      setErr("Could not start the 1v1. Try again.");
      setBusy(false);
    }
  };

  return (
    <Page
      title="1v1"
      sub="Same 10 questions for both of you. Most right wins; faster breaks a tie."
    >
      <div className="max-w-lg space-y-4">
        <label className="block">
          <span className="label">Opponent</span>
          <select
            className="field-input mt-1"
            value={vs}
            onChange={(e) => setVs(e.target.value)}
          >
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Event</span>
          <select
            className="field-input mt-1"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            {GROUPS.map((g) => (
              <optgroup key={g.id} label={g.label}>
                {topics
                  .filter((t) => t.group === g.id)
                  .map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" onClick={go} disabled={busy}>
          {busy ? "Setting up…" : "Challenge and play my side"}
        </button>
        {err && (
          <p className="text-danger" role="alert">
            {err}
          </p>
        )}
      </div>
    </Page>
  );
}
