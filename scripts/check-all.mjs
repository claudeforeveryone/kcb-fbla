// Runs content/check.mjs over every event bank; exits non-zero if any fails.
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');
let bad = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  try { execFileSync(process.execPath, [join(dir, 'check.mjs'), join(dir, f)]); console.log('ok  ', f); }
  catch (e) { bad++; console.log('FAIL', f, '\n' + e.stdout); }
}
process.exit(bad ? 1 : 0);
