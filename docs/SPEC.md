# KCB FBLA rebuild: the contract

This is the single source of truth for the 2026-10 rebuild. Every agent builds against it. When something here is
ambiguous, pick the option that makes the product better for a high-school FBLA member and note the choice in
your final report. Do not change another area's files except where this spec says you may.

## Product

An online testing and chapter platform for FBLA (FBL Canada / FBLC) members. Members practise official-style
multiple-choice exams per event, gain and lose Elo, study vocab, 1v1 each other in the Arena, and belong to a
chapter. Chapter presidents and executives run their chapter: members, roles, bans, invites, attendance, trainers,
classroom posts, newsletters, assignments, custom tests and flashcard decks, plus a dashboard of every member's
scores and weaknesses. Leaderboards rank players and chapters.

### Events (content/ has one JSON per slug, 100 questions + 60 vocab each)
Objective Test Events: accounting, business-law, economics, data-science-ai (*NEW), healthcare-administration,
intro-business-concepts (grades 9 and 10 only), organizational-leadership, personal-finance, securities-investments.
Case Study Events: business-management, entrepreneurship, hospitality-event-management, international-business,
marketing, sports-entertainment-management (*NEW).
`src/lib/content.ts` loads `public/content/index.json` and per-event files (built by `npm run content`).

## Look and feel (reference: https://fblc.ca/cnlc-resources)

- Palette (exact FBLC theme values):
  - `--navy: #001E60` (FBLC dark accent; header bar, headings, primary buttons)
  - `--red: #BF0D3E` (FBLC accent; calls to action, live/alert states, "you" highlights, active nav underline)
  - `--blue: #3F6FB3` (FBLC light accent; links, secondary buttons, charts)
  - `--white: #FFFFFF`, page background `#F5F7FB`, ink `#211E1E` (FBLC black), muted `#5B6478`, hairline `#DDE3EE`
  - Success `#1E8E5A`, warning `#C98A00`. Dark mode: background `#0A1230`, surface `#111C40`, ink `#EEF2FA`;
    keep red and blue, lighten blue to `#7FA3DD` for text contrast.
- Type: headings `Work Sans` (600/700/800), body `Open Sans` (400/600), loaded from Google Fonts in index.html.
  Numbers use `font-variant-numeric: tabular-nums`.
- Logo: `public/brand/fblc-logo-white.webp` (white, for the navy bar) and `public/brand/fblc-logo.webp` (white on
  transparent too; put it on navy). Always on a navy background. Next to it, the wordmark "KCB FBLA".
- Layout: a navy **top bar** across the full width: logo + wordmark left; tabs **Home, Leaderboard, Play, Vocab,
  Arena, Chapter, Me** centre/left; notification bell (unread count badge in red) and avatar menu right. The active
  tab has a 3px red underline. On phones (<768px) the tabs move to a fixed bottom bar with icons (lucide-react) and
  short labels, and the top bar keeps logo, bell and avatar.
- Feel: clean, confident, modern sports-scoreboard energy. Cards are white with a 1px hairline border, 12px
  radius and a soft shadow on hover. Generous whitespace, a clear hierarchy, no clutter. Hero areas use a navy
  band with subtle diagonal geometry echoing the logo's facets (CSS gradients/clip-path, no images needed).
  Motion: 150-250ms ease-out transitions, respect `prefers-reduced-motion`. No emoji in UI copy.
- Accessibility: WCAG AA contrast, visible focus rings (blue), every control keyboard reachable, labels on inputs.

## Stack

Vite + React 19 + TypeScript + Tailwind CSS v4 + React Router 7 + Supabase (auth, Postgres + RLS, realtime,
storage, edge functions). lucide-react for icons. Charts: hand-rolled SVG (no heavy chart lib) in
`src/components/charts/`. Keep `three` only if something still uses it; otherwise remove the dependency.

Supabase project: **kcb-fbla**, ref `uhgzeuvybyohdbfuhfil` (ca-central-1). URL `https://uhgzeuvybyohdbfuhfil.supabase.co`.
Get the publishable key with the Supabase MCP `get_publishable_keys` tool. Apply SQL with the Supabase MCP
`apply_migration` tool AND save the same SQL in `supabase/migrations/`. Only `fbla_questions` holds data (1,500
rows, keep it); every other existing `fbla_*` table is empty and may be dropped/reshaped.

## File ownership (parallel agents: only write your own files)

| Area | Files |
|---|---|
| Foundation | `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/components/ui/*`, `src/components/layout/*`, `src/components/charts/*`, `src/lib/supabase.ts`, `src/lib/auth.tsx`, `src/pages/auth/*`, `src/pages/NotFound.tsx` |
| Backend core | `supabase/migrations/0006_*.sql` .. `0009_*.sql`, `src/lib/types.ts`, `src/api/core.ts` (profiles, attempts, answers, leaderboards, elo) |
| Home | `src/pages/home/*` |
| Leaderboard | `src/pages/leaderboard/*` |
| Play | `src/pages/play/*`, `src/components/exam/*` (the shared exam runner), `src/api/play.ts` |
| Vocab | `src/pages/vocab/*`, `src/api/vocab.ts` |
| Arena | `src/pages/arena/*`, `src/api/arena.ts`, `supabase/migrations/0010_arena.sql` (if needed) |
| Chapter | `src/pages/chapter/*`, `src/api/chapter.ts`, `supabase/migrations/0011_chapter.sql` (if needed) |
| Me | `src/pages/me/*`, `src/api/me.ts` |
| Notifications + email | `src/pages/notifications/*`, `src/components/notifications/*`, `src/api/notifications.ts`, `supabase/functions/*`, `supabase/migrations/0012_email.sql` |

Shared, read-only for feature agents: `src/lib/*`, `src/api/core.ts`, `src/components/ui/*`, `src/components/layout/*`.
If a feature needs a core change, make the smallest additive change and say so in the report.

## Routes (App.tsx registers all of these; foundation creates a placeholder page for each)

```
/                      Home                 src/pages/home/HomePage.tsx
/login /signup /reset  auth                 src/pages/auth/*
/onboarding            pick username, name, school, grade, main event, avatar   src/pages/auth/Onboarding.tsx
/leaderboard           players | chapters tabs   src/pages/leaderboard/LeaderboardPage.tsx
/play                  event grid + modes    src/pages/play/PlayPage.tsx
/play/:event           event detail (areas, modes, past results)  src/pages/play/EventPage.tsx
/play/run              the exam runner (query params describe the run)  src/pages/play/RunPage.tsx
/play/review/:attemptId  results + review     src/pages/play/ReviewPage.tsx
/vocab                 decks, flashcards, match, learn   src/pages/vocab/VocabPage.tsx
/vocab/:event          src/pages/vocab/DeckPage.tsx
/arena                 lobby: challenge, incoming/outgoing, history   src/pages/arena/ArenaPage.tsx
/arena/:duelId         play a duel / results  src/pages/arena/DuelPage.tsx
/chapter               my chapter or join/create   src/pages/chapter/ChapterPage.tsx
/chapter/join/:token   invite link landing   src/pages/chapter/JoinPage.tsx
/chapter/new           register a chapter     src/pages/chapter/CreatePage.tsx
/chapter/admin         exec dashboard (members, roles, bans, attendance, trainers, analytics)  src/pages/chapter/AdminPage.tsx
/chapter/member/:userId  exec view of one member  src/pages/chapter/MemberPage.tsx
/chapter/classroom     posts, newsletters, assignments  src/pages/chapter/ClassroomPage.tsx
/chapter/tests/:testId/edit  custom test editor  src/pages/chapter/TestEditorPage.tsx
/me                    my stats (also /u/:username for anyone)  src/pages/me/ProfilePage.tsx
/u/:username           src/pages/me/ProfilePage.tsx
/me/career             past exams, sort, wrong questions, redo  src/pages/me/CareerPage.tsx
/me/settings           src/pages/me/SettingsPage.tsx
/notifications         src/pages/notifications/NotificationsPage.tsx
```
All pages except auth and the join landing require sign-in; signed-in users without a profile go to /onboarding.

## Data model (Postgres, all `public.fbla_*`, RLS on everything)

Backend core creates these (feature agents may add columns/tables in their own migration):

- `fbla_profiles` id (=auth.users.id), username unique citext 3-20 [a-z0-9_], display_name, avatar_url, school,
  grade (7-12), main_event (slug), bio, chapter_id → chapters, elo int default 0 (floor 0), peak_elo,
  questions_answered, questions_correct, time_spent_ms bigint, current_streak, best_streak (days with >=1 answer),
  best_answer_streak (consecutive correct answers), last_active_date, duel_wins, duel_losses, duel_draws,
  email_opt_in bool default true, last_seen_at, created_at. Members can update only cosmetic columns
  (display_name, avatar_url, school, grade, main_event, bio, email_opt_in, username); stats are written only by
  security-definer functions.
- `fbla_questions` (existing) id text, event, sub, diff 1-3, plus question data. Add columns `q`, `choices` jsonb,
  `answer` int, `explain` if not present so the server can grade (fill from content via the seed script).
  The client still loads question text from static JSON for speed; the server is authoritative for grading.
- `fbla_chapters` id, name, school, region, description, join_code (6 uppercase alnum, unique), invite_token
  (random, rotatable), president_id, created_at.
- `fbla_chapter_members` (chapter_id, user_id) pk, role enum `president|executive|trainer|member`, joined_at.
  A user is in at most one chapter (unique user_id). `fbla_profiles.chapter_id` mirrors it.
- `fbla_chapter_bans` chapter_id, user_id, banned_by, reason, created_at.
- `fbla_trainers` chapter_id, user_id, event, pk(chapter_id, event, user_id); at most 2 trainers per event.
- `fbla_attempts` id uuid, user_id, kind `practice|daily|endless|weak|mock|area|custom|assignment|duel|redo`,
  event, label, total, correct, duration_ms, elo_before, elo_after, custom_test_id, assignment_id, duel_id,
  created_at. This is the "career" list.
- `fbla_answers` id, attempt_id, user_id, question_id text (official id, or `custom:<testId>:<n>`), event, sub,
  diff, chosen int, correct bool, ms int, elo_delta int, created_at.
- `fbla_vocab_progress` user_id, term_id, box 0-5, due_at, correct_count, wrong_count, last_reviewed_at.
- `fbla_notifications` id, user_id, kind, title, body, link, data jsonb, read_at, created_at.
- `fbla_achievements` user_id, code, earned_at, pk(user_id, code).

Feature tables (owned by Arena / Chapter agents; names fixed so others can reference them):
- `fbla_duels` id, challenger_id, opponent_id, event, question_ids text[10], status
  `pending|accepted|declined|cancelled|expired|complete`, challenger_score, challenger_ms, opponent_score,
  opponent_ms, winner_id, created_at, accepted_at, completed_at, expires_at (24h).
- `fbla_friends` user_id, friend_id, status `pending|accepted`, created_at.
- `fbla_attendance_sessions` id, chapter_id, title, held_on date, created_by; `fbla_attendance` session_id,
  user_id, status `present|late|absent|excused`.
- `fbla_posts` id, chapter_id, author_id, kind `announcement|link|newsletter|resource`, event (nullable),
  title, body (markdown-lite), url, pinned, created_at.
- `fbla_custom_tests` id, chapter_id, author_id, event, title, description, time_limit_sec, shuffle bool,
  questions jsonb [{q, choices[4], answer, explain, sub}], source `custom|copied`, created_at, updated_at.
- `fbla_decks` id, chapter_id, author_id, event, title, cards jsonb [{term, def}], created_at.
- `fbla_assignments` id, chapter_id, kind `test|deck|official`, ref (custom test id / deck id / event slug),
  title, instructions, due_at, assigned_by, event, created_at. Completion = an attempt with that assignment_id.

### Core RPCs (security definer, `set search_path = ''`, exposed to `authenticated` only)

- `fbla_submit_attempt(p jsonb) returns jsonb`: p = {kind, event, label, custom_test_id?, assignment_id?,
  duel_id?, answers: [{question_id, chosen, ms}]}. Grades official questions against `fbla_questions`, custom
  ones against `fbla_custom_tests`. Elo applies to official questions only (kinds other than custom/duel):
  K = 24 on a user's first attempt at a question, K = 8 on repeats; question rating easy -200, medium 0, hard
  +200; expected = 1/(1+10^((q-r)/400)); elo = max(0, round(elo + K*(score-expected))). Updates profile stats,
  streaks, time spent; awards achievements; returns {attempt_id, correct, total, elo_before, elo_after,
  answers:[{question_id, correct, correct_choice, elo_delta}], achievements:[codes]}.
  Keep `src/lib/elo.ts` (client mirror for previews) in sync with this.
- `fbla_player_leaderboard(p_limit int, p_offset int, p_event text default null, p_chapter uuid default null)`
- `fbla_chapter_leaderboard(p_limit int, p_offset int)`: total elo of members, member count, avg elo, top player.
- `fbla_weak_spots(p_user uuid)`: per (event, sub) accuracy with attempt counts, worst first. Callable for self,
  or by executives/president/trainer of the same chapter for their members.
- `fbla_profile_stats(p_user uuid)`: rank, accuracy per event and per sub, questions done, streaks, best paper,
  time spent, elo history (date, elo) for charts.

### Roles and permissions
- president: everything, can transfer presidency, delete chapter.
- executive: admin access: remove, add, ban/unban members, assign trainer roles, attendance, posts, newsletters,
  assignments, tests, decks, view every member's stats/weaknesses/attendance.
- trainer: for their events: post, create/edit tests and decks, assign, view member stats.
- member: read classroom, take assignments.
Enforce in RLS/RPCs, not only in the UI.

### Notifications
Server-side triggers insert notification rows for: duel challenge received, duel accepted/declined/result,
friend request, chapter role change, removed/banned, new announcement/newsletter, new assignment, achievement
earned. The bell subscribes via Supabase realtime on `fbla_notifications`.

### Email
Edge function `weekly-digest` (Deno) sends each opted-in user a weekly overview (their week: questions, accuracy,
elo change, streak, open assignments with due dates, latest newsletter) and a "we miss you" nudge to users idle
7+ days. Uses Resend via `RESEND_API_KEY` secret; if missing, it logs and returns a dry-run JSON. Scheduled
weekly with pg_cron + pg_net (Mondays 13:00 UTC). Newsletters posted by presidents are also emailed when posted.

## Quality bar
- `npx tsc -p tsconfig.json` clean, `npm test` green, `npm run build` succeeds.
- Every page has loading skeletons, empty states with a helpful next action, and error states.
- Phone-first: everything usable at 375px wide, no horizontal scroll.
- No dead buttons. If something isn't wired, don't render it.
