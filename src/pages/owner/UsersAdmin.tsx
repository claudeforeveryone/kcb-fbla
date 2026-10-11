// Users: find a student by username, display name or user id, and take one of a few safe, reversible actions.
// Every action asks for a written reason, runs through an owner RPC (0106) that checks ownership on the server,
// and lands in the audit log. Email addresses are never listed; looking one up is its own audited action.
import { useEffect, useState } from 'react';
import { Copy, Search, UserRoundSearch } from 'lucide-react';
import { Badge, Button, EmptyState, Input, Modal, Select, Textarea, useToast } from '../../components/ui';
import type { OwnerUserRow } from '../../api/owner';
import { dayLabel, reasonProblem } from '../../lib/owner';
import { ROLE_LABELS, type ChapterRole } from '../../lib/types';
import { dateOnly, LoadState, useLoad, useOwnerSource } from './shared';

type Action =
  | { kind: 'role'; user: OwnerUserRow }
  | { kind: 'ban'; user: OwnerUserRow }
  | { kind: 'unban'; user: OwnerUserRow; chapterId: string; chapterName: string }
  | { kind: 'email'; user: OwnerUserRow };

export function UsersAdmin({ refreshKey }: { refreshKey: number }) {
  const src = useOwnerSource();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [bump, setBump] = useState(0);
  const [action, setAction] = useState<Action | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const state = useLoad(
    () => (query.length >= 2 ? src.userSearch(query) : Promise.resolve([] as OwnerUserRow[])),
    `users:${query}:${refreshKey}:${bump}`,
  );

  return (
    <div className="space-y-4">
      <div className="max-w-xl">
        <Input
          aria-label="Find a student"
          placeholder="Username, display name or user id"
          leftIcon={<Search className="size-4" />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={60}
          hint="Results show profile basics only. Emails stay hidden unless you look one up with a reason."
        />
      </div>
      {query.length < 2 ? (
        <EmptyState
          compact
          icon={<UserRoundSearch />}
          title="Search for a student"
          description="Type at least 2 characters. Exact usernames and user ids come first."
        />
      ) : (
        <LoadState state={state} skeleton="table">
          {(rows) =>
            rows.length === 0 ? (
              <EmptyState compact title="No one matches" description={`Nothing for "${query}". Check the spelling or paste a user id.`} />
            ) : (
              <ul className="space-y-3" aria-label="Students">
                {rows.map((u) => (
                  <UserCard key={u.user_id} user={u} onAction={setAction} />
                ))}
              </ul>
            )
          }
        </LoadState>
      )}
      {action && (
        <ActionDialog
          action={action}
          onClose={() => setAction(null)}
          onDone={() => {
            setBump((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

export function UserCard({ user: u, onAction }: { user: OwnerUserRow; onAction: (a: Action) => void }) {
  const role = u.chapter_role;
  const canRole = !!u.chapter_id && role !== 'president';
  const canBan = !!u.chapter_id && (role === 'member' || role === 'trainer');
  return (
    <li className="border border-line bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="truncate font-display text-base font-bold text-heading">{u.display_name}</div>
          <div className="truncate text-sm text-muted">@{u.username}</div>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <div>
              <dt className="inline text-muted">Joined </dt>
              <dd className="inline text-ink">{dateOnly(u.created_at)}</dd>
            </div>
            <div>
              <dt className="inline text-muted">Last seen </dt>
              <dd className="inline text-ink">{dayLabel(u.last_seen_at)}</dd>
            </div>
            <div>
              <dt className="inline text-muted">Chapter </dt>
              <dd className="inline text-ink">
                {u.chapter_name ? (
                  <>
                    {u.chapter_name} {role && <Badge className="ml-1 h-5" tone={role === 'president' ? 'red' : 'neutral'}>{ROLE_LABELS[role]}</Badge>}
                  </>
                ) : (
                  'None'
                )}
              </dd>
            </div>
          </dl>
          {u.bans.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Chapter bans">
              {u.bans.map((b) => (
                <li key={b.chapter_id} className="inline-flex items-center gap-2 border border-red/25 bg-red/[0.04] py-1 pl-2 pr-1 text-xs">
                  <span className="text-ink">Banned from {b.chapter_name}</span>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => onAction({ kind: 'unban', user: u, chapterId: b.chapter_id, chapterName: b.chapter_name })}
                  >
                    Lift ban
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {canRole && (
            <Button size="sm" variant="outline" onClick={() => onAction({ kind: 'role', user: u })}>
              Change role
            </Button>
          )}
          {canBan && (
            <Button size="sm" variant="danger" onClick={() => onAction({ kind: 'ban', user: u })}>
              Ban from chapter
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onAction({ kind: 'email', user: u })}>
            Look up email
          </Button>
        </div>
      </div>
    </li>
  );
}

const ROLE_CHOICES: { value: Exclude<ChapterRole, 'president'>; label: string }[] = [
  { value: 'executive', label: 'Executive' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'member', label: 'Member' },
];

function ActionDialog({ action, onClose, onDone }: { action: Action; onClose: () => void; onDone: () => void }) {
  const src = useOwnerSource();
  const toast = useToast();
  const u = action.user;
  const [reason, setReason] = useState('');
  const [role, setRole] = useState<Exclude<ChapterRole, 'president'>>(
    u.chapter_role && u.chapter_role !== 'president' ? u.chapter_role : 'member',
  );
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const problem = reasonProblem(reason);

  const copy = {
    role: {
      title: `Change ${u.display_name}'s role`,
      description: `In ${u.chapter_name}. They get a notification with their new role.`,
      confirm: 'Change role',
    },
    ban: {
      title: `Ban ${u.display_name} from ${u.chapter_name}?`,
      description: 'They leave the chapter and cannot rejoin until the ban is lifted. Their notification includes your reason.',
      confirm: 'Ban from chapter',
    },
    unban: {
      title: `Lift ${u.display_name}'s ban?`,
      description: action.kind === 'unban' ? `They can join ${action.chapterName} again with its code or an invite link.` : '',
      confirm: 'Lift ban',
    },
    email: {
      title: `Look up ${u.display_name}'s email`,
      description: 'Only for support, such as answering their message. The lookup and your reason go in the audit log.',
      confirm: 'Show email',
    },
  }[action.kind];

  const run = async () => {
    setTouched(true);
    if (problem) return;
    setBusy(true);
    try {
      if (action.kind === 'role') {
        const res = await src.setChapterRole(u.user_id, u.chapter_id as string, role, reason);
        toast.success(res.changed ? 'Role changed' : 'No change', res.changed ? `${u.display_name} is now ${ROLE_LABELS[role]}.` : 'They already had that role.');
      } else if (action.kind === 'ban') {
        await src.setChapterBan(u.user_id, u.chapter_id as string, true, reason);
        toast.success('Banned', `${u.display_name} was removed from ${u.chapter_name}.`);
      } else if (action.kind === 'unban') {
        await src.setChapterBan(u.user_id, action.chapterId, false, reason);
        toast.success('Ban lifted', `${u.display_name} can rejoin ${action.chapterName}.`);
      } else {
        setEmail(await src.supportEmail(u.user_id, reason));
        onDone();
        return;
      }
      onDone();
      onClose();
    } catch (e) {
      toast.error('That did not work', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  if (action.kind === 'email' && email !== undefined) {
    return (
      <Modal
        open
        onClose={onClose}
        title={`${u.display_name}'s email`}
        description="This lookup is in the audit log."
        size="sm"
        footer={<Button onClick={onClose}>Done</Button>}
      >
        {email ? (
          <div className="flex items-center gap-2 border border-line bg-surface-2 px-3 py-2">
            <span className="min-w-0 flex-1 break-all font-mono text-sm text-ink">{email}</span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Copy email"
              onClick={() => {
                void navigator.clipboard?.writeText(email).then(() => toast.success('Copied'));
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">This account has no email address on file.</p>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={copy.title}
      description={copy.description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={action.kind === 'ban' ? 'accent' : 'primary'} onClick={run} loading={busy}>
            {copy.confirm}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action.kind === 'role' && (
          <Select label="New role" value={role} onChange={(e) => setRole(e.target.value as typeof role)} options={ROLE_CHOICES} />
        )}
        <Textarea
          label="Reason"
          hint={action.kind === 'ban' ? 'The student sees this in their notification.' : 'Kept in the audit log.'}
          error={touched ? problem : undefined}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={240}
          data-autofocus
        />
      </div>
    </Modal>
  );
}
