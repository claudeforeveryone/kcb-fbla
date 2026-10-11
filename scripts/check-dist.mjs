// Runs after `npm run build` (postbuild). Fails the build when dist/ contains the owner console's dev-only fixture
// data (src/pages/owner/fixtures.ts, FIXTURE_MARKER), which must only ever load in the dev component gallery. The
// marker is a field of every value fixtures.ts exports (fixtures.test.ts checks that), so a bundle that pulls in any
// fixture data, from any file, carries the marker with it.
//   node scripts/check-dist.mjs [dir]   (default dist)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MARKER = 'omega-owner-fixture-data';
const root = process.argv[2] ?? 'dist';

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

let all;
try {
  all = files(root);
} catch {
  console.error(`check-dist: ${root}/ not found. Run the build first.`);
  process.exit(1);
}
const hits = all.filter((f) => /\.(js|mjs|html|css|json|map)$/.test(f) && readFileSync(f, 'utf8').includes(MARKER));
if (hits.length) {
  console.error(`check-dist: dev-only owner fixtures reached the build (${MARKER}) in:\n  ${hits.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-dist: ${all.length} files, no owner fixture data`);
