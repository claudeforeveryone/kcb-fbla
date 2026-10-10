# Moving KCB FBLA to Joseph's other accounts

Started 2026-10-10. Two moves: the GitHub repo to Joseph's new GitHub account, and the `fbla_*` database out of the shared "orbit" project into its own Supabase project on the other account.

## Source (read-only audit, 2026-10-10)

**GitHub:** `idontreallyknow-20/kcb-fbla`, public since 2026-10-10. Branch `main` only, 9 commits, no issues, PRs, releases, secrets, webhooks or deploy keys; only the owner as collaborator. One workflow, `.github/workflows/pages.yml`, which only runs while the repo is public; Pages itself is not enabled. No Vercel project.

**Supabase:** project "orbit" `tezmxgexbqqgvpbkixzp`, ca-central-1, shared with Joseph's personal orbit app. This is a split, not a copy: move only `fbla_*` objects and never change orbit's.

- Tables (all RLS on): `fbla_questions` (1,500 rows, the only real data, rebuildable from `supabase/seed/fbla_questions.sql`), and `fbla_answers`, `fbla_duels`, `fbla_papers`, `fbla_profiles`, `fbla_reviews`, `fbla_words` (all 0 rows at audit time).
- Functions: `fbla_answer_defaults`, `fbla_is_member`, `fbla_post_duel`, `fbla_sync_stats`. Trigger `fbla_answer_defaults` on `fbla_answers`.
- Auth: shared with orbit (1 user at audit). FBLA sign-ups carry `app: kcb-fbla` metadata so orbit's `seed_user_defaults()` skips them (migration 0002). In a project of its own, that trigger doesn't exist, so 0002 can be skipped or kept as a no-op.
- Storage, cron, realtime, edge functions: none for FBLA.
- Migrations: remote has 7 `fbla_*` entries, local has 5 files (0003 and 0005 were applied in two parts each). Compare names before replaying.

**Env:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` (publishable key; both also hardcoded as fallbacks in `src/lib/backend.ts`), `PAGES_BASE` (build only).

## Status

- 2026-10-10: database moved (steps 2, 3 and 5). New project "kcb-fbla" `uhgzeuvybyohdbfuhfil`, ca-central-1, free plan, on the shared account's org. Migrations 0001, 0003, 0004, 0005 applied as four entries (0002 skipped, orbit-only); 7 tables with RLS, 4 functions, the trigger, 21 policies; `fbla_questions` 1,500 rows. Step 4 data copy skipped on purpose: orbit held test data only, so the new project starts fresh.
- 2026-10-10: step 1 done. Repo is now `claudemaxforeveryone-hue/kcb-fbla` (old URLs redirect; `idontreallyknow-20` stays a collaborator; `D:\kcb-fbla` origin repointed). The Pages URL becomes `claudemaxforeveryone-hue.github.io/kcb-fbla/` (Pages links don't redirect).
- Still open: step 6 (clearing `fbla_*` and the 0002 guard out of orbit, only when Joseph says so).

## Steps (each ends when its check passes)

1. **New GitHub account.** Joseph gives the username. Transfer the repo (Settings > Transfer, or `gh api repos/idontreallyknow-20/kcb-fbla/transfer -f new_owner=<user>`) after Joseph confirms; the new owner accepts. Check: the repo opens under the new owner, and `git remote set-url origin` in `D:\kcb-fbla` pushes there.
2. **Target Supabase.** Joseph names the account/org and logs that session in. Create a project in ca-central-1. Check: ACTIVE_HEALTHY.
3. **Schema.** Replay `supabase/migrations/0001`-`0005` in order (check names against the remote's 7 entries), skipping orbit-only parts. Check: 7 tables, 4 functions and the trigger exist with RLS on, and policy counts match orbit's `fbla_*` policies.
4. **Data.** Run `supabase/seed/fbla_questions.sql`, and copy any rows that exist by then in the other `fbla_*` tables (plus their `auth.users` rows, with hashes, if members have signed up). Check: `fbla_questions` has 1,500 rows and the other counts match.
5. **App.** Point `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` and the fallbacks in `src/lib/backend.ts` at the new project. Check: `npx tsc -p tsconfig.json`, `npm test`, `npm run build`, then `npx vite preview` + `python tests/e2e/walk.py` pass, and sign-up, answering and the leaderboard work against the new project.
6. **Leave orbit alone.** Dropping `fbla_*` from orbit happens only when Joseph says so, and touches nothing else.

## Rules

- Ask Joseph before transferring the repo, writing to orbit, or deleting anything.
- Never print keys, passwords or connection strings; write `<REDACTED>`. The repo is public: nothing from a dump gets committed.
