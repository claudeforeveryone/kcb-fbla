# FBLC United (repo: kcb-fbla)

FBLA chapter testing platform. **`docs/SPEC.md` is the contract for the 2026-10 rebuild**: look and feel, routes,
file ownership, data model, RPCs and roles. It overrides anything older (README, PRODUCT.md, the old HOSA-style look).

## How to work

- Look: FBLC palette (navy `#001E60`, red `#BF0D3E`, blue `#3F6FB3`, white), Work Sans + Open Sans, top nav bar with
  the FBLC logo. Details in `docs/SPEC.md`.
- Before calling work done: `npx tsc -p tsconfig.json`, `npm test`, `npm run build`.
- After editing any `content/*.json`: `node scripts/check-all.mjs`, then `node scripts/catalogue-sql.mjs` and run
  `supabase/seed/fbla_questions.sql` on the kcb-fbla project.
- The Elo rule lives in two places that must match: `src/lib/elo.ts` and `fbla_submit_attempt()` in the migrations.

## Database

- Supabase project **kcb-fbla** (`uhgzeuvybyohdbfuhfil`), its own project. Do not touch "orbit" (`tezmxgexbqqgvpbkixzp`)
  or "hosa-bayview".
- Migrations live in `supabase/migrations/` and are applied with the Supabase MCP `apply_migration`.
- The repo is public: secrets never go in the repo (publishable keys are fine).
