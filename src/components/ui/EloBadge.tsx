import { cn } from './cn';

export type TierName = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Champion';
export type Tier = {
  name: TierName;
  min: number;
  /** Next tier's floor, or null at the top. */
  next: number | null;
  /** Gradient stops for the gem. */
  from: string;
  to: string;
  /** Readable text colour on light surfaces. */
  ink: string;
};

export const TIERS: Tier[] = [
  { name: 'Bronze', min: 0, next: 300, from: '#E3A46F', to: '#9A5A2B', ink: '#8A4F22' },
  { name: 'Silver', min: 300, next: 600, from: '#E6EBF2', to: '#8C97A8', ink: '#5E6878' },
  { name: 'Gold', min: 600, next: 900, from: '#FFE08A', to: '#C98A00', ink: '#8F6200' },
  { name: 'Platinum', min: 900, next: 1200, from: '#B8F0EC', to: '#3C9C9A', ink: '#1F7471' },
  { name: 'Diamond', min: 1200, next: 1500, from: '#B9D3FF', to: '#3F6FB3', ink: '#2F5C9C' },
  { name: 'Champion', min: 1500, next: null, from: '#FF7A9C', to: '#BF0D3E', ink: '#BF0D3E' },
];

/** Rank tier for an Elo: Bronze <300, Silver <600, Gold <900, Platinum <1200, Diamond <1500, Champion 1500+. */
export function tierFor(elo: number): Tier {
  const e = Math.max(0, Math.round(elo || 0));
  for (let i = TIERS.length - 1; i >= 0; i--) if (e >= TIERS[i].min) return TIERS[i];
  return TIERS[0];
}

/** 0..1 progress through the current tier (1 at Champion). */
export function tierProgress(elo: number) {
  const t = tierFor(elo);
  if (t.next == null) return 1;
  return Math.max(0, Math.min(1, (elo - t.min) / (t.next - t.min)));
}

/** Faceted gem in tier colours. */
export function TierGem({ elo, size = 20, className }: { elo: number; size?: number; className?: string }) {
  const t = tierFor(elo);
  const id = `gem-${t.name}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn('shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.from} />
          <stop offset="1" stopColor={t.to} />
        </linearGradient>
      </defs>
      <path d="M12 1.5 21.5 8 18 21H6L2.5 8Z" fill={`url(#${id})`} />
      <path d="M12 1.5 15.5 8H8.5Z" fill="#fff" fillOpacity="0.45" />
      <path d="M2.5 8h19L12 21.5Z" fill="#000" fillOpacity="0.08" />
      <path d="M8.5 8 12 21 15.5 8" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.8" />
      {t.name === 'Champion' && <circle cx="12" cy="11" r="2.2" fill="#fff" fillOpacity="0.9" />}
    </svg>
  );
}

/** Elo number with its tier gem and name. */
export function EloBadge({
  elo,
  size = 'md',
  showTier = true,
  onDark,
  className,
}: {
  elo: number;
  size?: 'sm' | 'md' | 'lg';
  showTier?: boolean;
  /** For use on navy bands. */
  onDark?: boolean;
  className?: string;
}) {
  const t = tierFor(elo);
  const gem = { sm: 14, md: 18, lg: 26 }[size];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-display font-bold',
        size === 'sm' && 'h-6 px-2 text-xs',
        size === 'md' && 'h-7 px-2.5 text-sm',
        size === 'lg' && 'h-10 px-3.5 text-lg',
        onDark ? 'bg-white/12 text-white ring-1 ring-inset ring-white/15' : 'bg-surface ring-1 ring-inset ring-line',
        className,
      )}
      title={`${t.name} tier`}
    >
      <TierGem elo={elo} size={gem} />
      <span className={cn('tabular', !onDark && 'text-heading')}>{Math.max(0, Math.round(elo || 0))}</span>
      {showTier && (
        <span
          className={cn('font-semibold', size === 'lg' ? 'text-sm' : 'text-[0.85em]', onDark ? 'text-white/70' : 'dark:!text-white/75')}
          style={onDark ? undefined : { color: t.ink }}
        >
          {t.name}
        </span>
      )}
    </span>
  );
}
