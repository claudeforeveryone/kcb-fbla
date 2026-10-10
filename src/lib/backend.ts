// Where study records live. Cloud: Supabase "orbit", fbla_ tables, one account per member. Local: this
// browser only, used when the chapter database isn't reachable or a member chooses it; a member's local records
// are uploaded the first time they sign in to the cloud.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Answer } from './score';
import type { Review } from './srs';
import type { Duel, Paper } from './stats';

export type Level = 'District' | 'Provincial' | 'NLC';
export const LEVELS: { id: Level; short: string }[] = [
  { id: 'District', short: 'DIST' }, { id: 'Provincial', short: 'PROV' }, { id: 'NLC', short: 'NLC' },
];
export type Resume = {
  kind: string; topic: string | null; label: string; params: string; ids: string[];
  picks: (number | null)[]; idx: number; elapsedMs: number; savedAt: string;
};
export type Profile = {
  id: string; name: string; grade: number | null; rival: string | null; event: string | null; level: Level;
  comp_dates: Partial<Record<Level, string>>; rating: number; peak: number; answered: number; correct: number;
  mastered: number; resume: Resume | null; created_at: string;
};
export type Stats = Pick<Profile, 'rating' | 'peak' | 'answered' | 'correct' | 'mastered'>;
// the columns a member may edit on their own profile (the database enforces the same list)
export type Editable = Partial<Pick<Profile, 'name' | 'grade' | 'rival' | 'event' | 'level' | 'comp_dates' | 'resume'>>;
export type Word = { id: string; term: string; def: string; ref: string | null; at: string };
export type Logs = { answers: Answer[]; reviews: Review[]; papers: Paper[]; duels: Duel[] };

export interface Backend {
  kind: 'cloud' | 'local';
  userId(): Promise<string | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string, grade: number | null): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  updatePassword(password: string): Promise<void>;
  profile(id: string): Promise<Profile | null>;
  profiles(): Promise<Profile[]>;
  createProfile(id: string, name: string, grade: number | null): Promise<Profile>;
  updateProfile(id: string, patch: Editable): Promise<void>;
  // leaderboard numbers: the cloud recomputes them from the answer log; local just stores what it's given
  syncStats(id: string, mine: Stats): Promise<Stats>;
  logs(id: string): Promise<Logs>;
  words(): Promise<Word[]>;
  addAnswers(rows: Answer[]): Promise<void>;
  addReview(row: Review): Promise<void>;
  addPaper(row: Paper): Promise<void>;
  addWord(w: Omit<Word, 'id' | 'at'>): Promise<Word>;
  deleteWord(id: string): Promise<void>;
  createDuel(d: Pick<Duel, 'topic' | 'seed' | 'size' | 'opponent'>): Promise<Duel>;
  postDuel(id: string, score: number, ms: number): Promise<void>;
}

const now = () => new Date().toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const blankProfile = (id: string, name: string, grade: number | null): Profile => ({
  id, name, grade, rival: null, event: null, level: 'District', comp_dates: {}, rating: 0, peak: 0,
  answered: 0, correct: 0, mastered: 0, resume: null, created_at: now(),
});
const store = {
  get<T>(k: string, fallback: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

// ---------- local ----------
const LKEY = 'kcbfbla:v1';
type LocalDB = { profile: Profile | null; answers: Answer[]; reviews: Review[]; papers: Paper[]; words: Word[] };
const EMPTY_LOCAL: LocalDB = { profile: null, answers: [], reviews: [], papers: [], words: [] };
const readLocal = (): LocalDB => ({ ...EMPTY_LOCAL, ...store.get<Partial<LocalDB>>(LKEY, {}) });
const writeLocal = (d: LocalDB) => store.set(LKEY, d);
export const hasLocalData = () => { const d = readLocal(); return d.answers.length + d.reviews.length + d.papers.length + d.words.length > 0; };

export function localBackend(): Backend {
  const mut = (f: (d: LocalDB) => void) => { const d = readLocal(); f(d); writeLocal(d); };
  return {
    kind: 'local',
    async userId() { return readLocal().profile?.id ?? null; },
    async signIn() { throw new Error('Chapter sign-in is offline right now.'); },
    async signUp(_e, _p, name, grade) { mut(d => { d.profile = blankProfile('local-' + uid(), name, grade); }); },
    async resetPassword() { throw new Error('Chapter sign-in is offline right now.'); },
    async signOut() { /* the local profile stays on this device */ },
    async updatePassword() { throw new Error('No password in on-device mode.'); },
    async profile(id) { const p = readLocal().profile; return p && p.id === id ? p : null; },
    async profiles() { const p = readLocal().profile; return p ? [p] : []; },
    async createProfile(id, name, grade) { const p = blankProfile(id, name, grade); mut(d => { d.profile = p; }); return p; },
    async updateProfile(_id, patch) { mut(d => { if (d.profile) d.profile = { ...d.profile, ...patch }; }); },
    async syncStats(_id, mine) { mut(d => { if (d.profile) d.profile = { ...d.profile, ...mine }; }); return mine; },
    async logs() { const d = readLocal(); return { answers: d.answers, reviews: d.reviews, papers: d.papers, duels: [] }; },
    async words() { return readLocal().words; },
    async addAnswers(rows) { mut(d => { d.answers.push(...rows); }); },
    async addReview(row) { mut(d => { d.reviews.push(row); }); },
    async addPaper(row) { mut(d => { d.papers.push(row); }); },
    async addWord(w) { const word = { ...w, id: uid(), at: now() }; mut(d => { d.words.push(word); }); return word; },
    async deleteWord(id) { mut(d => { d.words = d.words.filter(w => w.id !== id); }); },
    async createDuel() { throw new Error('1v1 needs the chapter database.'); },
    async postDuel() { throw new Error('1v1 needs the chapter database.'); },
  };
}

// ---------- cloud ----------
// Public values (the publishable key is meant to ship in the browser); env vars override them.
const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://tezmxgexbqqgvpbkixzp.supabase.co';
const KEY = (import.meta.env.VITE_SUPABASE_KEY as string | undefined) || 'sb_publishable_at3E9oX8IV2dNK99-wpRqw_vQctW3iB';
let client: SupabaseClient | null = null;
const sb = () => (client ??= createClient(URL, KEY, { auth: { persistSession: true, storageKey: 'kcbfbla-auth' } }));

// Writes that failed (offline, flaky wifi) wait here, tagged with the account that made them, and go up on the
// next flush for that same account only. Rows carry user_id explicitly so they can never land on someone else.
const PKEY = 'kcbfbla:pending';
type Pending = { user: string; table: string; rows: object[] };
let currentUser: string | null = null;

async function rawInsert(table: string, rows: object[]) {
  if (!rows.length) return;
  const { error } = await sb().from(table).insert(rows);
  if (error) throw error;
}
// The database looked at the rows themselves and said no: our trigger's raise (a question retired from the
// catalogue, P0001), bad data (22) or a broken constraint (23). Sending them again won't change that. Anything
// else (network, auth, permissions, capacity) might pass later, so it stays queued.
const rejected = (e: unknown) => {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === 'string' && (c === 'P0001' || /^(22|23)[0-9A-Z]{3}$/.test(c));
};
// Send what the database will take. A rejected batch is retried row by row and only the rows it refuses are
// dropped, so one bad row can't hold the rest back. Stops at the first network error: rows[0..done) are handled
// (sent or dropped), the rest are untouched and still to send.
type Sent = { done: number; sent: number; error?: unknown };
async function send(table: string, rows: object[]): Promise<Sent> {
  try { await rawInsert(table, rows); return { done: rows.length, sent: rows.length }; }
  catch (e) {
    if (!rejected(e)) return { done: 0, sent: 0, error: e };
    if (rows.length === 1) { console.warn(`dropped a ${table} row the database refused`, e); return { done: 1, sent: 0 }; }
  }
  let sent = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = await send(table, [rows[i]]);
    if (r.error) return { done: i, sent, error: r.error };
    sent += r.sent;
  }
  return { done: rows.length, sent };
}
// Write now, or queue what didn't go for later. Never both: a failure is queued and reported, not retried by the caller.
async function insert(table: string, rows: object[]) {
  if (!rows.length || !currentUser) return;
  const tagged = rows.map(r => ({ ...r, user_id: currentUser }));
  const r = await send(table, tagged);
  if (!r.error) return;
  store.set(PKEY, [...store.get<Pending[]>(PKEY, []), { user: currentUser, table, rows: tagged.slice(r.done) }]);
  throw r.error;
}
let flushing: Promise<number> | null = null;
export function flushPending(): Promise<number> {
  return (flushing ??= (async () => {
    try {
      const user = currentUser;
      if (!user) return 0;
      const mine = store.get<Pending[]>(PKEY, []).filter(p => p.user === user);
      if (!mine.length) return 0;
      const done = new Set<string>();
      const left: Pending[] = [];
      let sent = 0;
      for (const p of mine) {
        const r = await send(p.table, p.rows);
        sent += r.sent;
        if (r.error && !r.done) continue; // untouched, stays queued
        done.add(JSON.stringify(p));
        if (r.done < p.rows.length) left.push({ ...p, rows: p.rows.slice(r.done) });
      }
      // re-read: writes that failed while we were sending were queued meanwhile and must survive
      store.set(PKEY, [...store.get<Pending[]>(PKEY, []).filter(p => !done.has(JSON.stringify(p))), ...left]);
      return sent;
    } finally { flushing = null; }
  })());
}

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const answerRow = (a: Answer) => ({ qid: a.qid, topic: a.topic, sub: a.sub, diff: a.diff, correct: a.correct, first: a.first, ms: Math.round(a.ms), mode: a.mode, at: a.at });
const reviewRow = (r: Review) => ({ term: r.term, correct: r.correct, ms: Math.round(r.ms), at: r.at });
const paperRow = (p: Paper) => ({ ...p, ms: Math.round(p.ms) });

export function cloudBackend(): Backend {
  const s = sb();
  return {
    kind: 'cloud',
    async userId() {
      const { data } = await s.auth.getSession();
      currentUser = data.session?.user.id ?? null;
      return currentUser;
    },
    async signIn(email, password) {
      const { error } = await s.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'That email and password do not match.' : error.message);
    },
    async signUp(email, password, name, grade) {
      const { data, error } = await s.auth.signUp({
        email, password,
        options: { data: { name, grade, app: 'kcb-fbla' }, emailRedirectTo: location.origin + import.meta.env.BASE_URL },
      });
      if (error) throw new Error(error.message);
      if (!data.session) throw new Error('Check your email to confirm the account, then sign in.');
    },
    async resetPassword(email) {
      const { error } = await s.auth.resetPasswordForEmail(email, { redirectTo: location.origin + import.meta.env.BASE_URL + 'settings#password' });
      if (error) throw new Error(error.message);
    },
    async signOut() { await s.auth.signOut(); currentUser = null; },
    async updatePassword(password) {
      const { error } = await s.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
    async profile(id) {
      const { data, error } = await s.from('fbla_profiles').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
    async profiles() {
      const { data, error } = await s.from('fbla_profiles').select('*').order('rating', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    async createProfile(id, name, grade) {
      const { data, error } = await s.from('fbla_profiles').insert({ id, name, grade }).select('*').single();
      if (error) throw error;
      return data as Profile;
    },
    async updateProfile(id, patch) {
      const { error } = await s.from('fbla_profiles').update({ ...patch, updated_at: now() }).eq('id', id);
      if (error) throw error;
    },
    async syncStats() {
      const { data, error } = await s.rpc('fbla_sync_stats');
      if (error) throw error;
      const p = data as Profile;
      return { rating: p.rating, peak: p.peak, answered: p.answered, correct: p.correct, mastered: p.mastered };
    },
    async logs(id) {
      const [answers, reviews, papers, duels] = await Promise.all([
        all<Answer>((f, t) => s.from('fbla_answers').select('qid,topic,sub,diff,correct,first,ms,mode,at').eq('user_id', id).order('at').order('id').range(f, t)),
        all<Review>((f, t) => s.from('fbla_reviews').select('term,correct,ms,at').eq('user_id', id).order('at').range(f, t)),
        all<Paper>((f, t) => s.from('fbla_papers').select('kind,topic,label,total,correct,ms,at').eq('user_id', id).order('at').range(f, t)),
        all<Duel>((f, t) => s.from('fbla_duels').select('*').or(`challenger.eq.${id},opponent.eq.${id}`).order('at', { ascending: false }).range(f, t)),
      ]);
      return { answers, reviews, papers, duels };
    },
    async words() {
      const { data, error } = await s.from('fbla_words').select('id,term,def,ref,at').order('at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Word[];
    },
    async addAnswers(rows) { await insert('fbla_answers', rows.map(answerRow)); },
    async addReview(row) { await insert('fbla_reviews', [reviewRow(row)]); },
    async addPaper(row) { await insert('fbla_papers', [paperRow(row)]); },
    async addWord(w) {
      const { data, error } = await s.from('fbla_words').insert(w).select('id,term,def,ref,at').single();
      if (error) throw error;
      return data as Word;
    },
    async deleteWord(id) { const { error } = await s.from('fbla_words').delete().eq('id', id); if (error) throw error; },
    async createDuel(d) {
      const { data, error } = await s.from('fbla_duels').insert(d).select('*').single();
      if (error) throw error;
      return data as Duel;
    },
    async postDuel(id, score, ms) {
      const { error } = await s.rpc('fbla_post_duel', { duel: id, score, ms: Math.round(ms) });
      if (error) throw error;
    },
  };
}

// A member can choose to study on this device while chapter sign-up isn't working for them.
const MKEY = 'kcbfbla:mode';
export const cloudConfigured = () => !!URL && !!KEY;
export const readMode = () => store.get<string | null>(MKEY, null);
export function setMode(mode: 'local' | null) { if (mode) store.set(MKEY, mode); else store.del(MKEY); }

// name and grade given at sign-up, for creating the profile row on first sign-in
export async function authUser() {
  const { data } = await sb().auth.getUser();
  if (!data.user) return null;
  const m = data.user.user_metadata ?? {};
  return { email: data.user.email ?? '', name: typeof m.name === 'string' ? m.name : '', grade: typeof m.grade === 'number' ? m.grade : null };
}

// Cloud when the fbla_ tables answer; otherwise this device.
export async function pickBackend(): Promise<Backend> {
  if (new URLSearchParams(location.search).has('local') || readMode() === 'local') return localBackend();
  try {
    const { error } = await Promise.race([
      sb().from('fbla_profiles').select('id', { head: true, count: 'exact' }).limit(1),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    return error ? localBackend() : cloudBackend();
  } catch {
    return localBackend();
  }
}

// After a cloud sign-in, carry this device's records up so nothing studied offline is lost. Runs in stages and
// clears each stage locally as soon as it lands, so a failure part way never sends the same rows twice. It only
// starts for an account with no history (so a second person on a shared device doesn't absorb the first one's
// records), and once started for an account it finishes for that account.
const UKEY = 'kcbfbla:uploading';
// accounts that already had history when this device's records were offered: don't ask the database again
const SKEY = 'kcbfbla:upload-skip';
export async function uploadLocal(b: Backend, id: string) {
  if (!hasLocalData()) { store.del(UKEY); return 0; }
  if (store.get<string | null>(UKEY, null) !== id) {
    if (store.get<string[]>(SKEY, []).includes(id)) return 0;
    const mine = await b.logs(id);
    if (mine.answers.length || mine.reviews.length || mine.papers.length) {
      store.set(SKEY, [...store.get<string[]>(SKEY, []), id]);
      return 0;
    }
    store.set(UKEY, id);
  }
  currentUser = id;
  const tag = <T extends object>(rows: T[]) => rows.map(r => ({ ...r, user_id: id }));
  let moved = 0;
  // each stage clears what it handled; a network error keeps the rest (and UKEY) so the next sign-in resumes
  const stage = async <K extends 'answers' | 'reviews' | 'papers' | 'words'>(key: K, table: string, row: (x: LocalDB[K][number]) => object) => {
    const list = readLocal()[key] as LocalDB[K][number][];
    if (!list.length) return;
    const r = await send(table, tag(list.map(row)));
    const d = readLocal();
    writeLocal({ ...d, [key]: (d[key] as unknown[]).slice(r.done) });
    if (key === 'answers' || key === 'reviews') moved += r.sent;
    if (r.error) throw r.error;
  };
  await stage('answers', 'fbla_answers', answerRow);
  await stage('reviews', 'fbla_reviews', reviewRow);
  await stage('papers', 'fbla_papers', paperRow);
  await stage('words', 'fbla_words', w => ({ term: w.term, def: w.def, ref: w.ref }));
  store.del(UKEY);
  return moved;
}
