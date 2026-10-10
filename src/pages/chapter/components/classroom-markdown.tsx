import { Fragment, type ReactNode } from 'react';
import { cn } from '../../../components/ui';

/**
 * "Markdown-lite" for classroom posts and newsletters. Renders React elements only (never innerHTML).
 * Blocks: # / ## / ### headings, paragraphs, - or * bullet lists, 1. numbered lists, > quotes, --- rules.
 * Inline: **bold**, *italic* or _italic_, `code`, [text](https://link) and bare https:// links.
 */
export function Markdown({ text, className, size = 'md' }: { text: string; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const blocks = parseBlocks(text);
  return (
    <div
      className={cn(
        'min-w-0 break-words text-ink',
        size === 'lg' ? 'text-[1.0625rem] leading-[1.75]' : size === 'sm' ? 'text-sm leading-relaxed' : 'text-[0.9375rem] leading-relaxed',
        className,
      )}
    >
      {blocks.map((b, i) => (
        <Block key={i} b={b} size={size} first={i === 0} />
      ))}
    </div>
  );
}

type B =
  | { t: 'h'; level: 1 | 2 | 3; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'quote'; text: string }
  | { t: 'hr' };

function parseBlocks(src: string): B[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: B[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: 'p', text: para.join('\n') });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (h) {
      flush();
      out.push({ t: 'h', level: h[1].length as 1 | 2 | 3, text: h[2] });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      out.push({ t: 'hr' });
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      flush();
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) q.push(lines[i++].trim().replace(/^>\s?/, ''));
      i--;
      out.push({ t: 'quote', text: q.join('\n') });
      continue;
    }
    if (/^[-*•]\s+/.test(trimmed)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^[-*•]\s+/, ''));
      i--;
      out.push({ t: 'ul', items });
      continue;
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^\d+[.)]\s+/, ''));
      i--;
      out.push({ t: 'ol', items });
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

function Block({ b, size, first }: { b: B; size: 'sm' | 'md' | 'lg'; first: boolean }) {
  const gap = first ? '' : size === 'lg' ? 'mt-5' : 'mt-3';
  switch (b.t) {
    case 'h': {
      const cls = cn(
        'font-display font-bold text-heading',
        first ? '' : size === 'lg' ? 'mt-8' : 'mt-5',
        b.level === 1
          ? size === 'lg' ? 'text-2xl' : 'text-xl'
          : b.level === 2
            ? size === 'lg' ? 'text-xl' : 'text-lg'
            : 'text-base uppercase tracking-wide text-muted',
      );
      if (b.level === 1) return <h2 className={cls}>{inline(b.text)}</h2>;
      if (b.level === 2) return <h3 className={cls}>{inline(b.text)}</h3>;
      return <h4 className={cls}>{inline(b.text)}</h4>;
    }
    case 'p':
      return (
        <p className={gap}>
          {b.text.split('\n').map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {inline(l)}
            </Fragment>
          ))}
        </p>
      );
    case 'ul':
      return (
        <ul className={cn(gap, 'space-y-1.5 pl-1')}>
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-[0.6em] size-1.5 shrink-0 bg-red" aria-hidden />
              <span className="min-w-0">{inline(it)}</span>
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className={cn(gap, 'space-y-1.5')}>
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="tabular mt-px min-w-5 shrink-0 font-display font-bold text-blue dark:text-link">{i + 1}.</span>
              <span className="min-w-0">{inline(it)}</span>
            </li>
          ))}
        </ol>
      );
    case 'quote':
      return (
        <blockquote className={cn(gap, 'border-l-[3px] border-red bg-surface-2 py-2 pl-4 pr-3 italic text-ink/90')}>
          {inline(b.text)}
        </blockquote>
      );
    case 'hr':
      return <hr className={cn(size === 'lg' ? 'my-8' : 'my-4', 'border-line')} />;
  }
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)\s]+\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function inline(text: string): ReactNode[] {
  const parts = text.split(INLINE);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    if (part.startsWith('**')) return <strong key={i} className="font-semibold text-heading">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`'))
      return (
        <code key={i} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith('[')) {
      const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)!;
      return (
        <a key={i} href={m[2]} target="_blank" rel="noopener noreferrer" className="link">
          {m[1]}
        </a>
      );
    }
    if (/^https?:\/\//.test(part))
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="link break-all">
          {part.replace(/^https?:\/\/(www\.)?/, '')}
        </a>
      );
    return <em key={i}>{part.slice(1, -1)}</em>;
  });
}

/** Plain-text excerpt for cards and previews. */
export function excerpt(text: string | null | undefined, max = 220): string {
  if (!text) return '';
  const plain = text
    .replace(/\r\n?/g, '\n')
    .replace(/^#{1,3}\s+.*$/gm, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/[.!?:;,]$/.test(l) ? l : `${l}.`))
    .join('\n')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|\s)[*_]([^*_]+)[*_]/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/** Minutes to read, at 220 words a minute. */
export function readingMinutes(text: string | null | undefined): number {
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
