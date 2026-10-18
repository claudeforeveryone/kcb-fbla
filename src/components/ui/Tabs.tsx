import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';
import { revealInRow, useScrollFade } from './scrollFade';

export type TabItem<T extends string = string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
};

/**
 * Accessible tab list (roving focus, arrow keys). Render the active panel yourself:
 * `<Tabs .../>{tab === 'a' && <PanelA/>}`. Panels can use `tabPanelProps(id, value)`.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  variant = 'underline',
  id = 'tabs',
  className,
  'aria-label': ariaLabel,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'underline' | 'pills';
  id?: string;
  className?: string;
  'aria-label'?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const fadeRef = useScrollFade<HTMLDivElement>();
  const listRef = useRef<HTMLDivElement | null>(null);
  const setList = useCallback(
    (el: HTMLDivElement | null) => {
      listRef.current = el;
      fadeRef(el);
    },
    [fadeRef],
  );
  // On a narrow screen the strip scrolls sideways: keep the selected tab in view, whether it was picked here, came
  // from the URL (a refresh, a shared link) or was set by another control. The first pass jumps, later ones glide.
  const activeIndex = items.findIndex((t) => t.value === value);
  const placed = useRef(false);
  useLayoutEffect(() => {
    revealInRow(listRef.current, refs.current[activeIndex], !placed.current);
    placed.current = true;
  }, [activeIndex]);

  const onKey = (e: KeyboardEvent, i: number) => {
    const enabled = items.map((t, j) => (t.disabled ? -1 : j)).filter((j) => j >= 0);
    const pos = enabled.indexOf(i);
    let next = -1;
    if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length];
    else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (next >= 0) {
      e.preventDefault();
      refs.current[next]?.focus();
      onChange(items[next].value);
    }
  };

  return (
    <div
      ref={setList}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'scroll-fade scrollbar-none flex max-w-full overflow-x-auto',
        variant === 'underline' ? 'gap-1 border-b border-line' : 'gap-0 rounded-none border border-line bg-surface-2',
        className,
      )}
    >
      {items.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${id}-tab-${t.value}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`${id}-panel-${t.value}`}
            tabIndex={active ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              // The tablist scrolls sideways, which clips an outline drawn outside the button: draw focus inside it.
              'relative inline-flex shrink-0 items-center gap-2 font-display text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] disabled:opacity-40 [&>svg]:size-4',
              variant === 'underline'
                ? cn(
                    'h-11 px-3 after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:transition-colors',
                    active ? 'text-heading after:bg-red' : 'text-muted hover:text-ink after:bg-transparent',
                  )
                : cn(
                    'h-9 px-3.5',
                    active ? 'bg-surface text-heading shadow-[inset_0_-2px_0_var(--red)] ring-1 ring-line-strong dark:bg-surface-3' : 'text-muted hover:bg-surface-3 hover:text-ink',
                  ),
            )}
          >
            {t.icon}
            {t.label}
            {t.count != null && (
              <span
                className={cn(
                  'tabular min-w-5 rounded-none px-1.5 text-center text-[11px] leading-5',
                  active ? 'bg-red text-white' : 'bg-surface-3 text-muted',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function tabPanelProps(id: string, value: string) {
  return {
    role: 'tabpanel' as const,
    id: `${id}-panel-${value}`,
    'aria-labelledby': `${id}-tab-${value}`,
    tabIndex: 0,
  };
}
