import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  pickBackend,
  flushPending,
  uploadLocal,
  authUser,
  type Backend,
  type Editable,
  type Logs,
  type Profile,
  type Resume,
  type Word,
} from "./lib/backend";
import { loadIndex, loadVocab, type Question, type Topic } from "./lib/content";
import { mastery, rating, tierFor, type Answer } from "./lib/score";
import { states, type Review, type Term } from "./lib/srs";
import { summarize, type Paper } from "./lib/stats";

const EMPTY: Logs = { answers: [], reviews: [], papers: [], duels: [] };

export function derive(logs: Logs, me: string, words: Word[] = []) {
  const r = rating(logs.answers);
  const m = mastery(logs.answers);
  return {
    rating: r.rating,
    peak: r.peak,
    history: r.history,
    mastery: m,
    tier: tierFor(m.mastered),
    summary: summarize({ ...logs, me, now: new Date() }),
    srs: states(logs.reviews),
    wordIds: new Set(words.map((w) => "w:" + w.id)),
  };
}
export type Derived = ReturnType<typeof derive>;

export type Graded = { q: Question; pick: number | null; ms: number };

type Store = {
  phase: "boot" | "out" | "in";
  backend: Backend | null;
  me: Profile | null;
  logs: Logs;
  words: Word[];
  profiles: Profile[];
  topics: Topic[];
  vocab: Term[];
  d: Derived;
  note: string | null;
  error: string | null;
  setNote: (s: string | null) => void;
  enter: () => Promise<void>;
  signOut: () => Promise<void>;
  recordAnswers: (list: Graded[], mode: string) => Answer[];
  recordReview: (term: string, correct: boolean, ms: number) => void;
  recordPaper: (p: Omit<Paper, "at">) => void;
  saveProfile: (patch: Editable) => Promise<void>;
  setResume: (r: Resume | null) => void;
  addWord: (w: {
    term: string;
    def: string;
    ref: string | null;
  }) => Promise<Word>;
  deleteWord: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  loadUser: (id: string) => Promise<{ profile: Profile; logs: Logs } | null>;
  rivalOf: (p: Profile | null) => Profile | null;
  totalQuestions: number;
  topicBy: (slug: string | null | undefined) => Topic | undefined;
};

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("no store");
  return s;
};

const resumeKey = (id: string) => `kcbfbla:resume:${id}`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Store["phase"]>("boot");
  const [backend, setBackend] = useState<Backend | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<Logs>(EMPTY);
  const [words, setWords] = useState<Word[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [vocab, setVocab] = useState<Term[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userCache = useRef(new Map<string, { at: number; data: { profile: Profile; logs: Logs } }>());
  const logsRef = useRef(logs);
  logsRef.current = logs;

  const d = useMemo(
    () => derive(logs, me?.id ?? "", words),
    [logs, me?.id, words],
  );

  const enter = useCallback(async () => {
    const b = backend ?? (await pickBackend());
    setBackend(b);
    const id = await b.userId();
    if (!id) {
      setPhase("out");
      return;
    }
    let p = await b.profile(id);
    if (!p && b.kind === "cloud") {
      const u = await authUser();
      p = await b.createProfile(
        id,
        String(u?.name || u?.email?.split("@")[0] || "Member").slice(0, 40),
        u?.grade ?? null,
      );
    }
    if (!p) {
      setPhase("out");
      return;
    }
    if (b.kind === "cloud") {
      const up = await uploadLocal(b, id).catch(() => 0);
      if (up) setNote(`Moved ${up} records from this device to your account.`);
      const sent = await flushPending().catch(() => 0);
      // records that just landed change the leaderboard numbers; have the server recount before showing them
      if (up || sent) {
        const stats = await b.syncStats(id, p).catch(() => null);
        if (stats) p = { ...p, ...stats };
      }
    }
    const [l, w, ps] = await Promise.all([b.logs(id), b.words(), b.profiles()]);
    setMe(p);
    setLogs(l);
    setWords(w);
    setProfiles(ps);
    setPhase("in");
  }, [backend]);

  useEffect(() => {
    Promise.all([loadIndex(), loadVocab()])
      .then(([t, v]) => {
        setTopics(t);
        setVocab(v);
      })
      .catch(() =>
        setError(
          "Could not load the question banks. Check your connection and reload.",
        ),
      );
    enter().catch(() => {
      setError("Could not reach the chapter database.");
      setPhase("out");
    });
    const t = setInterval(() => {
      flushPending()
        .then((n) => { if (n) setFlushed((x) => x + 1); })
        .catch(() => 0);
    }, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the profile row caches the computed numbers for the leaderboard; push them a beat after activity stops
  // the profile row caches rating/peak/answered/correct/mastered for the leaderboard; the cloud recomputes them
  // from the answer log a beat after answering stops (members can't write those columns themselves)
  const syncTimer = useRef<number | undefined>(undefined);
  const syncedAt = useRef<number>(-1);
  // a failed recount tries again a little later instead of waiting for the next answer
  const [syncTry, setSyncTry] = useState(0);
  // queued answers that finally went up: recount on the server
  const [flushed, setFlushed] = useState(0);
  useEffect(() => {
    if (!flushed || !backend || !me) return;
    backend
      .syncStats(me.id, me)
      .then((stats) => {
        setMe((m) => (m ? { ...m, ...stats } : m));
        setProfiles((ps) => ps.map((x) => (x.id === me.id ? { ...x, ...stats } : x)));
      })
      .catch(() => 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushed]);
  useEffect(() => {
    if (!backend || !me || phase !== "in") return;
    const n = logs.answers.length;
    if (syncedAt.current === -1 && n === me.answered) { syncedAt.current = n; return; }
    if (n === syncedAt.current) return;
    const mine = {
      rating: Math.round(d.rating * 10) / 10,
      peak: Math.round(d.peak * 10) / 10,
      answered: d.summary.answered,
      correct: logs.answers.filter((a) => a.correct).length,
      mastered: d.mastery.mastered,
    };
    clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      syncedAt.current = n;
      backend
        .syncStats(me.id, mine)
        .then((stats) => {
          setMe((m) => (m ? { ...m, ...stats } : m));
          setProfiles((ps) => ps.map((p) => (p.id === me.id ? { ...p, ...stats } : p)));
        })
        .catch(() => {
          if (syncedAt.current !== n) return;
          syncedAt.current = -2;
          window.setTimeout(() => setSyncTry((t) => t + 1), 30000);
        });
    }, 1500);
  }, [d, backend, me, phase, logs.answers, syncTry]);

  const recordAnswers = useCallback(
    (list: Graded[], mode: string) => {
      const seen = new Set(logsRef.current.answers.map((a) => a.qid));
      const t0 = Date.now() - list.length;
      const rows: Answer[] = list
        .filter((g) => g.pick !== null)
        .map((g, i) => {
          const first = !seen.has(g.q.id);
          seen.add(g.q.id);
          return {
            qid: g.q.id,
            topic: g.q.topic,
            sub: g.q.sub,
            diff: g.q.diff,
            correct: g.pick === g.q.answer,
            first,
            ms: Math.max(0, Math.round(g.ms)),
            mode,
            at: new Date(t0 + i).toISOString(),
          };
        });
      if (!rows.length) return rows;
      setLogs((l) => ({ ...l, answers: [...l.answers, ...rows] }));
      backend
        ?.addAnswers(rows)
        .catch(() =>
          setNote(
            "Saved on this device for now. It will sync when you are back online.",
          ),
        );
      return rows;
    },
    [backend],
  );

  const recordReview = useCallback(
    (term: string, correct: boolean, ms: number) => {
      const row: Review = {
        term,
        correct,
        ms: Math.round(ms),
        at: new Date().toISOString(),
      };
      setLogs((l) => ({ ...l, reviews: [...l.reviews, row] }));
      backend?.addReview(row).catch(() => 0);
    },
    [backend],
  );

  const recordPaper = useCallback(
    (p: Omit<Paper, "at">) => {
      const row = { ...p, at: new Date().toISOString() };
      setLogs((l) => ({ ...l, papers: [...l.papers, row] }));
      backend?.addPaper(row).catch(() => 0);
    },
    [backend],
  );

  const saveProfile = useCallback(
    async (patch: Editable) => {
      if (!backend || !me) return;
      await backend.updateProfile(me.id, patch);
      setMe((m) => (m ? { ...m, ...patch } : m));
      setProfiles((ps) =>
        ps.map((p) => (p.id === me.id ? { ...p, ...patch } : p)),
      );
    },
    [backend, me],
  );

  const resumeTimer = useRef<number | undefined>(undefined);
  const setResume = useCallback(
    (r: Resume | null) => {
      try {
        if (me) {
          if (r) localStorage.setItem(resumeKey(me.id), JSON.stringify(r));
          else localStorage.removeItem(resumeKey(me.id));
        }
      } catch {
        /* ignore */
      }
      setMe((m) => (m ? { ...m, resume: r } : m));
      clearTimeout(resumeTimer.current);
      resumeTimer.current = window.setTimeout(
        () => {
          if (backend && me)
            backend.updateProfile(me.id, { resume: r }).catch(() => 0);
        },
        r ? 3000 : 0,
      );
    },
    [backend, me],
  );

  const addWord = useCallback(
    async (w: { term: string; def: string; ref: string | null }) => {
      if (!backend) throw new Error("not ready");
      const word = await backend.addWord(w);
      setWords((ws) => [word, ...ws]);
      return word;
    },
    [backend],
  );
  const deleteWord = useCallback(
    async (id: string) => {
      if (!backend) return;
      await backend.deleteWord(id);
      setWords((ws) => ws.filter((w) => w.id !== id));
    },
    [backend],
  );

  const refresh = useCallback(async () => {
    if (!backend || !me) return;
    const [l, ps] = await Promise.all([
      backend.logs(me.id),
      backend.profiles(),
    ]);
    setLogs((cur) => ({
      ...l,
      answers: l.answers.length >= cur.answers.length ? l.answers : cur.answers,
    }));
    setProfiles(ps);
  }, [backend, me]);

  const signOut = useCallback(async () => {
    await backend?.signOut();
    setMe(null);
    setLogs(EMPTY);
    setWords([]);
    setProfiles([]);
    userCache.current.clear();
    syncedAt.current = -1;
    setPhase("out");
  }, [backend]);

  const meRef = useRef(me);
  meRef.current = me;
  const loadUser = useCallback(
    async (id: string) => {
      if (!backend) return null;
      const self = meRef.current;
      if (self && id === self.id) return { profile: self, logs: logsRef.current };
      const hit = userCache.current.get(id);
      if (hit && Date.now() - hit.at < 60_000) return hit.data;
      const profile = await backend.profile(id);
      if (!profile) return null;
      const data = { profile, logs: await backend.logs(id) };
      userCache.current.set(id, { at: Date.now(), data });
      return data;
    },
    [backend],
  );

  // "Another user": your chosen rival, else the member just above you, else just below.
  const rivalOf = useCallback(
    (p: Profile | null) => {
      if (!p) return null;
      const others = profiles.filter((x) => x.id !== p.id);
      if (!others.length) return null;
      const chosen = p.rival ? others.find((x) => x.id === p.rival) : undefined;
      if (chosen) return chosen;
      const ranked = [...profiles].sort((a, b) => b.rating - a.rating);
      const i = ranked.findIndex((x) => x.id === p.id);
      return ranked[i - 1] ?? ranked[i + 1] ?? null;
    },
    [profiles],
  );

  // pick up an unfinished session saved on this device if the profile has none (or an older one)
  useEffect(() => {
    if (phase !== "in" || !me) return;
    try {
      const local = JSON.parse(
        localStorage.getItem(resumeKey(me.id)) || "null",
      ) as Resume | null;
      if (local && (!me.resume || local.savedAt > me.resume.savedAt))
        setMe((m) => (m ? { ...m, resume: local } : m));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const totalQuestions = topics.reduce((s, t) => s + t.questions, 0);
  const topicBy = useCallback(
    (slug: string | null | undefined) => topics.find((t) => t.slug === slug),
    [topics],
  );

  const value: Store = {
    phase,
    backend,
    me,
    logs,
    words,
    profiles,
    topics,
    vocab,
    d,
    note,
    error,
    setNote,
    enter,
    signOut,
    recordAnswers,
    recordReview,
    recordPaper,
    saveProfile,
    setResume,
    addWord,
    deleteWord,
    refresh,
    loadUser,
    rivalOf,
    totalQuestions,
    topicBy,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
