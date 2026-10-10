# KCB FBLA

Practice tests, vocab and a chapter leaderboard for KCB FBLA. Styled after the HOSA Bayview site, in FBLA navy and gold.

- **Board:** the FBLA Glass (3D crystal award, engraved with the chapter leader) over an Elo leaderboard that starts everyone at 0.
- **Play:** Keep going, Exam prep (Practice, Weak spots, Mock exam of 100, Endless), and Paper A / Paper B / Full paper for every event. 1v1 challenges.
- **Vocab:** Cards (progress vs your rival, Today, Flip and Match, deck/topic/round filters) and My Words.
- **Me:** candidate record, exam level and readiness, mastery rank (Iron I to Goatatron top g III), ten stats, Compare, Settings.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (builds public/content from content/ first)
npm test           # unit tests (rating, mastery, readiness, vocab scheduling, pickers, stats)
npm run build      # typecheck + production build in dist/
python tests/e2e/walk.py http://localhost:4173   # full click-through after `npx vite preview`
node scripts/check-all.mjs                       # validate every question bank
```

Add `?local` to any URL to use on-device mode (no account, progress stays in the browser).

## Data

- **Question banks:** `content/<event>.json`, 100 questions and 60 terms per event, written for this site from FBLA's published competency areas (each file's `notes` says where they came from). Not official FBLA items. `content/BRIEF.md` is the spec and `content/check.mjs` the validator.
- **Progress:** Supabase project "orbit", tables prefixed `fbla_` (see `supabase/migrations/`). The browser keeps event logs (answers, vocab reviews, papers, duels); the database recomputes each member's rating, peak, answered, correct and mastered with `fbla_sync_stats()`, and members can't write those columns themselves.

## Three separate numbers

1. **Rating:** Elo from your first try at each question vs its difficulty (easy −200, medium 0, hard +200, K = 32, floor 0).
2. **Mastery rank:** questions mastered (right the first time, or right twice in a row). 9 ranks × 3 tiers.
3. **Readiness:** predicted score out of 100 on your event, area by area, with a 90% range. Needs 15 first attempts in that event.

## Deploy

- Vercel: `vercel.json` handles SPA routes. Push to `main` once the project is linked.
- GitHub Pages: `.github/workflows/pages.yml` builds with `PAGES_BASE=/kcb-fbla/` and only runs while the repo is public.
