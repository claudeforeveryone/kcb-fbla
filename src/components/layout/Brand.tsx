import { Link } from 'react-router-dom';
import { cn } from '../ui/cn';

export const LOGO_WHITE = `${import.meta.env.BASE_URL}brand/fblc-logo-white.webp`;

/** FBLC logo + "KCB FBLA" wordmark. Always place on navy. */
export function Brand({
  to = '/',
  size = 'md',
  className,
  showWordmark = true,
  wordmarkClassName,
}: {
  to?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
}) {
  const img = { sm: 'h-7', md: 'h-9', lg: 'h-14' }[size];
  const text = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' }[size];
  const inner = (
    <>
      <img src={LOGO_WHITE} alt="FBLC" className={cn(img, 'w-auto shrink-0 select-none')} draggable={false} />
      {showWordmark && (
        <span className={cn("flex flex-col leading-none", text, wordmarkClassName)}>
          <span className="font-display font-extrabold tracking-tight text-white">
            KCB <span className="text-white/80">FBLA</span>
          </span>
          {size === 'lg' && (
            <span className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Future Business Leaders
            </span>
          )}
        </span>
      )}
    </>
  );
  const cls = cn('inline-flex items-center gap-2.5 rounded-md', className);
  return to ? (
    <Link to={to} className={cls} aria-label="KCB FBLA home">
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}
