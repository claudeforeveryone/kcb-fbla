import { Link } from 'react-router-dom';
import { cn } from '../ui/cn';

/**
 * The white FBLC mark, exported at 169x192: three times its largest on-screen size (64 px tall on the splash), about
 * 8 KB. The 750x854 original (brand/fblc-logo-white.webp, 98 KB) stays in public/ as the source for icons.
 */
export const LOGO_WHITE = `${import.meta.env.BASE_URL}brand/fblc-logo-white-192.webp`;
/** Intrinsic size of LOGO_WHITE, for width/height attributes: the browser reserves its box before it loads. */
export const LOGO_SIZE = { width: 169, height: 192 } as const;

/** FBLC logo + "FBLC" wordmark. Always place on navy. */
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
      <img
        src={LOGO_WHITE}
        {...LOGO_SIZE}
        alt="FBLC"
        className={cn(img, 'w-auto shrink-0 select-none')}
        draggable={false}
      />
      {showWordmark && (
        <span className={cn("flex flex-col leading-none", text, wordmarkClassName)}>
          <span className="font-display font-extrabold tracking-tight text-white">
            FBLC
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
  const cls = cn('inline-flex items-center gap-2.5 rounded-[2px]', className);
  return to ? (
    <Link to={to} className={cls} aria-label="FBLC home">
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}
