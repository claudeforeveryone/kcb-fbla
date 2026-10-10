import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useStore } from "../state";
import { VocabTabs } from "./Vocab";
import { Empty, Page } from "../components/ui";

export default function Words() {
  const { words, addWord, deleteWord, d, setNote } = useStore();
  const [term, setTerm] = useState("");
  const [def, setDef] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? words.filter(
          (w) =>
            w.term.toLowerCase().includes(s) || w.def.toLowerCase().includes(s),
        )
      : words;
  }, [words, q]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!term.trim() || !def.trim()) return;
    setBusy(true);
    try {
      await addWord({ term: term.trim(), def: def.trim(), ref: null });
      setTerm("");
      setDef("");
    } catch {
      setNote("Could not save that word. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Vocab"
      sub="Words you saved from rounds, plus any you add yourself."
    >
      <VocabTabs />
      <form
        onSubmit={submit}
        className="panel grid gap-3 p-4 md:grid-cols-[1fr_2fr_auto] md:items-end"
      >
        <label className="block">
          <span className="label">Term</span>
          <input
            className="field-input mt-1"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            maxLength={120}
            required
          />
        </label>
        <label className="block">
          <span className="label">Definition</span>
          <input
            className="field-input mt-1"
            value={def}
            onChange={(e) => setDef(e.target.value)}
            maxLength={600}
            required
          />
        </label>
        <button
          className="btn btn-primary"
          disabled={busy || !term.trim() || !def.trim()}
        >
          {busy ? "Saving…" : "Add word"}
        </button>
      </form>

      {words.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link
            className="btn btn-primary"
            to="/vocab/study?mode=match&deck=everything&topics=mine&n=50"
          >
            Match my words
          </Link>
          <Link
            className="btn"
            to="/vocab/study?mode=flip&deck=everything&topics=mine&n=50"
          >
            Flip my words
          </Link>
          <input
            className="field-input ml-auto w-full sm:w-64"
            placeholder="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search my words"
          />
        </div>
      )}

      <div className="mt-6">
        {!words.length ? (
          <Empty title="No words yet">
            Add one above, or tap Save on a term you miss in a round.
          </Empty>
        ) : (
          <ul className="border-t border-rule">
            {shown.map((w) => {
              const s =
                d.srs.get(w.ref ?? "w:" + w.id) ?? d.srs.get("w:" + w.id);
              return (
                <li
                  key={w.id}
                  className="flex items-start justify-between gap-3 border-b border-rule py-3"
                >
                  <div className="min-w-0">
                    <b>{w.term}</b>
                    {s?.mastered && (
                      <span className="label ml-2 text-ok">mastered</span>
                    )}
                    <p className="text-ink-2">{w.def}</p>
                  </div>
                  <button
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink-2 hover:text-danger"
                    onClick={() => deleteWord(w.id)}
                    aria-label={`Remove ${w.term}`}
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              );
            })}
            {!shown.length && (
              <li className="py-4 text-ink-2">No words match “{q}”.</li>
            )}
          </ul>
        )}
      </div>
    </Page>
  );
}
