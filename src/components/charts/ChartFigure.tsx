import { useId, type ReactNode } from 'react';
import { cn } from '../ui/cn';

export type ChartTable = {
  /** Column headings; the first column names each row. */
  columns: string[];
  rows: ReactNode[][];
};

/**
 * A titled chart with its numbers available as a table: a "Show as table" disclosure under the chart, so screen
 * reader and keyboard users (and anyone who wants exact values) get the same data as the picture.
 */
export function ChartFigure({
  title,
  description,
  action,
  table,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Right of the title, e.g. a bucket picker. */
  action?: ReactNode;
  table?: ChartTable;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <figure className={cn('min-w-0', className)} aria-labelledby={`${id}-t`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <figcaption className="min-w-0">
          <h3 id={`${id}-t`} className="text-[0.95rem] font-bold leading-tight text-heading">
            {title}
          </h3>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </figcaption>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
      {table && table.rows.length > 0 && (
        <details className="group mt-3 text-sm">
          <summary className="inline-flex cursor-pointer select-none items-center gap-1 rounded-none font-semibold text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-blue/40">
            <span className="group-open:hidden">Show as table</span>
            <span className="hidden group-open:inline">Hide table</span>
          </summary>
          <div className="mt-2 max-h-80 overflow-auto border border-line">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left">
                <tr>
                  {table.columns.map((c, i) => (
                    <th
                      key={c}
                      scope="col"
                      className={cn(
                        'whitespace-nowrap border-b border-line px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted',
                        i > 0 && 'text-right',
                      )}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {table.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((cell, ci) =>
                      ci === 0 ? (
                        <th key={ci} scope="row" className="px-3 py-1.5 text-left font-medium text-ink">
                          {cell}
                        </th>
                      ) : (
                        <td key={ci} className="tabular px-3 py-1.5 text-right text-ink">
                          {cell}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}
