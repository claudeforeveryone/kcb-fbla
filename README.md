# FBLA United

Official-style practice exams, vocab, 1v1 duels and chapter tools for FBL Canada (FBLC) members.
`docs/SPEC.md` is the product and engineering contract; `docs/EMAIL.md` covers notifications and email.

- **Home:** rating, streak, daily challenge, duels and assignments waiting on you, weak spots.
- **Play:** 15 events, Quick 10, daily challenge, endless, weak spots, area drills, mock exams, chapter assignments,
  results with a per-question review, and redo runs. Elo moves with every official question.
- **Vocab:** 60 terms per event plus chapter decks; Learn (spaced repetition), Flashcards, Match, Quiz.
- **Arena:** challenge anyone to the same 10 questions on a server clock; most correct wins, time breaks ties.
- **Chapter:** join by code or link, leaderboard, roster; admins manage members, roles, bans, trainers, attendance
  and analytics; the classroom holds posts, newsletters, assignments, custom tests and decks.
- **Me:** profile, career (every past exam, wrong-question redo), settings. Notifications live in the bell.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (builds public/content from content/ first)
npm test           # unit tests
npm run build      # typecheck + production build in dist/
node scripts/check-all.mjs   # validate every question bank
```

## Data

- **Question banks:** `content/<event>.json`, 100 questions and 60 terms per event, written for this site from
  FBLA's published competency areas. Not official FBLA items.
- **Backend:** Supabase project `kcb-fbla` (`uhgzeuvybyohdbfuhfil`). All tables are `public.fbla_*` with RLS; stats,
  grading and Elo are written only by security-definer RPCs (`fbla_submit_attempt` and friends). Migrations are in
  `supabase/migrations/`, edge functions (weekly digest, newsletter, unsubscribe) in `supabase/functions/`.
- **Elo:** starts at 0 (floor 0). K = 24 on a first try at a question, 8 on repeats; questions rate easy -200,
  medium 0, hard +200. The rule lives in `src/lib/elo.ts` and `fbla_submit_attempt()` and must match.

## Deploy

Vercel: `vercel.json` handles SPA routes. The build also writes `dist/404.html` for static hosts.
