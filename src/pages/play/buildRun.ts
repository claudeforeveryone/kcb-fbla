// Turns a RunSpec (the /play/run query string) into the questions and settings for one run.
import { loadMany, loadQuestions, type Question } from '../../lib/content';
import { practiceSet, nextEndless } from '../../lib/pick';
import { mastery } from '../../lib/score';
import { shuffle, seeded } from '../../lib/srs';
import {
  EVENTS,
  eventInfo,
  eventName,
  eventOfQuestion,
  type AttemptKind,
  type SubmitAttemptInput,
} from '../../lib/types';
import { getAttempt, weakSpots } from '../../api/core';
import {
  OFFICIAL_ASSIGNMENT_SIZE,
  bestEndless,
  getAssignment,
  getCustomTest,
  loadPlayHistory,
  openMisses,
  todaysDaily,
  torontoDay,
  type PlayHistory,
} from '../../api/play';
import { fromContent, fromCustom, type ExamMode, type ExamQuestion } from '../../components/exam';
import {
  DAILY_SIZE,
  KIND_FOR_MODE,
  MOCK_SECONDS_PER_QUESTION,
  dailyPlan,
  mockSet,
  resolveDaily,
  runHref,
  weakMix,
  type RunSpec,
} from './runLogic';

export type RunFact = { label: string; value: string };

export type BuiltRun = {
  questions: ExamQuestion[];
  runnerMode: ExamMode;
  timeLimitSec?: number;
  submit: Omit<SubmitAttemptInput, 'answers' | 'duration_ms'>;
  title: string;
  subtitle: string;
  blurb: string;
  facts: RunFact[];
  /** Where "back" goes. */
  back: { to: string; label: string };
  /** Replay link (a fresh set of the same kind), when it makes sense. */
  again: string | null;
  /** Endless record before this run. */
  previousBest: number | null;
};

/** A run that can't start, with a helpful way out. */
export class RunBlocked extends Error {
  action: { to: string; label: string } | null;
  detail: string;
  constructor(title: string, detail: string, action: { to: string; label: string } | null = null) {
    super(title);
    this.name = 'RunBlocked';
    this.detail = detail;
    this.action = action;
  }
}

const ALL_SLUGS = EVENTS.map((e) => e.slug);

export async function questionsByIds(ids: string[]): Promise<Question[]> {
  const slugs = [...new Set(ids.map((id) => eventOfQuestion(id)?.slug).filter((s): s is NonNullable<typeof s> => !!s))];
  const all = await loadMany(slugs);
  const byId = new Map(all.map((q) => [q.id, q]));
  return ids.map((id) => byId.get(id)).filter((q): q is Question => !!q);
}

function requireEvent(spec: RunSpec, what: string) {
  const info = eventInfo(spec.event);
  if (!info)
    throw new RunBlocked(`Pick an event for ${what}`, `${what} runs on one event's question bank.`, { to: '/play', label: 'Choose an event' });
  return info;
}

const eventBack = (event: string | null) =>
  event && eventInfo(event) ? { to: `/play/${event}`, label: eventName(event) } : { to: '/play', label: 'Play' };

const fmtMin = (sec: number) => `${Math.round(sec / 60)} min`;

export async function buildRun(spec: RunSpec, profile: { main_event: string | null }): Promise<BuiltRun> {
  const history = await loadPlayHistory();
  const kind: AttemptKind = KIND_FOR_MODE[spec.mode];
  const rand = Math.random;
  const back = eventBack(spec.event);

  switch (spec.mode) {
    case 'daily': {
      const done = todaysDaily(history);
      if (done)
        throw new RunBlocked(
          "You've played today's daily",
          `You scored ${done.correct}/${done.total}. A new set unlocks at midnight Eastern.`,
          { to: `/play/review/${done.id}`, label: 'See your daily' },
        );
      const day = torontoDay();
      const plan = dailyPlan(day, ALL_SLUGS, DAILY_SIZE);
      const slugs = [...new Set(plan.map((p) => p.event))];
      const lists = await Promise.all(slugs.map((s) => loadQuestions(s)));
      const byEvent = new Map(slugs.map((s, i) => [s, lists[i]]));
      const qs = resolveDaily(plan, byEvent);
      const label = `Daily challenge ${new Date(`${day}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`;
      return {
        questions: qs.map(fromContent),
        runnerMode: 'practice',
        submit: { kind, event: null, label },
        title: 'Daily challenge',
        subtitle: `${qs.length} questions across ${slugs.length} events`,
        blurb: 'The same ten questions for every member today, easiest first. One shot per day, so make it count.',
        facts: [
          { label: 'Questions', value: String(qs.length) },
          { label: 'Feedback', value: 'After each answer' },
          { label: 'Attempts', value: 'Once today' },
        ],
        back: { to: '/play', label: 'Play' },
        again: null,
        previousBest: null,
      };
    }

    case 'mock': {
      const info = requireEvent(spec, 'A mock exam');
      const all = await loadQuestions(info.slug);
      const n = Math.min(spec.n ?? 100, all.length);
      const qs = mockSet(all, n, rand);
      const time = n * MOCK_SECONDS_PER_QUESTION;
      return {
        questions: qs.map(fromContent),
        runnerMode: 'exam',
        timeLimitSec: time,
        submit: { kind, event: info.slug, label: n >= 100 ? 'Mock exam' : `Mock exam (${n} questions)` },
        title: `${info.name} mock exam`,
        subtitle: `${n} questions / ${fmtMin(time)}`,
        blurb:
          n >= 100
            ? 'Competition conditions: 100 questions in 50 minutes, every competency area weighted like the real test. No feedback until you submit.'
            : `A shorter mock: ${n} questions in ${fmtMin(time)}, areas weighted like the real test. No feedback until you submit.`,
        facts: [
          { label: 'Questions', value: String(n) },
          { label: 'Time limit', value: fmtMin(time) },
          { label: 'Feedback', value: 'At the end' },
        ],
        back,
        again: runHref({ mode: 'mock', event: info.slug, n: n === 100 ? null : n }),
        previousBest: null,
      };
    }

    case 'area': {
      const info = requireEvent(spec, 'An area drill');
      const all = await loadQuestions(info.slug);
      const area = spec.area && all.some((q) => q.sub === spec.area) ? spec.area : null;
      if (!area)
        throw new RunBlocked('Pick a competency area', 'Area drills focus on one area of the event.', {
          to: `/play/${info.slug}`,
          label: `Open ${info.name}`,
        });
      const n = spec.n ?? 10;
      const qs = practiceSet(all, history.log, n, area, rand);
      return {
        questions: qs.map(fromContent),
        runnerMode: 'practice',
        submit: { kind, event: info.slug, label: `Area drill: ${area}` },
        title: area,
        subtitle: `${info.name} / area drill`,
        blurb: 'Questions you have not mastered in this area come first. Read each explanation before moving on.',
        facts: [
          { label: 'Questions', value: String(qs.length) },
          { label: 'Area', value: area },
          { label: 'Feedback', value: 'After each answer' },
        ],
        back,
        again: runHref({ mode: 'area', event: info.slug, area, n: spec.n }),
        previousBest: null,
      };
    }

    case 'endless': {
      const info = eventInfo(spec.event);
      const all = info ? await loadQuestions(info.slug) : await loadMany(ALL_SLUGS);
      // Draw the whole pool in the order nextEndless would, favouring what you haven't mastered.
      const used = new Set<string>();
      const order: Question[] = [];
      for (let q = nextEndless(all, history.log, used, rand); q; q = nextEndless(all, history.log, used, rand)) {
        used.add(q.id);
        order.push(q);
      }
      const best = bestEndless(history, info?.slug ?? null);
      return {
        questions: order.map(fromContent),
        runnerMode: 'endless',
        submit: { kind, event: info?.slug ?? null, label: 'Endless' },
        title: info ? `${info.name}: Endless` : 'Endless: all events',
        subtitle: best ? `Your best run: ${best.correct}` : 'Three lives. How far can you go?',
        blurb: 'Questions keep coming until your third wrong answer. Every right answer extends your run.',
        facts: [
          { label: 'Lives', value: '3' },
          { label: 'Pool', value: `${order.length} questions` },
          { label: 'Best run', value: best ? String(best.correct) : 'None yet' },
        ],
        back,
        again: runHref({ mode: 'endless', event: info?.slug }),
        previousBest: best?.correct ?? 0,
      };
    }

    case 'weak': {
      const info = eventInfo(spec.event);
      const [spots, pool] = await Promise.all([
        weakSpots().catch(() => []),
        info ? loadQuestions(info.slug) : loadMany(eventsPlayed(history)),
      ]);
      const n = spec.n ?? 15;
      const m = mastery(history.log);
      const qs = weakMix(pool, {
        misses: openMisses(history, info?.slug ?? null),
        spots: spots.filter((s) => !info || s.event === info.slug),
        mastered: m.masteredIds,
        seen: history.seen,
        n,
        rand,
      });
      if (!qs.length)
        throw new RunBlocked(
          history.log.length ? 'No weak spots right now' : 'Nothing to target yet',
          history.log.length
            ? 'You have no open misses and no shaky areas here. Try a mock exam to find new ones.'
            : 'Answer a few practice sets first. Weak spots uses your misses and your lowest-scoring areas.',
          info ? { to: runHref({ mode: 'quick', event: info.slug }), label: 'Play Quick 10' } : { to: runHref({ mode: 'quick' }), label: 'Play Quick 10' },
        );
      return {
        questions: qs.map(fromContent),
        runnerMode: 'practice',
        submit: { kind, event: info?.slug ?? null, label: 'Weak spots' },
        title: info ? `${info.name}: weak spots` : 'Weak spots',
        subtitle: `${qs.length} questions from your misses and lowest areas`,
        blurb: 'Built from questions you got wrong last time and the competency areas where your accuracy is lowest.',
        facts: [
          { label: 'Questions', value: String(qs.length) },
          { label: 'Source', value: 'Misses + weak areas' },
          { label: 'Feedback', value: 'After each answer' },
        ],
        back,
        again: runHref({ mode: 'weak', event: info?.slug }),
        previousBest: null,
      };
    }

    case 'redo':
      return buildRedo(spec, history);

    case 'custom': {
      const test = spec.test ? await getCustomTest(spec.test) : null;
      if (!test)
        throw new RunBlocked('Test not found', 'It may have been deleted, or you are not in its chapter.', {
          to: '/chapter/classroom',
          label: 'Open classroom',
        });
      return customRun(test, kind, null);
    }

    case 'assignment': {
      const a = spec.assignment ? await getAssignment(spec.assignment) : null;
      if (!a)
        throw new RunBlocked('Assignment not found', 'It may have been removed by your chapter.', {
          to: '/play#assigned',
          label: 'See assignments',
        });
      if (a.kind === 'deck')
        throw new RunBlocked('This is a flashcard deck', 'Study it in the classroom: finishing it there marks the assignment done.', { to: `/chapter/classroom?assignment=${encodeURIComponent(a.id)}`, label: 'Open in classroom' });
      if (a.kind === 'test') {
        const test = await getCustomTest(a.ref);
        if (!test)
          throw new RunBlocked('Test not found', 'The test for this assignment was deleted.', {
            to: '/chapter/classroom',
            label: 'Open classroom',
          });
        return customRun(test, 'assignment', a);
      }
      const info = eventInfo(a.ref) ?? eventInfo(a.event);
      if (!info) throw new RunBlocked('Unknown event', 'This assignment points at an event that no longer exists.');
      const all = await loadQuestions(info.slug);
      const qs = practiceSet(all, history.log, OFFICIAL_ASSIGNMENT_SIZE, undefined, rand);
      return {
        questions: qs.map(fromContent),
        runnerMode: 'exam',
        submit: { kind: 'assignment', event: info.slug, label: a.title, assignment_id: a.id },
        title: a.title,
        subtitle: `${info.name} / chapter assignment`,
        blurb: a.instructions || `${qs.length} official ${info.name} questions. Your score goes to your chapter.`,
        facts: [
          { label: 'Questions', value: String(qs.length) },
          { label: 'Due', value: a.due_at ? new Date(a.due_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'No due date' },
          { label: 'Feedback', value: 'At the end' },
        ],
        back: { to: '/play#assigned', label: 'Assignments' },
        again: null,
        previousBest: null,
      };
    }

    case 'quick':
    case 'practice':
    default: {
      const info = eventInfo(spec.event) ?? (spec.event ? null : eventInfo(profile.main_event));
      const all = info ? await loadQuestions(info.slug) : await loadMany(ALL_SLUGS);
      const n = spec.n ?? 10;
      const qs = practiceSet(all, history.log, n, undefined, rand);
      const quick = n === 10;
      return {
        questions: qs.map(fromContent),
        runnerMode: 'practice',
        submit: { kind: 'practice', event: info?.slug ?? null, label: quick ? 'Quick 10' : `Practice ${n}` },
        title: quick ? `Quick 10${info ? `: ${info.name}` : ''}` : `Practice${info ? `: ${info.name}` : ''}`,
        subtitle: info ? `${n} questions, new ones first` : `${n} questions from every event`,
        blurb: 'A short set that puts questions you have never seen first, then the ones you have not mastered.',
        facts: [
          { label: 'Questions', value: String(qs.length) },
          { label: 'Event', value: info?.short ?? 'Mixed' },
          { label: 'Feedback', value: 'After each answer' },
        ],
        back: eventBack(info?.slug ?? null),
        again: runHref({ mode: spec.mode === 'practice' ? 'practice' : 'quick', event: info?.slug ?? spec.event, n: spec.n }),
        previousBest: null,
      };
    }
  }
}

/** Events the member has answered in (for mixed weak spots); every event if none yet. */
function eventsPlayed(h: PlayHistory) {
  const s = new Set(h.log.map((a) => a.topic).filter((t) => eventInfo(t)));
  return s.size ? [...s] : ALL_SLUGS;
}

function customRun(
  test: NonNullable<Awaited<ReturnType<typeof getCustomTest>>>,
  kind: AttemptKind,
  assignment: { id: string; title: string; instructions: string | null; due_at: string | null } | null,
): BuiltRun {
  const qs = test.questions.map((q, i) => fromCustom(test.id, i, q, test.event));
  if (!qs.length) throw new RunBlocked('This test has no questions yet', 'Ask the author to add some.', { to: '/chapter/classroom', label: 'Open classroom' });
  const ordered = test.shuffle ? shuffle(qs, seeded(`${test.id}:${Date.now()}`)) : qs;
  const time = test.time_limit_sec ?? undefined;
  return {
    questions: ordered,
    runnerMode: 'exam',
    timeLimitSec: time,
    submit: {
      kind,
      event: test.event,
      label: assignment?.title ?? test.title,
      custom_test_id: test.id,
      assignment_id: assignment?.id ?? null,
    },
    title: assignment?.title ?? test.title,
    subtitle: `${test.event ? `${eventName(test.event)} / ` : ''}chapter ${assignment ? 'assignment' : 'test'}`,
    blurb: assignment?.instructions || test.description || 'A test written by your chapter. Your result is shared with your chapter leaders.',
    facts: [
      { label: 'Questions', value: String(qs.length) },
      { label: 'Time limit', value: time ? fmtMin(time) : 'Untimed' },
      assignment?.due_at
        ? { label: 'Due', value: new Date(assignment.due_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }
        : { label: 'Elo', value: 'Not affected' },
    ],
    back: assignment ? { to: '/play#assigned', label: 'Assignments' } : { to: '/chapter/classroom', label: 'Classroom' },
    again: null,
    previousBest: null,
  };
}

async function buildRedo(spec: RunSpec, history: PlayHistory): Promise<BuiltRun> {
  const n = spec.n ?? 20;
  if (!spec.redo && spec.ids.length) {
    const qs = await questionsByIds(spec.ids.filter((id) => !id.startsWith('custom:')));
    if (!qs.length)
      throw new RunBlocked('Nothing to redo', 'Those questions could not be found.', { to: '/me/career?tab=wrong', label: 'Wrong questions' });
    const label = spec.label || (qs.length === 1 ? 'Redo a question' : 'Redo wrong questions');
    const events = [...new Set(qs.map((q) => q.topic))];
    return {
      questions: shuffle(qs).map(fromContent),
      runnerMode: 'practice',
      submit: { kind: 'redo', event: events.length === 1 ? events[0] : null, label: label.slice(0, 160) },
      title: label,
      subtitle: `${qs.length} ${qs.length === 1 ? 'question' : 'questions'} from your wrong-answer list`,
      blurb: 'Questions you got wrong last time, with instant feedback. Get one right to clear it from the list.',
      facts: [
        { label: 'Questions', value: String(qs.length) },
        { label: 'Elo', value: 'Unchanged (repeats)' },
        { label: 'Feedback', value: 'After each answer' },
      ],
      back: { to: '/me/career?tab=wrong', label: 'Wrong questions' },
      again: null,
      previousBest: null,
    };
  }
  if (spec.redo === 'wrong') {
    const info = eventInfo(spec.event);
    const ids = openMisses(history, info?.slug ?? null).slice(0, n);
    if (!ids.length)
      throw new RunBlocked('No missed questions', 'Every question you have missed has since been answered right. Nice.', {
        to: info ? `/play/${info.slug}` : '/play',
        label: 'Back to practice',
      });
    const qs = await questionsByIds(ids);
    return {
      questions: shuffle(qs).map(fromContent),
      runnerMode: 'practice',
      submit: { kind: 'redo', event: info?.slug ?? null, label: 'Redo missed' },
      title: info ? `${info.name}: redo missed` : 'Redo missed questions',
      subtitle: `${qs.length} questions you got wrong last time`,
      blurb: 'Every question whose latest answer was wrong, newest first. Get it right to clear it from the list.',
      facts: [
        { label: 'Questions', value: String(qs.length) },
        { label: 'Elo', value: 'Unchanged (repeats)' },
        { label: 'Feedback', value: 'After each answer' },
      ],
      back: eventBack(info?.slug ?? null),
      again: runHref({ redo: 'wrong', event: info?.slug }),
      previousBest: null,
    };
  }

  const stored = spec.redo ? await getAttempt(spec.redo) : null;
  if (!stored)
    throw new RunBlocked('Attempt not found', 'It may belong to someone else or have been removed.', { to: '/me/career', label: 'Open career' });
  const { attempt, answers } = stored;
  const picked = spec.onlyWrong ? answers.filter((a) => !a.correct) : answers;
  const ids = [...new Set(picked.map((a) => a.question_id))];
  if (!ids.length)
    throw new RunBlocked('Nothing to redo', 'You got every question in that attempt right.', { to: `/play/review/${attempt.id}`, label: 'See the attempt' });

  const customIds = ids.filter((id) => id.startsWith('custom:'));
  let questions: ExamQuestion[] = [];
  let customTestId: string | null = null;
  if (customIds.length) {
    customTestId = attempt.custom_test_id ?? customIds[0].split(':')[1];
    const test = await getCustomTest(customTestId);
    if (!test)
      throw new RunBlocked('Test not found', 'The chapter test for this attempt was deleted.', { to: '/me/career', label: 'Open career' });
    questions = customIds
      .map((id) => Number(id.split(':')[2]))
      .filter((i) => test.questions[i])
      .map((i) => fromCustom(test.id, i, test.questions[i], test.event));
  }
  const official = await questionsByIds(ids.filter((id) => !id.startsWith('custom:')));
  questions = [...questions, ...official.map(fromContent)];
  const isCustom = customIds.length > 0;
  const name = attempt.label || eventName(attempt.event);
  return {
    questions: shuffle(questions),
    runnerMode: 'practice',
    submit: {
      kind: isCustom ? 'custom' : 'redo',
      event: attempt.event,
      label: `Redo: ${name}`.slice(0, 160),
      custom_test_id: isCustom ? customTestId : null,
    },
    title: `Redo: ${name}`,
    subtitle: `${questions.length} ${spec.onlyWrong ? 'missed ' : ''}questions from ${new Date(attempt.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    blurb: spec.onlyWrong
      ? 'Just the questions you missed in that attempt, with instant feedback this time.'
      : 'The same questions as that attempt, shuffled, with instant feedback.',
    facts: [
      { label: 'Questions', value: String(questions.length) },
      { label: 'Elo', value: isCustom ? 'Not affected' : 'Unchanged (repeats)' },
      { label: 'Feedback', value: 'After each answer' },
    ],
    back: { to: `/play/review/${attempt.id}`, label: 'Original attempt' },
    again: null,
    previousBest: null,
  };
}
