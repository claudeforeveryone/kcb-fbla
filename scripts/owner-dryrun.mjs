// Builds the owner-console dry run: BEGIN; migrations 0101-0149; supabase/tests/owner_console_impersonation.sql;
// ROLLBACK;  Paste the output into the Supabase SQL editor (or the MCP execute_sql tool) for project
// uhgzeuvybyohdbfuhfil. Nothing persists: every migration, fixture and write is rolled back.
//
//   node scripts/owner-dryrun.mjs > owner-dryrun.sql
//   node scripts/owner-dryrun.mjs --no-tests   (migrations only, still rolled back)
//   node scripts/owner-dryrun.mjs --compact    (no comment lines, indentation or blank lines, for pasting)
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');
const files = readdirSync(dir)
  .filter((f) => /^01(0[1-9]|[1-4]\d)_.*\.sql$/.test(f))
  .sort();

const parts = ['begin;'];
for (const f of files) parts.push(`-- ==== ${f}`, readFileSync(join(dir, f), 'utf8'));
if (!process.argv.includes('--no-tests')) {
  parts.push('-- ==== tests', readFileSync(join(root, 'supabase', 'tests', 'owner_console_impersonation.sql'), 'utf8'));
}
parts.push('rollback;');

let out = parts.join('\n') + '\n';
if (process.argv.includes('--compact')) {
  out =
    out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('--'))
      .join('\n') + '\n';
}
process.stdout.write(out);
