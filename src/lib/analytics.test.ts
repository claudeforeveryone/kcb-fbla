import { describe, expect, it } from 'vitest';
import { makeTracker, type TrackRpc } from './analytics';

function setup(opts: { signedIn?: boolean; rpc?: TrackRpc } = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  let clock = Date.parse('2026-10-11T12:00:00Z');
  const rpc: TrackRpc =
    opts.rpc ??
    (async (fn, args) => {
      calls.push({ fn, args });
      return { error: null };
    });
  const track = makeTracker({ rpc, signedIn: async () => opts.signedIn ?? true, now: () => clock });
  return { track, calls, advance: (ms: number) => (clock += ms) };
}

describe('track', () => {
  it('sends the event, its code and metadata to fbla_track', async () => {
    const { track, calls } = setup();
    await track('practice_started', 'accounting', { mode: 'focus', count: 20 });
    expect(calls).toEqual([
      { fn: 'fbla_track', args: { p_name: 'practice_started', p_event_code: 'accounting', p_meta: { mode: 'focus', count: 20 } } },
    ]);
  });

  it('never breaks the page: a failing or throwing call resolves quietly', async () => {
    const rejecting = setup({ rpc: async () => Promise.reject(new Error('offline')) });
    await expect(rejecting.track('practice_started')).resolves.toBeUndefined();
    const throwing = setup({
      rpc: () => {
        throw new Error('boom');
      },
    });
    await expect(throwing.track('practice_started')).resolves.toBeUndefined();
    const erroring = setup({ rpc: async () => ({ error: { message: 'function does not exist' } }) });
    await expect(erroring.track('practice_started')).resolves.toBeUndefined();
  });

  it('sends nothing for a signed-out visitor', async () => {
    const { track, calls } = setup({ signedIn: false });
    await track('event_selected', 'accounting');
    expect(calls).toHaveLength(0);
  });

  it('drops anything the database would refuse instead of failing the whole event', async () => {
    const { track, calls } = setup();
    await track('practice_started', 'Not A Code!', {
      mode: 'Focus Mode',
      source: 'home',
      question: 'what is a debit',
      count: -3,
    } as never);
    expect(calls[0].args).toEqual({ p_name: 'practice_started', p_event_code: null, p_meta: { source: 'home' } });
  });

  it('counts choosing the same event once per half hour', async () => {
    const { track, calls, advance } = setup();
    await track('event_selected', 'accounting');
    await track('event_selected', 'accounting');
    await track('event_selected', 'marketing');
    advance(31 * 60 * 1000);
    await track('event_selected', 'accounting');
    expect(calls.map((c) => c.args.p_event_code)).toEqual(['accounting', 'marketing', 'accounting']);
  });
});
