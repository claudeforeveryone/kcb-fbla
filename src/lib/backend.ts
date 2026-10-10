// Where study records live. Cloud: Supabase "orbit", fbla_ tables, one account per member. Local: this
// browser only, used when the chapter database isn't reachable (or its tables aren't set up yet) so the site
// still works; a member's local records are uploaded the first time they sign in to the cloud.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Answer } from "./score";
import type { Review } from "./srs";
import type { Duel, Paper } from "./stats";

export type Level = "District" | "Provincial" | "NLC";
export const LEVELS: { id: Level; short: string }[] = [
  { id: "District", short: "DIST" },
  { id: "Provincial", short: "PROV" },
  { id: "NLC", short: "NLC" },
];
export type Resume = {
  kind: string;
  topic: string | null;
  label: string;
  params: string;
  ids: string[];
  picks: (number | null)[];
  idx: number;
  elapsedMs: number;
  savedAt: string;
};
export type Profile = {
  id: string;
  name: string;
  grade: number | null;
  rival: string | null;
  event: string | null;
  level: Level;
  comp_dates: Partial<Record<Level, string>>;
  rating: number;
  peak: number;
  answered: number;
  correct: number;
  mastered: number;
  resume: Resume | null;
  created_at: string;
};
export type Word = {
  id: string;
  term: string;
  def: string;
  ref: string | null;
  at: string;
};
export type Logs = {
  answers: Answer[];
  reviews: Review[];
  papers: Paper[];
  duels: Duel[];
};

export interface Backend {
  kind: "cloud" | "local";
  userId(): Promise<string | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(
    email: string,
    password: string,
    name: string,
    grade: number | null,
  ): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  profile(id: string): Promise<Profile | null>;
  profiles(): Promise<Profile[]>;
  createProfile(
    id: string,
    name: string,
    grade: number | null,
  ): Promise<Profile>;
  updateProfile(id: string, patch: Partial<Profile>): Promise<void>;
  logs(id: string): Promise<Logs>;
  words(): Promise<Word[]>;
  addAnswers(rows: Answer[]): Promise<void>;
  addReview(row: Review): Promise<void>;
  addPaper(row: Paper): Promise<void>;
  addWord(w: Omit<Word, "id" | "at">): Promise<Word>;
  deleteWord(id: string): Promise<void>;
  createDuel(
    d: Pick<Duel, "topic" | "seed" | "size" | "opponent">,
  ): Promise<Duel>;
  postDuel(id: string, score: number, ms: number): Promise<void>;
}

const now = () => new Date().toISOString();
const uid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
const blankProfile = (
  id: string,
  name: string,
  grade: number | null,
): Profile => ({
  id,
  name,
  grade,
  rival: null,
  event: null,
  level: "District",
  comp_dates: {},
  rating: 0,
  peak: 0,
  answered: 0,
  correct: 0,
  mastered: 0,
  resume: null,
  created_at: now(),
});

// ---------- local ----------
const LKEY = "kcbfbla:v1";
type LocalDB = {
  profile: Profile | null;
  answers: Answer[];
  reviews: Review[];
  papers: Paper[];
  words: Word[];
};
const readLocal = (): LocalDB => {
  try {
    const d = JSON.parse(localStorage.getItem(LKEY) || "null");
    if (d) return d;
  } catch {
    /* fall through */
  }
  return { profile: null, answers: [], reviews: [], papers: [], words: [] };
};
const writeLocal = (d: LocalDB) => {
  try {
    localStorage.setItem(LKEY, JSON.stringify(d));
  } catch {
    /* storage full or blocked */
  }
};
export const hasLocalData = () => {
  const d = readLocal();
  return (
    d.answers.length + d.reviews.length + d.papers.length + d.words.length > 0
  );
};

export function localBackend(): Backend {
  const mut = (f: (d: LocalDB) => void) => {
    const d = readLocal();
    f(d);
    writeLocal(d);
  };
  return {
    kind: "local",
    async userId() {
      return readLocal().profile?.id ?? null;
    },
    async signIn() {
      throw new Error("Chapter sign-in is offline right now.");
    },
    async signUp(_e, _p, name, grade) {
      mut((d) => {
        d.profile = blankProfile("local-" + uid(), name, grade);
      });
    },
    async resetPassword() {
      throw new Error("Chapter sign-in is offline right now.");
    },
    async signOut() {
      /* local profile stays on this device */
    },
    async profile(id) {
      const p = readLocal().profile;
      return p && p.id === id ? p : null;
    },
    async profiles() {
      const p = readLocal().profile;
      return p ? [p] : [];
    },
    async createProfile(id, name, grade) {
      const p = blankProfile(id, name, grade);
      mut((d) => {
        d.profile = p;
      });
      return p;
    },
    async updateProfile(_id, patch) {
      mut((d) => {
        if (d.profile) d.profile = { ...d.profile, ...patch };
      });
    },
    async logs() {
      const d = readLocal();
      return {
        answers: d.answers,
        reviews: d.reviews,
        papers: d.papers,
        duels: [],
      };
    },
    async words() {
      return readLocal().words;
    },
    async addAnswers(rows) {
      mut((d) => {
        d.answers.push(...rows);
      });
    },
    async addReview(row) {
      mut((d) => {
        d.reviews.push(row);
      });
    },
    async addPaper(row) {
      mut((d) => {
        d.papers.push(row);
      });
    },
    async addWord(w) {
      const word = { ...w, id: uid(), at: now() };
      mut((d) => {
        d.words.push(word);
      });
      return word;
    },
    async deleteWord(id) {
      mut((d) => {
        d.words = d.words.filter((w) => w.id !== id);
      });
    },
    async createDuel() {
      throw new Error("1v1 needs the chapter database.");
    },
    async postDuel() {
      throw new Error("1v1 needs the chapter database.");
    },
  };
}

// ---------- cloud ----------
const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
let client: SupabaseClient | null = null;
const sb = () =>
  (client ??= createClient(URL!, KEY!, {
    auth: { persistSession: true, storageKey: "kcbfbla-auth" },
  }));

// Writes that failed (offline, flaky wifi) wait here and go up on the next try.
const PKEY = "kcbfbla:pending";
type Pending = { table: string; rows: object[] };
const readPending = (): Pending[] => {
  try {
    return JSON.parse(localStorage.getItem(PKEY) || "[]");
  } catch {
    return [];
  }
};
const writePending = (p: Pending[]) => {
  try {
    localStorage.setItem(PKEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
};

async function insert(table: string, rows: object[]) {
  if (!rows.length) return;
  const { error } = await sb().from(table).insert(rows);
  if (error) {
    writePending([...readPending(), { table, rows }]);
    throw error;
  }
}
export async function flushPending() {
  const list = readPending();
  if (!list.length) return 0;
  writePending([]);
  let sent = 0;
  for (const p of list) {
    const { error } = await sb().from(p.table).insert(p.rows);
    if (error) writePending([...readPending(), p]);
    else sent += p.rows.length;
  }
  return sent;
}

async function all<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const answerRow = (a: Answer) => ({
  qid: a.qid,
  topic: a.topic,
  sub: a.sub,
  diff: a.diff,
  correct: a.correct,
  first: a.first,
  ms: Math.round(a.ms),
  mode: a.mode,
  at: a.at,
});

export function cloudBackend(): Backend {
  const s = sb();
  return {
    kind: "cloud",
    async userId() {
      const { data } = await s.auth.getSession();
      return data.session?.user.id ?? null;
    },
    async signIn(email, password) {
      const { error } = await s.auth.signInWithPassword({ email, password });
      if (error)
        throw new Error(
          error.message === "Invalid login credentials"
            ? "That email and password do not match."
            : error.message,
        );
    },
    async signUp(email, password, name, grade) {
      const { data, error } = await s.auth.signUp({
        email,
        password,
        options: { data: { name, grade } },
      });
      if (error) throw new Error(error.message);
      if (!data.session)
        throw new Error(
          "Check your email to confirm the account, then sign in.",
        );
    },
    async resetPassword(email) {
      const { error } = await s.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + "/settings",
      });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      await s.auth.signOut();
    },
    async profile(id) {
      const { data, error } = await s
        .from("fbla_profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
    async profiles() {
      const { data, error } = await s
        .from("fbla_profiles")
        .select("*")
        .order("rating", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    async createProfile(id, name, grade) {
      const { data, error } = await s
        .from("fbla_profiles")
        .insert({ id, name, grade })
        .select("*")
        .single();
      if (error) throw error;
      return data as Profile;
    },
    async updateProfile(id, patch) {
      const { error } = await s
        .from("fbla_profiles")
        .update({ ...patch, updated_at: now() })
        .eq("id", id);
      if (error) throw error;
    },
    async logs(id) {
      const [answers, reviews, papers, duels] = await Promise.all([
        all<Answer>((f, t) =>
          s
            .from("fbla_answers")
            .select("qid,topic,sub,diff,correct,first,ms,mode,at")
            .eq("user_id", id)
            .order("at")
            .range(f, t),
        ),
        all<Review>((f, t) =>
          s
            .from("fbla_reviews")
            .select("term,correct,ms,at")
            .eq("user_id", id)
            .order("at")
            .range(f, t),
        ),
        all<Paper>((f, t) =>
          s
            .from("fbla_papers")
            .select("kind,topic,label,total,correct,ms,at")
            .eq("user_id", id)
            .order("at")
            .range(f, t),
        ),
        all<Duel>((f, t) =>
          s
            .from("fbla_duels")
            .select("*")
            .or(`challenger.eq.${id},opponent.eq.${id}`)
            .order("at", { ascending: false })
            .range(f, t),
        ),
      ]);
      return { answers, reviews, papers, duels };
    },
    async words() {
      const { data, error } = await s
        .from("fbla_words")
        .select("id,term,def,ref,at")
        .order("at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Word[];
    },
    async addAnswers(rows) {
      await insert("fbla_answers", rows.map(answerRow));
    },
    async addReview(row) {
      await insert("fbla_reviews", [
        {
          term: row.term,
          correct: row.correct,
          ms: Math.round(row.ms),
          at: row.at,
        },
      ]);
    },
    async addPaper(row) {
      await insert("fbla_papers", [{ ...row, ms: Math.round(row.ms) }]);
    },
    async addWord(w) {
      const { data, error } = await s
        .from("fbla_words")
        .insert(w)
        .select("id,term,def,ref,at")
        .single();
      if (error) throw error;
      return data as Word;
    },
    async deleteWord(id) {
      const { error } = await s.from("fbla_words").delete().eq("id", id);
      if (error) throw error;
    },
    async createDuel(d) {
      const { data, error } = await s
        .from("fbla_duels")
        .insert(d)
        .select("*")
        .single();
      if (error) throw error;
      return data as Duel;
    },
    async postDuel(id, score, ms) {
      const { error } = await s.rpc("fbla_post_duel", {
        duel: id,
        score,
        ms: Math.round(ms),
      });
      if (error) throw error;
    },
  };
}

// name and grade given at sign-up, for creating the profile row on first sign-in
export async function authUser() {
  const { data } = await sb().auth.getUser();
  if (!data.user) return null;
  const m = data.user.user_metadata ?? {};
  return {
    email: data.user.email ?? "",
    name: typeof m.name === "string" ? m.name : "",
    grade: typeof m.grade === "number" ? m.grade : null,
  };
}

// Cloud when the env is set and the fbla_ tables answer; otherwise this device.
export async function pickBackend(): Promise<Backend> {
  if (!URL || !KEY || new URLSearchParams(location.search).has("local"))
    return localBackend();
  try {
    const { error } = await Promise.race([
      sb()
        .from("fbla_profiles")
        .select("id", { head: true, count: "exact" })
        .limit(1),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("timeout")), 8000),
      ),
    ]);
    if (error) return localBackend();
    return cloudBackend();
  } catch {
    return localBackend();
  }
}

// After a first cloud sign-in, carry this device's records up so nothing studied offline is lost.
export async function uploadLocal(b: Backend, id: string) {
  const d = readLocal();
  if (!hasLocalData()) return 0;
  const mine = await b.logs(id);
  if (mine.answers.length || mine.reviews.length) return 0; // account already has history; don't merge twice
  await b.addAnswers(d.answers);
  await insert(
    "fbla_reviews",
    d.reviews.map((r) => ({
      term: r.term,
      correct: r.correct,
      ms: Math.round(r.ms),
      at: r.at,
    })),
  );
  await insert(
    "fbla_papers",
    d.papers.map((p) => ({ ...p, ms: Math.round(p.ms) })),
  );
  for (const w of d.words)
    await b.addWord({ term: w.term, def: w.def, ref: w.ref });
  localStorage.setItem(LKEY + ":uploaded", JSON.stringify(d));
  writeLocal({ ...d, answers: [], reviews: [], papers: [], words: [] });
  return d.answers.length + d.reviews.length;
}
