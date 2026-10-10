import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Adds a hover lift; use for clickable cards. */
  interactive?: boolean;
  padded?: boolean;
  as?: 'div' | 'section' | 'article';
};

export function Card({ interactive, padded = true, as: Tag = 'div', className, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-[4px] border border-line bg-surface',
        padded && 'p-5',
        interactive &&
          'transition-[transform,border-color] duration-200 ease-out hover:-translate-y-px hover:border-line-strong',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon: _icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-start gap-3', className)}>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold leading-tight">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
