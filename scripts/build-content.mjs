// Splits content/<slug>.json into what the site loads: public/content/index.json (event list, competency
// areas with question counts), public/content/vocab.json (every term) and public/content/q/<slug>.json
// (one event's questions without answer keys, loaded when a paper starts). Runs before dev and build.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "content");
const out = join(root, "public", "content");
mkdirSync(join(out, "q"), { recursive: true });

// the order the chapter lists them in
const ORDER = [
  "accounting",
  "business-law",
  "data-science-ai",
  "personal-finance",
  "securities-investments",
  "organizational-leadership",
  "intro-business-concepts",
  "healthcare-administration",
  "economics",
  "business-management",
  "marketing",
  "international-business",
  "sports-entertainment-management",
  "entrepreneurship",
  "hospitality-event-management",
];
const SHORT = {
  accounting: "ACCT",
  "business-law": "LAW",
  "data-science-ai": "DSAI",
  "personal-finance": "PFIN",
  "securities-investments": "SEC",
  "organizational-leadership": "ORGL",
  "intro-business-concepts": "IBC",
  "healthcare-administration": "HCA",
  economics: "ECON",
  "business-management": "BMGT",
  marketing: "MKT",
  "international-business": "INTB",
  "sports-entertainment-management": "SEM",
  entrepreneurship: "ENTR",
  "hospitality-event-management": "HEM",
};

const files = readdirSync(src).filter((f) => f.endsWith(".json"));
const bySlug = new Map(
  files.map((f) => {
    const d = JSON.parse(readFileSync(join(src, f), "utf8"));
    return [d.slug, d];
  }),
);
const slugs = [
  ...ORDER.filter((s) => bySlug.has(s)),
  ...[...bySlug.keys()].filter((s) => !ORDER.includes(s)),
];

const topics = [],
  vocab = [];
for (const slug of slugs) {
  const d = bySlug.get(slug);
  const counts = Object.fromEntries(d.subs.map((s) => [s, 0]));
  for (const q of d.questions) counts[q.sub]++;
  topics.push({
    slug,
    name: d.name,
    short: SHORT[slug] ?? slug.slice(0, 4).toUpperCase(),
    group: d.group,
    gradeNote:
      slug === "intro-business-concepts" ? "Grades 9-10 only" : undefined,
    subs: d.subs.map((name) => ({ name, count: counts[name] })),
    questions: d.questions.length,
    terms: d.vocab.length,
  });
  for (const v of d.vocab)
    vocab.push({ id: v.id, term: v.term, def: v.def, topic: slug, sub: v.sub });
  // Answer keys and explanations stay server-side (fbla_questions, graded by fbla_submit_attempt): shipping them
  // here would let anyone read every key before a rated run or a duel. See supabase/migrations/0014.
  // eslint-disable-next-line no-unused-vars
  const qs = d.questions.map(({ answer, explain, ...q }) => ({ ...q, topic: slug }));
  writeFileSync(join(out, "q", `${slug}.json`), JSON.stringify(qs));
}
writeFileSync(join(out, "index.json"), JSON.stringify({ topics }));
writeFileSync(join(out, "vocab.json"), JSON.stringify(vocab));
console.log(
  `content: ${topics.length} events, ${topics.reduce((s, t) => s + t.questions, 0)} questions, ${vocab.length} terms`,
);
