# KCB FBLA

FBLA chapter testing site. Read README.md first; PRODUCT.md holds product context and assumptions.

## How to work
- Impeccable first for any UI change. The look follows the HOSA Bayview site (`~\Documents\hosa-bayview`): square corners, flat, hairline rules, tabular numerals, navy field sidebar. FBLA navy `#0b2545`, cobalt for links, gold `#f0b323` reserved for "you" and the active item.
- Before calling work done: `npx tsc -p tsconfig.json`, `npm test`, `npm run build`, then `npx vite preview` and `python tests/e2e/walk.py`.
- After editing any `content/*.json`: `node scripts/check-all.mjs`.
- Rating, mastery and readiness are separate systems; keep them that way. The Elo rule lives in two places that must match: `src/lib/score.ts` and `fbla_sync_stats()` in `supabase/migrations/0003_fbla_server_stats.sql`.

## Database
- Supabase project "orbit" (`tezmxgexbqqgvpbkixzp`) is shared with the user's personal orbit app. Only touch `fbla_*` objects. Sign-ups carry `app: kcb-fbla` metadata so orbit's `seed_user_defaults()` skips them (migration 0002).
- Migrations live in `supabase/migrations/` and are applied with the Supabase MCP.
