// Which questions a session gets. Practice favours what you haven't mastered; Weak Spots goes after your open
// misses and your worst competency areas; Endless keeps drawing without repeats until the pool runs dry.
import type { Answer } from "./score";
import { mastery } from "./score";
import { shuffle } from "./srs";

type Q = { id: string; sub: string; topic: string };

export function practiceSet<T extends Q>(
  qs: T[],
  answers: Answer[],
  n: number,
  sub?: string,
  rand = Math.random,
): T[] {
  const m = mastery(answers);
  const seen = new Set(answers.map((a) => a.qid));
  const pool = sub ? qs.filter((q) => q.sub === sub) : qs;
  const unseen = shuffle(
    pool.filter((q) => !seen.has(q.id)),
    rand,
  );
  const shaky = shuffle(
    pool.filter((q) => seen.has(q.id) && !m.masteredIds.has(q.id)),
    rand,
  );
  const rest = shuffle(
    pool.filter((q) => m.masteredIds.has(q.id)),
    rand,
  );
  return [...unseen, ...shaky, ...rest].slice(0, n);
}

export type AreaReport = {
  topic: string;
  sub: string;
  tries: number;
  misses: number;
  rate: number;
};
export type MissReport = { qid: string; misses: number; lastWrong: boolean };

export function weakReport(answers: Answer[], topic?: string) {
  const list = topic ? answers.filter((a) => a.topic === topic) : answers;
  const areas = new Map<string, AreaReport>();
  const misses = new Map<string, MissReport>();
  for (const a of [...list].sort((x, y) => x.at.localeCompare(y.at))) {
    const k = a.topic + "|" + a.sub;
    const r = areas.get(k) ?? {
      topic: a.topic,
      sub: a.sub,
      tries: 0,
      misses: 0,
      rate: 0,
    };
    r.tries++;
    if (!a.correct) r.misses++;
    areas.set(k, r);
    const m = misses.get(a.qid) ?? { qid: a.qid, misses: 0, lastWrong: false };
    if (!a.correct) m.misses++;
    m.lastWrong = !a.correct;
    misses.set(a.qid, m);
  }
  const areaList = [...areas.values()]
    .map((r) => ({ ...r, rate: r.misses / r.tries }))
    .filter((r) => r.tries >= 3 && r.misses > 0)
    .sort((a, b) => b.rate - a.rate || b.misses - a.misses);
  const missList = [...misses.values()]
    .filter((m) => m.misses > 0)
    .sort(
      (a, b) =>
        Number(b.lastWrong) - Number(a.lastWrong) || b.misses - a.misses,
    );
  return { areas: areaList, misses: missList };
}

export function weakSet<T extends Q>(
  qs: T[],
  answers: Answer[],
  n: number,
  rand = Math.random,
): T[] {
  const byId = new Map(qs.map((q) => [q.id, q]));
  const rep = weakReport(answers.filter((a) => byId.has(a.qid)));
  const m = mastery(answers);
  const picked: T[] = [];
  const take = (q: T | undefined) => {
    if (q && !picked.includes(q) && picked.length < n) picked.push(q);
  };
  rep.misses.filter((x) => x.lastWrong).forEach((x) => take(byId.get(x.qid)));
  rep.misses
    .filter((x) => !x.lastWrong && !m.masteredIds.has(x.qid))
    .forEach((x) => take(byId.get(x.qid)));
  for (const area of rep.areas) {
    shuffle(
      qs.filter(
        (q) =>
          q.topic === area.topic &&
          q.sub === area.sub &&
          !m.masteredIds.has(q.id),
      ),
      rand,
    ).forEach(take);
  }
  return picked;
}

export function nextEndless<T extends Q>(
  qs: T[],
  answers: Answer[],
  used: Set<string>,
  rand = Math.random,
): T | null {
  const m = mastery(answers);
  const fresh = qs.filter((q) => !used.has(q.id));
  if (!fresh.length) return null;
  const unmastered = fresh.filter((q) => !m.masteredIds.has(q.id));
  const pool = unmastered.length && rand() < 0.8 ? unmastered : fresh;
  return pool[Math.floor(rand() * pool.length)];
}
