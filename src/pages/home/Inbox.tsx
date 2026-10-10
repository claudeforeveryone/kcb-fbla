import { Link } from 'react-router-dom';
import { BookOpenCheck, CheckCircle2, ChevronRight, ClipboardList, FileText, Inbox as InboxIcon, Swords } from 'lucide-react';
import { Avatar, Badge, ButtonLink, Card, CardHeader, EmptyState, ErrorState, Skeleton, cn, formatUntil } from '../../components/ui';
import { eventInfo, eventName } from '../../lib/types';
import { dueLabel, type AssignmentItem, type DuelItem } from './homeData';

/** "Waiting on you": duel challenges and chapter assignments in one to-do list. */
export function Inbox({
  duels,
  assignments,
  hasChapter,
  loading,
  error,
  onRetry,
}: {
  duels: DuelItem[] | undefined;
  assignments: AssignmentItem[] | undefined;
  hasChapter: boolean;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const d = duels ?? [];
  const a = assignments ?? [];
  const actionable = d.filter((x) => x.state !== 'waiting').length + a.filter((x) => !x.done).length;

  return (
    <Card>
      <CardHeader
        icon={<InboxIcon className="size-[18px]" />}
        title={
          <span className="inline-flex items-center gap-2">
            Waiting on you
            {actionable > 0 && (
              <Badge tone="red" solid className="tabular h-5 px-2">
                {actionable}
              </Badge>
            )}
          </span>
        }
        subtitle="Duel challenges and chapter assignments"
        action={
          <Link to="/arena" className="link text-sm">
            Arena
          </Link>
        }
      />
      {error && !duels ? (
        <ErrorState title="Couldn't load your to-dos" error={error} onRetry={onRetry} className="py-6" />
      ) : loading && !duels ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl p-2">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : d.length === 0 && a.length === 0 ? (
        <EmptyState
          compact
          icon={<Swords />}
          title="All caught up"
          description={
            hasChapter
              ? 'No open duels or assignments. Challenge a friend to a 10-question duel.'
              : 'No open duels. Challenge someone, or join a chapter to get assignments from your execs.'
          }
          action={
            <>
              <ButtonLink to="/arena" size="sm" leftIcon={<Swords className="size-4" />}>
                Start a duel
              </ButtonLink>
              {!hasChapter && (
                <ButtonLink to="/chapter" size="sm" variant="outline">
                  Find a chapter
                </ButtonLink>
              )}
            </>
          }
        />
      ) : (
        <ul className="-mx-2 divide-y divide-line">
          {d.map((x) => (
            <DuelRow key={x.duel.id} item={x} />
          ))}
          {a.map((x) => (
            <AssignmentRow key={x.id} item={x} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function DuelRow({ item }: { item: DuelItem }) {
  const { duel, opponent, state } = item;
  const name = opponent?.display_name || opponent?.username || 'A player';
  const ev = eventInfo(duel.event);
  const copy =
    state === 'incoming' ? (
      <>
        <strong className="font-semibold text-heading">{name}</strong> challenged you
      </>
    ) : state === 'yourTurn' ? (
      <>
        Your turn vs <strong className="font-semibold text-heading">{name}</strong>
      </>
    ) : (
      <>
        Waiting on <strong className="font-semibold text-heading">{name}</strong>
      </>
    );
  return (
    <li>
      <Link
        to={`/arena/${duel.id}`}
        className="group flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-surface-2"
      >
        <span className="relative">
          <Avatar src={opponent?.avatar_url} name={name} size="md" />
          <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-red text-white ring-2 ring-surface">
            <Swords className="size-3" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{copy}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>{ev?.name ?? eventName(duel.event)}</span>
            <span aria-hidden>·</span>
            <span className="tabular">Expires in {formatUntil(duel.expires_at)}</span>
          </div>
        </div>
        {state === 'waiting' ? (
          <Badge tone="neutral">Waiting</Badge>
        ) : (
          <span
            className={cn(
              'inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-sm font-bold text-white transition-colors',
              state === 'incoming' ? 'bg-red group-hover:bg-red-2' : 'bg-navy group-hover:bg-navy-2 dark:bg-blue',
            )}
          >
            {state === 'incoming' ? 'Respond' : 'Play'}
          </span>
        )}
      </Link>
    </li>
  );
}

const KIND_ICON = { test: ClipboardList, deck: BookOpenCheck, official: FileText } as const;
const KIND_LABEL = { test: 'Chapter test', deck: 'Flashcard deck', official: 'Official practice' } as const;

function AssignmentRow({ item }: { item: AssignmentItem }) {
  const Icon = KIND_ICON[item.kind] ?? ClipboardList;
  const due = dueLabel(item.due_at);
  return (
    <li>
      <Link
        to={`/chapter/classroom?assignment=${item.id}`}
        className={cn('group flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-surface-2', item.done && 'opacity-70')}
      >
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl',
            item.done ? 'bg-success/12 text-success' : 'bg-blue/10 text-blue dark:text-link',
          )}
        >
          {item.done ? <CheckCircle2 className="size-5" /> : <Icon className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn('truncate text-sm font-semibold text-heading', item.done && 'line-through decoration-muted/60')}>
            {item.title}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>{KIND_LABEL[item.kind]}</span>
            {item.event && (
              <>
                <span aria-hidden>·</span>
                <span>{eventName(item.event)}</span>
              </>
            )}
          </div>
        </div>
        {item.done ? (
          <Badge tone="success">Done</Badge>
        ) : (
          <Badge tone={due.tone === 'neutral' ? 'neutral' : due.tone} className="max-sm:hidden">
            {due.text}
          </Badge>
        )}
        <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </Link>
      {!item.done && (
        <div className="-mt-2 pb-2 pl-[3.75rem] sm:hidden">
          <Badge tone={due.tone === 'neutral' ? 'neutral' : due.tone}>{due.text}</Badge>
        </div>
      )}
    </li>
  );
}
