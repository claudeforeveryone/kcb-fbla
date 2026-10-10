# Content brief: KCB FBLA practice bank

You are writing study content for one FBLA competitive event, for a high school chapter's practice website.
These are original practice questions written for the site, not official FBLA test items. Never copy a
copyrighted test verbatim.

## Before writing

1. Look up the official FBLA 2025-26 competitive event guidelines for your event (fbla.org, "Competitive
   Events" / event guideline PDF). Find the objective-test competency areas (or, for case study / role play
   events, the performance competencies and knowledge areas). Use those areas as your `sub` values and weight
   question counts roughly like the official test would. If you cannot find them, use the standard
   high-school curriculum areas for the subject and say so in `notes`.
2. Questions must be at FBLA state/NLC level: realistic scenarios, calculations where the subject has them
   (accounting, finance, economics, securities), definitions, application, and some harder analysis.

## Output

Write ONE file: `D:\kcb-fbla\content\<slug>.json` (UTF-8, valid JSON, no comments), shaped exactly:

```json
{
  "slug": "<slug>",
  "name": "<Event Name>",
  "group": "objective" | "case",
  "notes": "where the competency areas came from (URL) and anything unusual",
  "subs": ["Competency area 1", "Competency area 2"],
  "questions": [
    {
      "id": "<prefix>-001",
      "q": "Question stem?",
      "choices": ["A text", "B text", "C text", "D text"],
      "answer": 2,
      "explain": "One or two sentences on why the answer is right (and the trap, if any).",
      "sub": "Competency area 1",
      "diff": 1
    }
  ],
  "vocab": [
    { "id": "<prefix>-v001", "term": "Term", "def": "Plain, exam-accurate definition, one sentence.", "sub": "Competency area 1" }
  ]
}
```

Rules:
- Exactly 100 questions and exactly 60 vocab terms. `id`s zero-padded, unique.
- `answer` is the 0-based index of the correct choice. Spread correct answers evenly across 0-3 (about 25 each).
- Four choices, all plausible, similar length. No "all of the above" / "none of the above". No duplicates.
- `diff`: 1 easy (about 35), 2 medium (about 40), 3 hard (about 25).
- Every `sub` value must appear in `subs`.
- Canadian chapter, but FBLA is US-based: use US law/tax/accounting conventions (GAAP, UCC, US federal
  rules) where the FBLA test does, and say "U.S." in the stem when it matters.
- Vocab terms must be the terms that actually show up on this event's test, with accurate definitions.

## Self-check (required)

After writing, run: `node "D:\kcb-fbla\content\check.mjs" "D:\kcb-fbla\content\<slug>.json"` and fix every
error it prints. Then re-read every question once more and re-solve it yourself; fix any key that is wrong
or any question with two defensible answers. Calculation questions: recompute the number.

Reply with: the slug, counts, the answer distribution, how many questions you changed in the re-solve pass,
and the source URL for the competency areas. Nothing else.
