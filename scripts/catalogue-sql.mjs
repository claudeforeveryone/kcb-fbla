// Writes supabase/seed/fbla_questions.sql: the question catalogue the database checks answers against
// (id, event, area, difficulty). Re-run and apply after changing any content/*.json.
// Ids run <prefix>-001 up in order, so each event ships as two strings: area index (base 36) and difficulty.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const parts = [];
let n = 0;
for (const f of readdirSync(join(root, 'content')).filter(f => f.endsWith('.json')).sort()) {
  const d = JSON.parse(readFileSync(join(root, 'content', f), 'utf8'));
  const prefix = d.questions[0].id.split('-')[0];
  d.questions.forEach((x, i) => {
    if (x.id !== `${prefix}-${String(i + 1).padStart(3, '0')}`) throw new Error(`${f}: ids must run ${prefix}-001 up`);
  });
  if (d.subs.length > 35) throw new Error(`${f}: more than 35 areas`);
  const subs = d.questions.map(x => (d.subs.indexOf(x.sub) + 1).toString(36)).join('');
  const diffs = d.questions.map(x => x.diff).join('');
  parts.push(
    `select ${q(prefix)} || '-' || lpad(i::text, 3, '0'), ${q(d.slug)}, ` +
    `(array[${d.subs.map(q).join(',')}])[position(substr(${q(subs)}, i, 1) in '0123456789abcdefghijklmnopqrstuvwxyz') - 1], substr(${q(diffs)}, i, 1)::smallint ` +
    `from generate_series(1, ${d.questions.length}) i`,
  );
  n += d.questions.length;
}
const sql = 'insert into public.fbla_questions (qid, topic, sub, diff)\n' + parts.join('\nunion all\n') +
  '\non conflict (qid) do update set topic = excluded.topic, sub = excluded.sub, diff = excluded.diff;\n';
writeFileSync(join(root, 'supabase', 'seed', 'fbla_questions.sql'), sql);
console.log(`catalogue: ${n} questions, ${sql.length} bytes`);
