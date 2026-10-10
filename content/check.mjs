// Validates one topic content file against content/BRIEF.md. Usage: node check.mjs <file.json>
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const errs = [];
let d;
try { d = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.log('INVALID JSON:', e.message); process.exit(1); }

const need = (c, m) => { if (!c) errs.push(m); };
need(typeof d.slug === 'string' && /^[a-z0-9-]+$/.test(d.slug), 'slug missing or not kebab-case');
need(typeof d.name === 'string' && d.name, 'name missing');
need(d.group === 'objective' || d.group === 'case', 'group must be objective or case');
need(Array.isArray(d.subs) && d.subs.length, 'subs missing');
const subs = new Set(d.subs || []);
const qs = d.questions || [], vs = d.vocab || [];
need(qs.length === 100, `expected 100 questions, got ${qs.length}`);
need(vs.length === 60, `expected 60 vocab, got ${vs.length}`);

const ids = new Set(), stems = new Set(), dist = [0, 0, 0, 0], diffs = { 1: 0, 2: 0, 3: 0 };
qs.forEach((q, i) => {
  const at = `question ${i + 1} (${q.id})`;
  need(q.id && !ids.has(q.id), `${at}: id missing or duplicate`); ids.add(q.id);
  need(typeof q.q === 'string' && q.q.length > 8, `${at}: stem missing`);
  const s = (q.q || '').trim().toLowerCase();
  need(!stems.has(s), `${at}: duplicate stem`); stems.add(s);
  need(Array.isArray(q.choices) && q.choices.length === 4, `${at}: needs 4 choices`);
  const ch = (q.choices || []).map(c => String(c).trim().toLowerCase());
  need(new Set(ch).size === ch.length, `${at}: duplicate choices`);
  need(!ch.some(c => /^(all|none|both) of the above/.test(c)), `${at}: "of the above" choice`);
  need(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3, `${at}: answer must be 0-3`);
  if (Number.isInteger(q.answer)) dist[q.answer]++;
  need(typeof q.explain === 'string' && q.explain.length > 10, `${at}: explain missing`);
  need(subs.has(q.sub), `${at}: sub "${q.sub}" not in subs`);
  need([1, 2, 3].includes(q.diff), `${at}: diff must be 1-3`);
  diffs[q.diff] = (diffs[q.diff] || 0) + 1;
});
const terms = new Set();
vs.forEach((v, i) => {
  const at = `vocab ${i + 1} (${v.id})`;
  need(v.id && !ids.has(v.id), `${at}: id missing or duplicate`); ids.add(v.id);
  need(typeof v.term === 'string' && v.term, `${at}: term missing`);
  const t = (v.term || '').trim().toLowerCase();
  need(!terms.has(t), `${at}: duplicate term`); terms.add(t);
  need(typeof v.def === 'string' && v.def.length > 10, `${at}: def missing`);
  need(subs.has(v.sub), `${at}: sub "${v.sub}" not in subs`);
});
dist.forEach((n, i) => need(n >= 18 && n <= 32, `answer ${'ABCD'[i]} used ${n} times (want about 25)`));

console.log(`answers A-D: ${dist.join('/')}  diff 1/2/3: ${diffs[1]}/${diffs[2]}/${diffs[3]}`);
if (errs.length) { console.log(`${errs.length} error(s):\n- ` + errs.join('\n- ')); process.exit(1); }
console.log('OK');
