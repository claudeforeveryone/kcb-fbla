# Overnight report: KCB FBLA

## What it is

A practice-test site for the KCB FBLA chapter, built from your spec in the HOSA Bayview look (square, flat, hairline rules, tabular numbers, navy sidebar), recoloured in FBLA navy `#0b2545`, cobalt and gold `#f0b323`. Light and dark themes.

- **Board:** a 3D FBLA Glass award (three.js, with a flat SVG fallback) over an Elo leaderboard that starts everyone at 0.
- **Play:** Keep going, then 1v1, then Exam prep (Practice, Weak spots, Mock exam of 100, Endless), then every event with Paper A, Paper B and Full paper.
- **Vocab:** Cards and My Words.
  - Cards has the term count, a progress panel comparing you with your rival, and a Today panel.
  - Rounds are Flip or Match, with deck filters (Today, Smart, Due, New, Misses, Everything), multi-select topic filters with counts, and round sizes of 10, 20 or 50.
- **Me:** the Candidate Record, exam level, readiness out of 100 with a range, mastery rank (Iron I to Goatatron top g III, with the whole ladder) and the 10-stat grid. Also Team Profile, Compare and Settings.
- **Content:** 15 events, each with 100 questions and 60 vocab terms, written for this site from FBLA's published competency areas. These are not official FBLA items.

## Code and database

- **Repo:** `D:\kcb-fbla`, pushed to https://github.com/idontreallyknow-20/kcb-fbla (private), branch `main`.
- **Database:** the fbla_ tables on your orbit Supabase project, migrations 0001 to 0005 plus the question catalogue seed. Nothing outside `fbla_*` was changed except one early-return guard in orbit's `seed_user_defaults()`, so FBLA sign-ups don't get orbit routines.

## Verification (all run on 2026-10-10 after the last fix)

- `npx tsc -p tsconfig.json`: clean.
- `npx vitest run`: 37 tests passed. They cover rating, mastery, readiness, vocab scheduling, pickers and stats.
- `npm run check:content`: all 15 banks OK.
- `npm run build`: built.
- `python tests/e2e/walk.py http://localhost:4173`: WALK OK with 0 console errors. CLOUD LOGIN OK passed after the round 4 fixes, but failed after the round 5 fixes because orbit had gone to status INACTIVE (paused; REST returns HTTP 540). The site fell back to on-device mode as designed.
  - The walk goes through desktop light and phone dark on this device: sign-up on the device, Practice, a paper with save, resume and submit, Match and Flip rounds, Me with the ladder, Settings, and My Words.
  - It also passed on a build served from `/kcb-fbla/`.
- **SQL tests on orbit**, each run inside a transaction that was rolled back:
  - A made-up question id is rejected.
  - A difficulty sent by the browser is overwritten from the catalogue.
  - The first-attempt flag is computed by the server.
  - The server rating matches the JS (7.7 after one easy question).
  - A member can't write their own rating.
  - Someone without an FBLA profile reads 0 rows.
- **Catalogue:** the seeded catalogue (1500 rows) matches `content/` (md5 compared).
- **Answer keys:** an audit fixed 6 wrong answer keys and tightened about 10 ambiguous questions.
- **Code review:** five rounds of cold code review. Every finding from all five rounds was fixed. Round 5 was the last allowed round, so its fixes (retry only rows the database might still take, back off failed recounts) were checked by the commands above, not by a sixth review.

## Not verified

- **No real sign-up or sign-in end to end with a fresh email.** "CLOUD LOGIN OK" means the login screen reaches orbit and the cloud backend loads, not that an account was created.
- **The 1v1 flow** has never been played between two accounts.
- **The 3D glass** was only seen as the flat fallback, because the headless browser has no GPU.
- **Some competency areas.** The official FBLA hex colours and a few competency-area names came from memory and secondary sources, not FBLA's own guidelines.

## Blocking or left for you
0. **Orbit is paused** (Supabase shows it INACTIVE as of the afternoon of 2026-10-10). I didn't pause it and didn't restore it, since it's your personal project too. Until it's restored, the site only works in on-device mode. Restore it from the Supabase dashboard; free projects pause after a week idle or when the org hits a limit.

1. **Hosting.**
   - Vercel refused the deploy: "Team exceeded fair use limits" (402).
   - GitHub Pages doesn't work for a private repo on a free plan.
   - Your options:
     - Make the repo public. The workflow in `.github/workflows/pages.yml` then deploys to `https://idontreallyknow-20.github.io/kcb-fbla/` on every push.
     - Sort out the Vercel limit. `vercel.json` is ready.
     - Run it locally with `npm run dev`.
2. **Orbit has "Confirm email" on**, so new members may never get a working confirmation link from Supabase's default mailer. Turn it off in the Supabase dashboard: Authentication, then Sign In / Providers, then Email. Until then, "Study on this device" works with no account.
3. **Your spec says three test categories but lists two** (Objective Tests and Case Study Events). What's the third?

## Questions

- Which hosting option do you want: public repo plus Pages, or Vercel?
- What is the third category, and which events are in it?
