import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from './cn';

export type DropdownItem =
  | {
      type?: 'item';
      label: ReactNode;
      icon?: ReactNode;
      /** Router path. */
      to?: string;
      onSelect?: () => void;
      danger?: boolean;
      disabled?: boolean;
      hint?: ReactNode;
    }
  | { type: 'separator' }
  | { type: 'label'; label: ReactNode }
  | { type: 'custom'; render: ReactNode };

/**
 * Menu button. `trigger` receives the props to spread on your button.
 */
export function Dropdown({
  trigger,
  items,
  align = 'end',
  width = 'w-60',
  header,
}: {
  trigger: (props: {
    ref: (el: HTMLButtonElement | null) => void;
    onClick: () => void;
    onKeyDown: (e: KeyboardEvent) => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string;
    open: boolean;
  }) => ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end';
  width?: string;
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const focusItem = (dir: 1 | -1 | 'first' | 'last') => {
    const els = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    if (!els.length) return;
    const cur = els.indexOf(document.activeElement as HTMLElement);
    let n = 0;
    if (dir === 'first') n = 0;
    else if (dir === 'last') n = els.length - 1;
    else n = (cur + dir + els.length) % els.length;
    els[n].focus();
  };

  useEffect(() => {
    if (open) requestAnimationFrame(() => focusItem('first'));
  }, [open]);

  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(-1); }
    else if (e.key === 'Home') { e.preventDefault(); focusItem('first'); }
    else if (e.key === 'End') { e.preventDefault(); focusItem('last'); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const itemCls = (danger?: boolean) =>
    cn(
      'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium outline-none transition-colors',
      'focus-visible:outline-none [&>svg]:size-4 [&>svg]:shrink-0',
      danger
        ? 'text-danger hover:bg-danger/10 focus:bg-danger/10'
        : 'text-ink hover:bg-surface-2 focus:bg-surface-2 [&>svg]:text-muted',
      'aria-disabled:pointer-events-none aria-disabled:opacity-50',
    );

  return (
    <div ref={root} className="relative">
      {trigger({
        ref: (el) => {
          btn.current = el;
        },
        onClick: () => setOpen((o) => !o),
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
        open,
      })}
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          onKeyDown={onMenuKey}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
          className={cn(
            'animate-pop absolute top-[calc(100%+8px)] z-[70] origin-top rounded-xl border border-line bg-surface p-1.5 text-ink shadow-pop',
            align === 'end' ? 'right-0' : 'left-0',
            width,
          )}
        >
          {header}
          {items.map((it, i) => {
            if (it.type === 'separator') return <div key={i} role="separator" className="-mx-1.5 my-1.5 h-px bg-line" />;
            if (it.type === 'label')
              return (
                <div key={i} className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                  {it.label}
                </div>
              );
            if (it.type === 'custom') return <div key={i}>{it.render}</div>;
            const content = (
              <>
                {it.icon}
                <span className="flex-1">{it.label}</span>
                {it.hint && <span className="text-xs text-muted">{it.hint}</span>}
              </>
            );
            if (it.to && !it.disabled)
              return (
                <Link
                  key={i}
                  to={it.to}
                  role="menuitem"
                  tabIndex={-1}
                  className={itemCls(it.danger)}
                  onClick={() => {
                    it.onSelect?.();
                    close(false);
                  }}
                >
                  {content}
                </Link>
              );
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={it.disabled || undefined}
                className={itemCls(it.danger)}
                onClick={() => {
                  close();
                  it.onSelect?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
