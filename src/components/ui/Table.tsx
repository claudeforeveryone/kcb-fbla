import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from './cn';

/** Scroll wrapper + table. Compose with THead/TBody/TR/TH/TD. */
export function Table({ className, wrapClassName, ...rest }: HTMLAttributes<HTMLTableElement> & { wrapClassName?: string }) {
  return (
    <div className={cn('w-full overflow-x-auto rounded-none border border-line bg-surface', wrapClassName)}>
      <table className={cn('w-full border-collapse text-sm', className)} {...rest} />
    </div>
  );
}
export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-surface-2/70 text-left', className)} {...rest} />;
}
export function TBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-line', className)} {...rest} />;
}
export function TR({
  className,
  highlight,
  interactive,
  ...rest
}: HTMLAttributes<HTMLTableRowElement> & { highlight?: boolean; interactive?: boolean }) {
  return (
    <tr
      className={cn(
        'transition-colors',
        interactive && 'cursor-pointer hover:bg-surface-2/60',
        highlight && 'bg-red/[0.05] shadow-[inset_3px_0_0_var(--red)]',
        className,
      )}
      {...rest}
    />
  );
}
export function TH({
  className,
  sort,
  onSort,
  children,
  align,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & {
  /** Current sort state for this column. Provide onSort to make it clickable. */
  sort?: 'asc' | 'desc' | null;
  onSort?: () => void;
  align?: 'left' | 'right' | 'center';
}) {
  const a = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th
      scope="col"
      aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined}
      className={cn(
        'whitespace-nowrap border-b border-line px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted',
        a,
        className,
      )}
      {...rest}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          className={cn('inline-flex items-center gap-1 uppercase hover:text-ink', align === 'right' && 'flex-row-reverse')}
        >
          {children}
          {sort === 'asc' ? (
            <ArrowUp className="size-3" />
          ) : sort === 'desc' ? (
            <ArrowDown className="size-3" />
          ) : (
            <ArrowUpDown className="size-3 opacity-50" />
          )}
        </button>
      ) : (
        children
      )}
    </th>
  );
}
export function TD({ className, align, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  const a = align === 'right' ? 'text-right tabular' : align === 'center' ? 'text-center' : '';
  return <td className={cn('px-4 py-3 align-middle', a, className)} {...rest} />;
}
