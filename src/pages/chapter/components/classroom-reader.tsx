import { useEffect } from 'react';
import { Pencil, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Avatar, Badge, Button, UnitedRule } from '../../../components/ui';
import { ROLE_LABELS, type ChapterRole } from '../../../lib/types';
import type { ClassPost } from '../../../api/classroom';
import { Markdown, readingMinutes } from './classroom-markdown';
import { LinkPreview } from './classroom-post-card';
import { EventTag, POST_META, formatDate } from './classroom-shared';

/**
 * Full-screen reading view for a post. Newsletters get a masthead with the issue number; other posts a
 * simpler header. Escape or the close button dismisses it.
 */
export function PostReader({
  post,
  chapterName,
  issue,
  authorRole,
  onClose,
  onEdit,
}: {
  post: ClassPost | null;
  chapterName: string;
  /** Newsletter issue number (1-based, oldest first). */
  issue: number | null;
  authorRole: ChapterRole | null;
  onClose: () => void;
  onEdit?: () => void;
}) {
  useEffect(() => {
    if (!post) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => document.getElementById('reader-close')?.focus(), 20);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      window.clearTimeout(t);
      prev?.focus?.();
    };
  }, [post, onClose]);

  if (!post) return null;
  const meta = POST_META[post.kind];
  const isNews = post.kind === 'newsletter';

  return createPortal(
    <div className="fixed inset-0 z-[85] flex justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="reader-title">
      <div className="animate-fade-in absolute inset-0 bg-[#00143f]/70" onClick={onClose} aria-hidden />
      <article className="animate-pop relative flex h-full w-full max-w-3xl flex-col overflow-hidden bg-surface shadow-pop sm:h-auto sm:max-h-[94dvh] sm:rounded-none sm:border sm:border-line">
        <header className="band relative isolate shrink-0 overflow-hidden border-t-4 border-t-red px-5 pb-7 pt-5 text-white sm:px-10 sm:pb-9 sm:pt-7">
          <UnitedRule />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/75">
              <span className="h-[3px] w-5 bg-red" aria-hidden />
              {isNews ? `${chapterName} newsletter` : meta.label}
            </div>
            <div className="flex items-center gap-1">
              {onEdit && (
                <Button variant="ghost" size="sm" onClick={onEdit} className="text-white hover:bg-surface-2" leftIcon={<Pencil className="size-4" />}>
                  Edit
                </Button>
              )}
              <button
                id="reader-close"
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-9 place-items-center rounded-none text-white/80 transition-colors hover:bg-surface-2 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>
          {isNews && issue != null && (
            <div className="relative mt-6 font-display text-sm font-semibold text-white/70">
              Issue <span className="tabular text-white">{issue}</span> · {formatDate(post.created_at)}
            </div>
          )}
          <h1 id="reader-title" className="relative mt-2 max-w-2xl text-[1.75rem] font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
            {post.title}
          </h1>
          <div className="relative mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/80">
            <Avatar src={post.author?.avatar_url} name={post.author?.display_name ?? 'Former member'} size="sm" ring />
            <span>
              <span className="font-semibold text-white">{post.author?.display_name ?? 'Former member'}</span>
              {authorRole && authorRole !== 'member' && <span className="text-white/60"> · {ROLE_LABELS[authorRole]}</span>}
            </span>
            {!isNews && <span className="text-white/60">{formatDate(post.created_at, true)}</span>}
            {isNews && (
              <span className="text-white/70">
                {readingMinutes(post.body)} min read
              </span>
            )}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-5 py-7 sm:px-10 sm:py-9">
            {(post.event || post.pinned) && (
              <div className="mb-5 flex flex-wrap gap-2">
                {post.pinned && <Badge tone="red">Pinned</Badge>}
                <EventTag event={post.event} />
              </div>
            )}
            {post.body ? (
              <Markdown text={post.body} size={isNews ? 'lg' : 'md'} />
            ) : (
              !post.url && <p className="text-muted">No message.</p>
            )}
            {post.url && (
              <div className="mt-6">
                <LinkPreview url={post.url} />
              </div>
            )}
            {isNews && (
              <div className="mt-10 flex items-center gap-3 border-t border-line pt-5 text-sm text-muted">
                <span className="h-[3px] w-6 bg-red" aria-hidden />
                From the {chapterName} executive team
              </div>
            )}
          </div>
        </div>
      </article>
    </div>,
    document.body,
  );
}
