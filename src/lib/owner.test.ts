import { describe, expect, it } from 'vitest';
import {
  auditActionLabel,
  auditChange,
  auditSource,
  bucketLabel,
  bucketsFor,
  clampRange,
  countLabel,
  dayLabel,
  featureLabel,
  fmtPercent,
  loadPages,
  mergePage,
  ownerGate,
  reasonProblem,
  seriesBars,
  seriesState,
  totalPoints,
  type Count,
} from './owner';

const n = (value: number): Count => ({ value, suppressed: false });
const hidden: Count = { value: null, suppressed: true };

describe('countLabel', () => {
  it('shows exact values with thousands separators', () => {
    expect(countLabel(n(0))).toBe('0');
    expect(countLabel(n(5))).toBe('5');
    expect(countLabel(n(12345))).toBe('12,345');
  });

  it('says "Hidden" for a withheld count (not "Under 5": a large group can be hidden too) and a dash for no data', () => {
    expect(countLabel(hidden)).toBe('Hidden');
    expect(countLabel(null)).toBe('–');
    expect(countLabel(undefined)).toBe('–');
  });
});

describe('ownerGate (the client half of the owner check)', () => {
  it('opens only for an explicit true from is_platform_owner with no error', () => {
    expect(ownerGate({ data: true, error: null })).toBe('owner');
  });

  it('fails closed on false, null, truthy non-booleans, errors and missing responses', () => {
    expect(ownerGate({ data: false, error: null })).toBe('denied');
    expect(ownerGate({ data: null, error: null })).toBe('denied');
    expect(ownerGate({ data: 'true', error: null })).toBe('denied');
    expect(ownerGate({ data: 1, error: null })).toBe('denied');
    expect(ownerGate({ data: true, error: { message: 'permission denied' } })).toBe('denied');
    expect(ownerGate(null)).toBe('denied');
    expect(ownerGate(undefined)).toBe('denied');
  });
});

describe('fmtPercent', () => {
  it('formats a 0-1 rate as a whole percent, or with one decimal when asked', () => {
    expect(fmtPercent(0.4166)).toBe('42%');
    expect(fmtPercent(0.4166, 1)).toBe('41.7%');
    expect(fmtPercent(1)).toBe('100%');
    expect(fmtPercent(0)).toBe('0%');
  });

  it('shows a dash when the server withheld the rate (null) or sent nothing', () => {
    expect(fmtPercent(null)).toBe('–');
    expect(fmtPercent(undefined)).toBe('–');
    expect(fmtPercent(Number.NaN)).toBe('–');
  });
});

describe('clampRange', () => {
  it('keeps the four windows the picker offers and falls back to 30 days', () => {
    expect(clampRange(7)).toBe(7);
    expect(clampRange(30)).toBe(30);
    expect(clampRange(90)).toBe(90);
    expect(clampRange(365)).toBe(365);
    expect(clampRange(14)).toBe(30);
    expect(clampRange(Number.NaN)).toBe(30);
    expect(clampRange('90')).toBe(90);
    expect(clampRange(null)).toBe(30);
  });
});

describe('bucketLabel', () => {
  it('names a Toronto calendar day without shifting it across midnight', () => {
    expect(bucketLabel('2026-10-10', '2026-10-10', 'day')).toBe('Oct 10, 2026');
    expect(bucketLabel('2026-01-01', '2026-01-01', 'day', true)).toBe('Jan 1');
  });

  it('names weeks by their span and months by name, short forms for axes', () => {
    expect(bucketLabel('2026-10-05', '2026-10-11', 'week')).toBe('Oct 5 to Oct 11, 2026');
    expect(bucketLabel('2026-10-05', '2026-10-11', 'week', true)).toBe('Oct 5');
    expect(bucketLabel('2026-10-01', '2026-10-31', 'month')).toBe('October 2026');
    expect(bucketLabel('2026-10-01', '2026-10-31', 'month', true)).toBe('Oct');
  });

  it('spells out a partial month at the edge of the range', () => {
    expect(bucketLabel('2026-09-12', '2026-09-30', 'month')).toBe('Sep 12 to Sep 30, 2026');
  });
});

describe('seriesBars', () => {
  const row = (start: string, signups: Count) => ({ start, end: start, signups });

  it('maps each bucket to a bar and keeps suppressed buckets visible as zero-height, flagged bars', () => {
    const bars = seriesBars([row('2026-10-01', n(7)), row('2026-10-02', hidden), row('2026-10-03', n(0))], 'signups', 'day');
    expect(bars).toEqual([
      { label: 'Oct 1', title: 'Oct 1, 2026', value: 7, suppressed: false },
      { label: 'Oct 2', title: 'Oct 2, 2026', value: 0, suppressed: true },
      { label: 'Oct 3', title: 'Oct 3, 2026', value: 0, suppressed: false },
    ]);
  });

  it('returns nothing for an empty series', () => {
    expect(seriesBars([], 'signups', 'day')).toEqual([]);
  });
});

describe('seriesState (small-site charts)', () => {
  it('says when a series has nothing to draw: no buckets, all zero, or only zero and hidden buckets', () => {
    expect(seriesState([])).toBe('empty');
    expect(seriesState([n(0), n(0)])).toBe('zero');
    expect(seriesState([n(0), hidden, hidden])).toBe('hidden');
    expect(seriesState([hidden])).toBe('hidden');
  });

  it('is fine once any bucket shows a real number', () => {
    expect(seriesState([hidden, n(0), n(6)])).toBe('ok');
  });
});

describe('totalPoints (the running-total line)', () => {
  const row = (start: string, end: string, total: Count) => ({ start, end, total });

  it('starts the line from the total the day before the range and skips hidden totals', () => {
    expect(totalPoints([row('2026-10-01', '2026-10-01', hidden), row('2026-10-02', '2026-10-02', n(25))], n(14))).toEqual([
      { x: '2026-09-30', y: 14 },
      { x: '2026-10-02', y: 25 },
    ]);
  });

  it('crosses month and year edges on the calendar, and leaves out a hidden baseline', () => {
    expect(totalPoints([row('2026-01-01', '2026-01-04', n(9))], n(7))[0]).toEqual({ x: '2025-12-31', y: 7 });
    expect(totalPoints([row('2026-03-01', '2026-03-31', n(30))], hidden)).toEqual([{ x: '2026-03-31', y: 30 }]);
    expect(totalPoints([], n(5))).toEqual([]);
  });
});

describe('mergePage and loadPages (paging past the server limit)', () => {
  type R = { id: number };
  const ids = (rows: R[]) => rows.map((r) => r.id);
  const idOf = (r: R) => r.id;

  it('appends only rows it does not have yet and says how many were new', () => {
    const m = mergePage([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }], idOf);
    expect(ids(m.rows)).toEqual([1, 2, 3]);
    expect(m.added).toBe(1);
  });

  // A server like fbla_owner_feedback_list: limit capped at 200, offset unbounded.
  const server = (count: number) => {
    const all = Array.from({ length: count }, (_, i) => ({ id: i + 1 }));
    const calls: number[] = [];
    const page = async (offset: number) => {
      calls.push(offset);
      return { total: count, rows: all.slice(offset, offset + Math.min(50, 200)), extra: 'meta' };
    };
    return { page, calls };
  };

  it('loads the first page, then as many pages as it takes to reach the rows already shown', async () => {
    const s = server(430);
    const first = await loadPages(s.page, 0, idOf);
    expect(first.rows).toHaveLength(50);
    expect(first.done).toBe(false);
    expect(first.head.extra).toBe('meta');

    const again = await loadPages(s.page, 260, idOf);
    expect(again.rows).toHaveLength(300);
    expect(ids(again.rows).slice(-1)).toEqual([300]);
    expect(again.done).toBe(false);
  });

  it('reaches every row past 200 and stops at the end', async () => {
    const s = server(230);
    const all = await loadPages(s.page, 230, idOf);
    expect(all.rows).toHaveLength(230);
    expect(all.done).toBe(true);
    expect(s.calls).toEqual([0, 50, 100, 150, 200]);
  });

  it('stops instead of looping when a page brings nothing new', async () => {
    const stuck = async () => ({ total: 999, rows: [{ id: 1 }, { id: 2 }] });
    const r = await loadPages(stuck, 500, idOf);
    expect(ids(r.rows)).toEqual([1, 2]);
    expect(r.done).toBe(true);
  });
});

describe('audit wording', () => {
  it('names every action the database writes in plain words', () => {
    expect(auditActionLabel('member_banned')).toBe('Banned from chapter');
    expect(auditActionLabel('support_email_viewed')).toBe('Email looked up');
    expect(auditActionLabel('chapter_role_changed')).toBe('Role changed');
    expect(auditActionLabel('owner_granted')).toBe('Owner access granted');
    expect(auditActionLabel('member_added')).toBe('Added to chapter');
  });

  it('turns an action it does not know into readable words', () => {
    expect(auditActionLabel('some_new_thing')).toBe('Some new thing');
  });

  it('describes what changed from the detail', () => {
    expect(auditChange('chapter_role_changed', { from: 'member', to: 'trainer' })).toBe('Member to Trainer');
    expect(auditChange('feedback_updated', { from: 'new', to: 'in_progress', priority: 'high' })).toBe(
      'New to In progress, high priority',
    );
    expect(auditChange('trainer_assigned', { event: 'accounting' })).toBe('Accounting');
    expect(auditChange('chapter_deleted', { name: 'KCB FBLA', members: 12 })).toBe('KCB FBLA, 12 members');
    expect(auditChange('member_banned', {})).toBe('');
  });

  it('says where a change came from', () => {
    expect(auditSource('member_banned', { via: 'owner_console' }, 'u1')).toBe('Owner console');
    expect(auditSource('feedback_updated', {}, 'u1')).toBe('Owner console');
    expect(auditSource('support_email_viewed', {}, 'u1')).toBe('Owner console');
    expect(auditSource('member_banned', {}, 'u1')).toBe('Chapter tools');
    expect(auditSource('owner_granted', {}, null)).toBe('Database');
  });
});

describe('dayLabel', () => {
  const now = new Date('2026-10-11T16:00:00Z'); // noon in Toronto
  it('counts Toronto calendar days, not 24-hour spans', () => {
    expect(dayLabel('2026-10-11T04:30:00Z', now)).toBe('Today'); // 00:30 Toronto
    expect(dayLabel('2026-10-11T03:30:00Z', now)).toBe('Yesterday'); // 23:30 Toronto the day before
    expect(dayLabel('2026-10-08T12:00:00Z', now)).toBe('3 days ago');
  });
  it('shows a date past a month, and "Never" for no date', () => {
    expect(dayLabel('2026-08-01T12:00:00Z', now)).toBe('Aug 1, 2026');
    expect(dayLabel(null, now)).toBe('Never');
  });
});

describe('featureLabel', () => {
  it('names each tracked event in plain words', () => {
    expect(featureLabel('practice_started')).toBe('Started practice');
    expect(featureLabel('vocab_session_completed')).toBe('Studied vocab');
    expect(featureLabel('something_new')).toBe('Something new');
  });
});

describe('bucketsFor', () => {
  it('offers only groupings that make a readable chart for the range', () => {
    expect(bucketsFor(7)).toEqual(['day']);
    expect(bucketsFor(30)).toEqual(['day', 'week']);
    expect(bucketsFor(90)).toEqual(['day', 'week', 'month']);
    expect(bucketsFor(365)).toEqual(['week', 'month']);
  });
});

describe('reasonProblem', () => {
  it('asks for a real reason of 10 to 200 characters, counting the trimmed text', () => {
    expect(reasonProblem('   spam   ')).toMatch(/10/);
    expect(reasonProblem('Asked by the chapter advisor')).toBeNull();
    expect(reasonProblem('x'.repeat(201))).toMatch(/200/);
  });
});
