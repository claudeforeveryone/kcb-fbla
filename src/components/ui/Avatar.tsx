import { useState } from 'react';
import { cn } from './cn';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const sizes: Record<AvatarSize, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-20 text-2xl',
  '2xl': 'size-28 text-4xl',
};

// Deterministic, on-brand backgrounds for initials.
const swatches = ['#001E60', '#3F6FB3', '#BF0D3E', '#1E8E5A', '#5B3FB3', '#0F7C8C', '#C2571A', '#2B4A8F'];

export function initials(name?: string | null) {
  const parts = (name ?? '').trim().split(/[\s_.-]+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] ?? ''))).toUpperCase();
}

function swatch(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return swatches[h % swatches.length];
}

export function Avatar({
  src,
  name,
  size = 'md',
  ring,
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: AvatarSize;
  /** Adds a white ring, for avatars on photos or navy bands. */
  ring?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const show = src && !broken;
  return (
    <span
      className={cn(
        'avatar relative inline-grid shrink-0 select-none place-items-center overflow-hidden rounded-full font-display font-bold text-white',
        sizes[size],
        ring && 'ring-2 ring-white dark:ring-surface',
        className,
      )}
      style={show ? undefined : { backgroundColor: swatch(name || '?') }}
      role="img"
      aria-label={name ?? 'Avatar'}
    >
      {show ? (
        <img src={src} alt="" className="size-full object-cover" onError={() => setBroken(true)} loading="lazy" />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
