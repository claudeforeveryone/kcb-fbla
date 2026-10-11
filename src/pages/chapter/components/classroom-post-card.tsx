import { ArrowUpRight, MoreHorizontal } from 'lucide-react';
import { Avatar, Button, Card, Dropdown, cn, type DropdownItem } from '../../../components/ui';
import { ROLE_LABELS } from '../../../lib/types';
import { track } from '../../../api/track';
import { canDeletePost, canEditPost, type ClassPost, type ClassroomContext } from '../../../api/classroom';
import { excerpt, Markdown, readingMinutes } from './classroom-markdown';
import { EventTag, KindLabel, POST_META, timeAgo } from './classroom-shared';

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function LinkPreview({ url, compact }: { url: string; compact?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => void track('resource_opened', null, { kind: 'link', source: 'classroom' })}
      className={cn(
        'group/link flex min-w-0 items-center gap-3 rounded-[2px] border border-line border-l-4 border-l-blue bg-surface-2 transition-colors hover:border-blue',
        compact ? 'px-3 py-2' : 'px-3.5 py-3',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-heading">{hostOf(url)}</span>
        <span className="block truncate text-xs text-muted">{url.replace(/^https?:\/\//, '')}</span>
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-muted transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5 group-hover/link:text-blue" />
    </a>
  );
}

export function PostCard({
  post,
  ctx,
  roleOf,
  onOpen,
  onEdit,
  onDelete,
  onTogglePin,
  onFilterEvent,
  highlight,
}: {
  post: ClassPost;
  ctx: ClassroomContext;
  roleOf: (userId: string | null) => keyof typeof ROLE_LABELS | null;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onFilterEvent: (event: string) => void;
  highlight?: boolean;
}) {
  const meta = POST_META[post.kind];
  const role = roleOf(post.author_id);
  const canEdit = canEditPost(ctx, post);
  const canDelete = canDeletePost(ctx, post);
  const items: DropdownItem[] = [];
  if (canEdit) {
    items.push({ label: post.pinned ? 'Unpin' : 'Pin to top', onSelect: onTogglePin });
    items.push({ label: 'Edit', onSelect: onEdit });
  }
  if (canDelete) {
    if (items.length) items.push({ type: 'separator' });
    items.push({ label: 'Delete', onSelect: onDelete, danger: true });
  }
  const isNewsletter = post.kind === 'newsletter';
  const long = (post.body?.length ?? 0) > 420 || (post.body?.split('\n').length ?? 0) > 8;
  const edited = new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 60_000;

  return (
    <Card
      as="article"
      padded={false}
      id={`post-${post.id}`}
      className={cn(
        'relative overflow-hidden transition-[box-shadow,border-color] duration-200',
        post.pinned && 'border-navy/40 dark:border-blue/40',
        highlight && 'ring-2 ring-blue',
      )}
    >
      {post.pinned && <span className="absolute inset-y-0 left-0 w-[3px] bg-red" aria-hidden />}
      <div className="flex gap-3.5 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted">
              <Avatar src={post.author?.avatar_url} name={post.author?.display_name ?? 'Former member'} size="xs" />
              <span className="font-semibold text-ink">{post.author?.display_name ?? 'Former member'}</span>
              {role && role !== 'member' && (
                <span className="text-xs font-semibold uppercase tracking-wide text-muted/90">{ROLE_LABELS[role]}</span>
              )}
              <span aria-hidden>·</span>
              <time dateTime={post.created_at} title={new Date(post.created_at).toLocaleString()}>
                {timeAgo(post.created_at)}
              </time>
              {edited && <span className="text-xs">(edited)</span>}
            </div>
            {items.length > 0 && (
              <Dropdown
                width="w-48"
                items={items}
                trigger={({ open: _open, ...p }) => (
                  <Button {...p} variant="ghost" size="icon-sm" aria-label="Post actions" className="-mr-1.5 -mt-1 text-muted">
                    <MoreHorizontal className="size-4" />
                  </Button>
                )}
              />
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <KindLabel label={meta.label} accent={meta.accent} />
            {post.pinned && <KindLabel label="Pinned" accent="border border-red text-red dark:text-danger" />}
            <EventTag event={post.event} onClick={post.event ? () => onFilterEvent(post.event!) : undefined} />
          </div>

          <h3 className="mt-2 text-lg font-bold leading-snug">
            <button type="button" onClick={onOpen} className="text-left hover:text-blue dark:hover:text-link">
              {post.title}
            </button>
          </h3>

          {post.body && (
            isNewsletter ? (
              <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink/85">{excerpt(post.body, 260)}</p>
            ) : (
              <div className={cn('relative mt-1.5', long && 'max-h-52 overflow-hidden')}>
                <Markdown text={post.body} size="sm" />
                {long && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-line" />}
              </div>
            )
          )}

          {post.url && (
            <div className="mt-3">
              <LinkPreview url={post.url} compact={!!post.body} />
            </div>
          )}

          {(isNewsletter || long) && (
            <div className="mt-3 flex items-center gap-3">
              <Button variant={isNewsletter ? 'primary' : 'secondary'} size="sm" onClick={onOpen}>
                {isNewsletter ? 'Read newsletter' : 'Read more'}
              </Button>
              {isNewsletter && (
                <span className="text-xs text-muted">
                  {readingMinutes
(post.body)} min read
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
