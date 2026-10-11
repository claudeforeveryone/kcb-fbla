import type { HTMLAttributes } from 'react';
import { cn } from './cn';
import { useScrollFade } from './scrollFade';

/** A horizontally scrolling row (pill filters, section nav) that fades the edge with more content past it. */
export function ScrollRow({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useScrollFade<HTMLDivElement>();
  return <div ref={ref} className={cn('scroll-fade scrollbar-none flex overflow-x-auto', className)} {...rest} />;
}
