# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React 19 + TypeScript, Tailwind CSS v4, React Router 7, Supabase (auth + Postgres with RLS, project "orbit", tables prefixed `fbla_`). Static build, deployable to Vercel. Question banks ship as static JSON in `public/content/`.

## Users

- **Members of KCB FBLA**, high school students preparing for FBLA competitive events (objective tests and case study / role play events). Mostly on phones in short bursts; longer sessions on laptops for full 100-question papers.
- **The chapter as a whole** watches the leaderboard: friendly competition is the engine.

## Product Purpose

A chapter testing site: take FBLA-style papers by event, drill weak spots, study vocabulary with spaced repetition, and climb a chapter-wide Elo leaderboard. Success: members answer more questions, more often, and walk into competition knowing their readiness.

## Positioning

Built by members for one chapter. Three separate numbers, never mixed up:

1. **Rating** (Elo, starts at 0): competitive skill from first-attempt answers vs question difficulty. Drives the leaderboard.
2. **Mastery rank** (Iron I to Goatatron top g III): how many questions you have mastered. Grind progress.
3. **Readiness** (0-100): predicted score on your chosen event's test, with a likely range.

## Operating Context

- Question banks: 15 events x 100 practice questions + 60 vocab terms, written for the site (not official FBLA items). Competency areas follow FBLA guidelines where they could be found (see each file's `notes`).
- Objective test format: 100 questions, 50 minutes.
- Vocab uses a Leitner spaced-repetition schedule with a daily new-term target.

## Brand Commitments

- Looks like the user's HOSA Bayview site: square corners, flat, hairline rules, tabular numerals, navy sidebar on desktop, bottom bar on phones, light and dark modes.
- FBLA colours: navy and gold, with cobalt as the secondary blue. Exact official hex values could not be retrieved (fbla.org returned 403); values in DESIGN.md are close approximations. ASSUMPTION, re-check against the FBLA Brand Center.
- The FBLA Glass: a 3D crystal award at the top of the leaderboard, engraved with the chapter leader's name.
- No emoji. Small glyph accents are fine.

## Assumptions (no interview; user asked to run autonomously)

- "KCB" is the chapter's own name; used as-is.
- The brief lists two of "3 main categories" for topics (Objective Tests, Case Study Events). The third was not named; left out until the user says.
- Competition levels: District, Provincial, NLC.
- "Another user" for comparisons = your chosen rival, defaulting to the member just above you on the leaderboard.
