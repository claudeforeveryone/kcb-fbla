# KCB FBLA

FBLA chapter testing site. Read README.md first; PRODUCT.md holds product context and assumptions.

## How to work

- Impeccable first for any UI change. The look follows the HOSA Bayview site (`~\Documents\hosa-bayview`): square corners, flat, hairline rules, tabular numerals, navy field sidebar. FBLA navy `#0b2545`, cobalt for links, gold `#f0b323` reserved for "you" and the active item.
- Before calling work done: `npx tsc -p tsconfig.json`, `npm test`, `npm run build`, then `npx vite preview` and `python tests/e2e/walk.py`.
- After editing any `content/*.json`: `node scripts/check-all.mjs`, then `node scripts/catalogue-sql.mjs` and run `supabase/seed/fbla_questions.sql` on the kcb-fbla project (the database rejects answers to questions not in `fbla_questions`, and takes each question's event, area and difficulty from it).
- Rating, mastery and readiness are separate systems; keep them that way. The Elo rule lives in two places that must match: `src/lib/score.ts` and `fbla_sync_stats()` (latest definition in `supabase/migrations/0005_fbla_catalogue_and_membership.sql`).

## Database

- Supabase project "orbit" (`tezmxgexbqqgvpbkixzp`) is shared with the user's personal orbit app. Only touch `fbla_*` objects. Sign-ups carry `app: kcb-fbla` metadata so orbit's `seed_user_defaults()` skips them (migration 0002).
- Migrations live in `supabase/migrations/` and are applied with the Supabase MCP.

## Moving accounts
- The repo is **public** since 2026-10-10 (so cloud sessions on the shared Claude account can clone it): secrets never go in the repo.
- From 2026-10-10 the repo moves to Joseph's new GitHub account and `fbla_*` moves out of orbit into its own Supabase project. Before touching GitHub ownership, the database or the Supabase env, read `docs/MIGRATION.md`.
