import { Link } from 'react-router-dom';
import { cn } from '../ui/cn';

/**
 * The FBLA United shield: white shield with navy, red and blue chevrons (public/brand/fbla-united-mark.svg). A flat
 * SVG, so one file serves every size from the favicon to the splash. The PNG icons in public/icons are exported from it.
 */
export const LOGO_WHITE = `${import.meta.env.BASE_URL}brand/fbla-united-mark.svg`;
/** Intrinsic size of LOGO_WHITE, for width/height attributes: the browser reserves its box before it loads. */
export const LOGO_SIZE = { width: 48, height: 56 } as const;

/** FBLA United shield + wordmark. Always place on navy. */
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
        alt="FBLA United"
        className={cn(img, 'w-auto shrink-0 select-none')}
        draggable={false}
      />
      {showWordmark && (
        <span className={cn('flex flex-col leading-none', text, wordmarkClassName)}>
          <span className="font-display font-extrabold tracking-tight text-white">FBLA</span>
          <span className="mt-[3px] text-[0.58em] font-bold uppercase tracking-[0.32em] text-[#F2A7BB]">United</span>
          {size === 'lg' && (
            <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Future Business Leaders
            </span>
          )}
        </span>
      )}
    </>
  );
  const cls = cn('inline-flex items-center gap-2.5 rounded-[2px]', className);
  return to ? (
    <Link to={to} className={cls} aria-label="FBLA United home">
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}
