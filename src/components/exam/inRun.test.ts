import { describe, expect, it } from 'vitest';
import runner from './ExamRunner.tsx?raw';
import shell from '../layout/AppShell.tsx?raw';
import css from '../../index.css?raw';

// While a member is answering, the phone tab bar is hidden. Three files have to agree for that to work: the runner
// marks <html>, the shell names the bar, and the stylesheet hides it and moves the action bar to the bottom edge.
describe('phone tab bar while answering', () => {
  it('the runner marks the page for as long as it is mounted', () => {
    expect(runner).toContain("setAttribute('data-in-run', '')");
    expect(runner).toContain("removeAttribute('data-in-run')");
    expect(runner).toContain('exam-actions sticky');
  });

  it('the shell names the bar and reserves its room with the same variable', () => {
    expect(shell).toMatch(/className="bottom-tabs /);
    expect(shell).toContain('var(--tabs-h)');
  });

  it('the stylesheet hides the bar and drops the offset', () => {
    expect(css).toContain(':root[data-in-run] .bottom-tabs { display: none; }');
    expect(css).toContain(':root[data-in-run] { --tabs-h: 0px; }');
    expect(css).toMatch(/:root\[data-in-run\] \.exam-actions \{ bottom: 0;/);
  });
});
