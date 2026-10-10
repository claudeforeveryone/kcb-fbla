import type { Diff } from "./score";
import type { Term } from "./srs";
import { seeded, shuffle } from "./srs";

export type Group = "objective" | "case";
export type Topic = {
  slug: string;
  name: string;
  short: string;
  group: Group;
  gradeNote?: string;
  subs: { name: string; count: number }[];
  questions: number;
  terms: number;
};
export type Question = {
  id: string;
  q: string;
  choices: string[];
  answer: number;
  explain: string;
  sub: string;
  diff: Diff;
  topic: string;
};

export const GROUPS: { id: Group; label: string; blurb: string }[] = [
  {
    id: "objective",
    label: "Objective Tests",
    blurb: "100 questions, 50 minutes at competition",
  },
  {
    id: "case",
    label: "Case Study Events",
    blurb: "The knowledge behind the case",
  },
];

const cache = new Map<string, Promise<unknown>>();
const get = <T>(path: string): Promise<T> => {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(path)
        .then((r) => {
          if (!r.ok) throw new Error(`${path}: ${r.status}`);
          return r.json();
        })
        .catch((e) => {
          cache.delete(path);
          throw e;
        }),
    );
  }
  return cache.get(path) as Promise<T>;
};

export const loadIndex = () =>
  get<{ topics: Topic[] }>("/content/index.json").then((d) => d.topics);
export const loadVocab = () => get<Term[]>("/content/vocab.json");
export const loadQuestions = (slug: string) =>
  get<Question[]>(`/content/q/${slug}.json`);
export const loadMany = async (slugs: string[]) =>
  (await Promise.all(slugs.map(loadQuestions))).flat();

// Papers are fixed so a member can retake "Paper A" and compare: the event's 100 questions in a seeded order,
// split in two halves, plus the full 100.
export type PaperId = "A" | "B" | "full";
export const PAPERS: {
  id: PaperId;
  label: string;
  size: number;
  minutes: number;
}[] = [
  { id: "A", label: "Paper A", size: 50, minutes: 25 },
  { id: "B", label: "Paper B", size: 50, minutes: 25 },
  { id: "full", label: "Full paper", size: 100, minutes: 50 },
];
export function paperIds(all: Question[], topic: string, paper: PaperId) {
  const order = shuffle(all.map((q) => q.id).sort(), seeded(topic));
  if (paper === "A") return order.slice(0, 50);
  if (paper === "B") return order.slice(50, 100);
  return order;
}
