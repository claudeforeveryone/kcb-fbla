import { describe, expect, it } from 'vitest';
import feedbackSql from '../../supabase/migrations/0103_fbla_feedback.sql?raw';
import {
  canReportQuestion,
  cleanPagePath,
  composeReport,
  FEEDBACK_KINDS,
  FEEDBACK_MAX,
  feedbackProblem,
  pageLabel,
  PATH_IDS,
  REPORT_REASONS,
  STUDENT_FEEDBACK_COLUMNS,
  triageFilters,
  triageLink,
  triageSaved,
} from './feedback';

describe('triage links (Content and the status badges open Feedback filtered)', () => {
  it('opens Feedback on one question, keeping the rest of the console URL and dropping old filters', () => {
    const link = triageLink('?tab=content&range=90&status=resolved&kind=bug', {
      status: 'open',
      kind: 'question_issue',
      question: 'acc-014',
    });
    const p = new URLSearchParams(link);
    expect(p.get('tab')).toBe('feedback');
    expect(p.get('range')).toBe('90');
    expect(p.get('status')).toBe('open');
    expect(p.get('kind')).toBe('question_issue');
    expect(p.get('question')).toBe('acc-014');
  });

  it('reads the filters back, falling back to open reports of any kind', () => {
    expect(triageFilters(new URLSearchParams('status=resolved&kind=question_issue&question=acc-014'))).toEqual({
      status: 'resolved',
      kind: 'question_issue',
      question: 'acc-014',
      report: null,
    });
    expect(triageFilters(new URLSearchParams('status=closed&kind=nonsense&question=a%20b'))).toEqual({
      status: 'open',
      kind: '',
      question: null,
      report: null,
    });
    expect(triageFilters(new URLSearchParams(''))).toEqual({ status: 'open', kind: '', question: null, report: null });
  });

  it('opens one report from the audit log by its id, and ignores anything that is not a report id', () => {
    const id = '3dd2c334-6d94-4fd1-a061-524ac601368b';
    const link = triageLink('?tab=audit&range=30', { status: 'all', report: id });
    const p = new URLSearchParams(link);
    expect([p.get('tab'), p.get('range'), p.get('status'), p.get('report')]).toEqual(['feedback', '30', 'all', id]);
    expect(triageFilters(p).report).toBe(id);
    expect(triageFilters(new URLSearchParams('report=f1%27%20or%201=1')).report).toBeNull();
  });
});

describe('STUDENT_FEEDBACK_COLUMNS', () => {
  // "Your reports" must ask only for columns inside the 0103 grant, or the database refuses the whole read.
  const grant = /grant select \(([^)]*)\)\s+on table public\.fbla_feedback to authenticated/.exec(feedbackSql);
  const granted = new Set((grant?.[1] ?? '').split(',').map((c) => c.trim()));
  const asked = STUDENT_FEEDBACK_COLUMNS.split(',');

  it('asks only for columns the migration lets a student read', () => {
    expect(grant).not.toBeNull();
    expect(asked.filter((c) => !granted.has(c))).toEqual([]);
  });

  it('keeps priority and the reviewer owner-only, as the triage toast promises', () => {
    for (const col of ['priority', 'reviewed_by']) {
      expect(granted.has(col)).toBe(false);
      expect(asked).not.toContain(col);
    }
    expect(triageSaved({ priority: 'low' }).body).toBe('Only owners see priority.');
  });
});

describe('feedbackProblem', () => {
  it('asks for a few words, counting the trimmed message', () => {
    expect(feedbackProblem('')).toMatch(/a few words/);
    expect(feedbackProblem('  hi  ')).toMatch(/a few words/);
    expect(feedbackProblem('   typo!   ')).toBeNull();
  });

  it('accepts up to 2,000 characters and says so past that', () => {
    expect(feedbackProblem('x'.repeat(FEEDBACK_MAX))).toBeNull();
    expect(feedbackProblem('x'.repeat(FEEDBACK_MAX + 1))).toMatch(/2,000/);
  });
});

describe('cleanPagePath', () => {
  it('keeps only the path: no query string, no hash', () => {
    expect(cleanPagePath('/play/accounting?tab=2#q3')).toBe('/play/accounting');
  });

  it('never sends a chapter invite token, and replaces other ids in the path with their route name', () => {
    expect(cleanPagePath('/chapter/join/Xk3vQ9pLmZ2w')).toBe('/chapter/join/:token');
    expect(cleanPagePath('/chapter/join/Xk3vQ9pLmZ2w/?ref=1')).toBe('/chapter/join/:token/');
    expect(cleanPagePath('/play/review/3dd2c334-6d94-4fd1-a061-524ac601368b')).toBe('/play/review/:attempt');
    expect(cleanPagePath('/arena/9b1e2c44-0000-4000-8000-000000000001')).toBe('/arena/:duel');
    expect(cleanPagePath('/chapter/member/9b1e2c44-0000-4000-8000-000000000001')).toBe('/chapter/member/:member');
    expect(cleanPagePath('/chapter/tests/42/edit')).toBe('/chapter/tests/:test/edit');
    expect(cleanPagePath('/u/maya.chen')).toBe('/u/:username');
  });

  it('matches the database: fbla_feedback_guard (0103) rewrites every pattern the same way', () => {
    for (const [pattern, name] of PATH_IDS) {
      const sqlPattern = pattern.source.replace(/\\\//g, '/');
      expect(feedbackSql).toContain(`v_path := regexp_replace(v_path, '${sqlPattern}', '${name}');`);
    }
  });

  it('keeps pages whose path names no person or secret', () => {
    for (const path of ['/', '/play', '/play/run', '/play/accounting', '/vocab/marketing', '/arena', '/chapter/join', '/me/settings']) {
      expect(cleanPagePath(path)).toBe(path);
    }
  });

  it('always starts with a slash, drops whitespace and stays within 200 characters', () => {
    expect(cleanPagePath('play')).toBe('/play');
    expect(cleanPagePath('/me/ settings')).toBe('/me/settings');
    expect(cleanPagePath(`/${'a'.repeat(300)}`)).toHaveLength(200);
    expect(cleanPagePath('')).toBe('/');
  });
});

describe('pageLabel (what Send feedback tells the student it sends)', () => {
  it('names the page in plain words instead of showing the path', () => {
    expect(pageLabel(cleanPagePath('/play/review/3dd2c334-6d94-4fd1-a061-524ac601368b'))).toBe('Exam review');
    expect(pageLabel('/')).toBe('Home');
    expect(pageLabel('/play/accounting')).toBe('Event page');
    expect(pageLabel('/vocab/marketing')).toBe('Vocab deck');
    expect(pageLabel('/chapter/join/:token')).toBe('Chapter invite');
    expect(pageLabel('/me/settings')).toBe('Settings');
  });

  it('says nothing for a page it does not know', () => {
    expect(pageLabel('/somewhere/new')).toBeNull();
  });
});

describe('question reports', () => {
  it('only offers reports on official questions (chapter-written ones go to their author)', () => {
    expect(canReportQuestion('acc-001')).toBe(true);
    expect(canReportQuestion('custom:0b1c:3')).toBe(false);
    expect(canReportQuestion('')).toBe(false);
  });

  it('writes the chosen reason first, then the student\'s details', () => {
    expect(composeReport('wrong_key', 'B is right, see page 4')).toBe(
      'Wrong answer marked correct: B is right, see page 4',
    );
    expect(composeReport('unclear', '   ')).toBe('The question is unclear');
  });

  it('has a reason for each common problem', () => {
    expect(REPORT_REASONS.map((r) => r.value)).toEqual(['wrong_key', 'unclear', 'typo', 'explanation', 'other']);
  });
});

describe('FEEDBACK_KINDS', () => {
  it('offers only kinds the database accepts, and leaves question reports to the review screen', () => {
    const db = ['bug', 'feature', 'general', 'question_issue', 'resource_issue', 'accessibility'];
    for (const k of FEEDBACK_KINDS) expect(db).toContain(k.value);
    expect(FEEDBACK_KINDS.map((k) => k.value)).not.toContain('question_issue');
  });
});

describe('triageSaved (what the owner is told after saving)', () => {
  it('names the new status and the plain words the student sees for it', () => {
    expect(triageSaved({ status: 'resolved' })).toEqual({ title: 'Marked Resolved', body: 'The student now sees "Done".' });
    expect(triageSaved({ status: 'in_progress', note: 'Looking into it' })).toEqual({
      title: 'Marked In progress',
      body: 'The student now sees "Being worked on" and your note.',
    });
    // Students never see the team's own words for a status.
    expect(triageSaved({ status: 'triaged' }).body).toBe('The student now sees "Seen by the team".');
    expect(triageSaved({ status: 'wontfix' }).body).toBe('The student now sees "Not changing".');
  });

  it('does not claim the student sees a priority change, which only owners see', () => {
    expect(triageSaved({ priority: 'high' })).toEqual({ title: 'Priority set to High', body: 'Only owners see priority.' });
  });

  it('tells a note change apart from removing the note', () => {
    expect(triageSaved({ note: 'Fixed now' })).toEqual({ title: 'Note saved', body: 'The student sees it with the status.' });
    expect(triageSaved({ note: '' })).toEqual({ title: 'Note removed', body: 'The student no longer sees a note.' });
  });
});
