import { ArrowUpRight, Clock, ExternalLink, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { Avatar, Badge, Button, Card, Dropdown, cn, type DropdownItem } from '../../../components/ui';
import { ROLE_LABELS } from '../../../lib/types';
import { canDeletePost, canEditPost, type ClassPost, type ClassroomContext } from '../../../api/classroom';
import { excerpt, Markdown, readingMinutes } from './classroom-markdown';
import { EventTag, KindIcon, POST_META, timeAgo } from './classroom-shared';

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
      className={cn(
        'group/link flex min-w-0 items-center gap-3 rounded-[10px] border border-line bg-surface-2/60 transition-colors hover:border-blue/50 hover:bg-surface-2',
        compact ? 'px-3 py-2' : 'px-3.5 py-3',
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-blue ring-1 ring-line dark:text-link">
        <ExternalLink className="size-4" />
      </span>
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
    items.push({ label: post.pinned ? 'Unpin' : 'Pin to top', icon: post.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />, onSelect: onTogglePin });
    items.push({ label: 'Edit', icon: <Pencil className="size-4" />, onSelect: onEdit });
  }
  if (canDelete) {
    if (items.length) items.push({ type: 'separator' });
    items.push({ label: 'Delete', icon: <Trash2 className="size-4" />, onSelect: onDelete, danger: true });
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
        post.pinned && 'border-navy/25 dark:border-blue/40',
        highlight && 'ring-2 ring-blue/60',
      )}
    >
      {post.pinned && <span className="absolute inset-y-0 left-0 w-[3px] bg-red" aria-hidden />}
      <div className="flex gap-3.5 p-4 sm:p-5">
        <div className="hidden sm:block">
          <KindIcon icon={meta.icon} accent={meta.accent} />
        </div>
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
            <Badge tone={meta.tone}>
              <meta.icon className="size-3 sm:hidden" />
              {meta.label}
            </Badge>
            {post.pinned && (
              <Badge tone="red" solid>
                <Pin className="size-3" />
                Pinned
              </Badge>
            )}
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
                {long && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />}
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
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <Clock className="size-3.5" />
                  {readingMinutes(post.body)} min read
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
