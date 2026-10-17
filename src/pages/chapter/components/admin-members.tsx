// Admin > Members: search, roles, remove, ban/unban, add by username, invites.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Search } from 'lucide-react';
import {
  Avatar,
  Badge,
  ScrollRow,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Dropdown,
  EloBadge,
  EmptyState,
  Input,
  Modal,
  Pill,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  errorMessage,
  useToast,
  type DropdownItem,
} from '../../../components/ui';
import { ROLE_LABELS, type ChapterRole, type Profile } from '../../../lib/types';
import { searchProfiles } from '../../../api/core';
import {
  addMemberByUsername,
  banMember,
  relativeDay,
  removeMember,
  setRole,
  unbanMember,
  type AssignableRole,
  type BanWithProfile,
  type RosterMember,
} from '../../../api/chapter';
import { InviteCard, RoleBadge, ROLE_ORDER, fmt } from './admin-shared';

type Props = {
  chapterId: string;
  chapterName: string;
  myId: string;
  myRole: ChapterRole;
  members: RosterMember[] | undefined;
  bans: BanWithProfile[] | undefined;
  loading: boolean;
  onChanged: () => void;
};

type SortKey = 'name' | 'role' | 'elo' | 'active' | 'joined';

export function MembersPanel({ chapterId, chapterName, myId, myRole, members, bans, loading, onChanged }: Props) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<ChapterRole | 'all'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'role', dir: 'desc' });
  const [addOpen, setAddOpen] = useState(false);
  const [removeT, setRemoveT] = useState<RosterMember | null>(null);
  const [banT, setBanT] = useState<RosterMember | null>(null);
  const [unbanT, setUnbanT] = useState<BanWithProfile | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: members?.length ?? 0 };
    for (const m of members ?? []) c[m.role] = (c[m.role] ?? 0) + 1;
    return c;
  }, [members]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (members ?? []).filter(
      (m) =>
        (roleFilter === 'all' || m.role === roleFilter) &&
        (!needle ||
          m.profile.display_name.toLowerCase().includes(needle) ||
          m.profile.username.includes(needle.replace(/^@/, ''))),
    );
    const rank = (r: ChapterRole) => 3 - ROLE_ORDER.indexOf(r);
    const val = (m: RosterMember): number | string => {
      switch (sort.key) {
        case 'name':
          return m.profile.display_name.toLowerCase();
        case 'role':
          return rank(m.role) * 100000 + m.profile.elo;
        case 'elo':
          return m.profile.elo;
        case 'active':
          return m.profile.last_active_date ? new Date(m.profile.last_active_date).getTime() : 0;
        case 'joined':
          return new Date(m.joined_at).getTime();
      }
    };
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === 'asc' ? c : -c;
    });
  }, [members, q, roleFilter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const sortOf = (key: SortKey) => (sort.key === key ? sort.dir : null);

  const canManage = (m: RosterMember) =>
    m.user_id !== myId && m.role !== 'president' && (myRole === 'president' || m.role !== 'executive');

  const changeRole = async (m: RosterMember, role: AssignableRole) => {
    try {
      await setRole(chapterId, m.user_id, role);
      toast.success(`${m.profile.display_name} is now ${role === 'executive' ? 'an' : 'a'} ${ROLE_LABELS[role].toLowerCase()}`);
      onChanged();
    } catch (e) {
      toast.error('Could not change the role', errorMessage(e));
    }
  };

  const menuFor = (m: RosterMember): DropdownItem[] => {
    const roleItems: DropdownItem[] = (['executive', 'trainer', 'member'] as AssignableRole[])
      .filter((r) => r !== m.role && (r !== 'executive' || myRole === 'president'))
      .map((r) => ({
        label: r === 'member' ? 'Make member' : `Make ${ROLE_LABELS[r].toLowerCase()}`,
        hint: r === 'member' && m.role === 'trainer' ? 'Clears event assignments' : undefined,
        onSelect: () => void changeRole(m, r),
      }));
    return [
      { label: 'View stats', to: `/chapter/member/${m.user_id}` },
      ...(canManage(m)
        ? ([
            { type: 'separator' },
            { type: 'label', label: 'Role' },
            ...roleItems,
            { type: 'separator' },
            { label: 'Remove from chapter', danger: true, onSelect: () => setRemoveT(m) },
            { label: 'Ban', danger: true, onSelect: () => setBanT(m) },
          ] as DropdownItem[])
        : []),
    ];
  };

  return (
    <div className="space-y-6">
      <InviteCard chapterId={chapterId} />

      <Card as="section" padded={false} className="overflow-hidden">
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardHeader
              className="mb-0"
              title="Members"
              subtitle={members ? `${members.length} in ${chapterName}` : undefined}
            />
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              Add by username
            </Button>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative md:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or @username"
                aria-label="Search members"
                className="h-10 w-full rounded-[4px] border border-line-strong bg-surface pl-9 pr-3 text-[0.9375rem] outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15"
              />
            </div>
            <ScrollRow className="-mx-1 gap-1.5 px-1 pb-1 md:pb-0">
              {(['all', ...ROLE_ORDER] as const).map((r) => (
                <Pill key={r} active={roleFilter === r} onClick={() => setRoleFilter(r)} count={counts[r] ?? 0}>
                  {r === 'all' ? 'Everyone' : `${ROLE_LABELS[r]}s`}
                </Pill>
              ))}
            </ScrollRow>
          </div>
        </div>

        {loading && !members ? (
          <div className="space-y-2 px-5 pb-5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            title="No one matches"
            description={q ? `Nobody called "${q}" in this filter.` : 'No members with this role yet.'}
            action={
              <Button variant="secondary" size="sm" onClick={() => { setQ(''); setRoleFilter('all'); }}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH sort={sortOf('name')} onSort={() => toggleSort('name')}>Member</TH>
                <TH className="max-sm:hidden" sort={sortOf('role')} onSort={() => toggleSort('role')}>Role</TH>
                <TH align="right" className="max-sm:hidden" sort={sortOf('elo')} onSort={() => toggleSort('elo')}>Elo</TH>
                <TH className="max-md:hidden" sort={sortOf('active')} onSort={() => toggleSort('active')}>Last practised</TH>
                <TH className="max-lg:hidden" sort={sortOf('joined')} onSort={() => toggleSort('joined')}>Joined</TH>
                <TH align="right" className="relative"><span className="sr-only">Actions</span></TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((m) => (
                <TR key={m.user_id} highlight={m.user_id === myId}>
                  <TD>
                    <Link to={`/chapter/member/${m.user_id}`} className="flex min-w-0 items-center gap-3 hover:underline">
                      <Avatar src={m.profile.avatar_url} name={m.profile.display_name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-heading">
                          {m.profile.display_name}
                          {m.user_id === myId && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
                        </span>
                        <span className="block truncate text-xs text-muted">@{m.profile.username}</span>
                        {/* Phones: role and Elo move under the name so the row fits without sideways scrolling.
                            Role changes are in the Manage menu. */}
                        <span className="mt-1 flex items-center gap-2 sm:hidden">
                          <RoleBadge role={m.role} />
                          <span className="tabular text-xs font-semibold text-muted">{fmt(m.profile.elo)} Elo</span>
                        </span>
                      </span>
                    </Link>
                  </TD>
                  <TD className="max-sm:hidden">
                    {canManage(m) ? (
                      <RolePicker m={m} myRole={myRole} onPick={(r) => void changeRole(m, r)} />
                    ) : (
                      <RoleBadge role={m.role} />
                    )}
                  </TD>
                  <TD align="right" className="max-sm:hidden">
                    <EloBadge elo={m.profile.elo} size="sm" />
                  </TD>
                  <TD className="max-md:hidden text-sm text-muted">{relativeDay(m.profile.last_active_date)}</TD>
                  <TD className="max-lg:hidden text-sm text-muted">
                    {new Date(m.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </TD>
                  <TD align="right">
                    <Dropdown
                      trigger={({ open: _open, ...p }) => (
                        <Button {...p} size="xs" variant="ghost" rightIcon={<ChevronDown className="size-3.5" />}>
                          Manage
                        </Button>
                      )}
                      items={menuFor(m)}
                      header={
                        <div className="px-3 py-2 text-xs text-muted">
                          {m.profile.display_name} · {fmt(m.profile.questions_answered)} answered
                        </div>
                      }
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <BansCard bans={bans} loading={loading} onUnban={setUnbanT} />

      <AddMemberModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        chapterId={chapterId}
        onAdded={() => {
          onChanged();
        }}
      />

      <ConfirmDialog
        open={removeT != null}
        onClose={() => setRemoveT(null)}
        variant="danger"
        title={`Remove ${removeT?.profile.display_name ?? ''}?`}
        description="They leave the chapter and lose access to its classroom. Their own stats are kept, and they can rejoin with a code or invite link."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removeT) return;
          try {
            await removeMember(chapterId, removeT.user_id);
            toast.success(`${removeT.profile.display_name} was removed`);
            onChanged();
          } catch (e) {
            toast.error('Could not remove', errorMessage(e));
            throw e;
          }
        }}
      />

      <BanModal
        target={banT}
        onClose={() => setBanT(null)}
        onBan={async (reason) => {
          if (!banT) return;
          await banMember(chapterId, banT.user_id, reason);
          toast.success(`${banT.profile.display_name} was banned`, 'They have been removed and cannot rejoin until unbanned.');
          onChanged();
        }}
      />

      <ConfirmDialog
        open={unbanT != null}
        onClose={() => setUnbanT(null)}
        title={`Lift the ban on ${unbanT?.profile?.display_name ?? 'this player'}?`}
        description="They will be able to join again with the join code or an invite link. They are not added back automatically."
        confirmLabel="Unban"
        onConfirm={async () => {
          if (!unbanT) return;
          try {
            await unbanMember(chapterId, unbanT.user_id);
            toast.success('Ban lifted');
            onChanged();
          } catch (e) {
            toast.error('Could not unban', errorMessage(e));
            throw e;
          }
        }}
      />

    </div>
  );
}

function RolePicker({ m, myRole, onPick }: { m: RosterMember; myRole: ChapterRole; onPick: (r: AssignableRole) => void }) {
  const options = (['executive', 'trainer', 'member'] as AssignableRole[]).filter((r) => r !== 'executive' || myRole === 'president');
  return (
    <Dropdown
      align="start"
      width="w-56"
      trigger={({ open: _open, ...p }) => (
        <button
          {...p}
          className="inline-flex items-center gap-1 rounded-[2px] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          aria-label={`Change role for ${m.profile.display_name}, currently ${ROLE_LABELS[m.role]}`}
        >
          <RoleBadge role={m.role} />
          <ChevronDown className="size-3.5 text-muted" aria-hidden />
        </button>
      )}
      items={options.map((r) => ({
        label: ROLE_LABELS[r],
        hint:
          r === m.role
            ? 'Current'
            : r === 'executive'
              ? 'Full admin access'
              : r === 'trainer'
                ? 'Leads prep for events'
                : m.role === 'trainer'
                  ? 'Clears event assignments'
                  : undefined,
        disabled: r === m.role,
        onSelect: () => onPick(r),
      }))}
    />
  );
}

function BansCard({ bans, loading, onUnban }: { bans: BanWithProfile[] | undefined; loading: boolean; onUnban: (b: BanWithProfile) => void }) {
  return (
    <Card as="section">
      <CardHeader
        title="Banned players"
        subtitle="Banned players are removed and can't rejoin with the code or a link."
        action={bans && bans.length > 0 ? <Badge tone="red">{bans.length}</Badge> : undefined}
      />
      {loading && !bans ? (
        <Skeleton className="h-12 w-full" />
      ) : !bans || bans.length === 0 ? (
        <p className="text-sm text-muted">No one is banned.</p>
      ) : (
        <ul className="divide-y divide-line">
          {bans.map((b) => (
            <li key={b.user_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar src={b.profile?.avatar_url} name={b.profile?.display_name ?? '?'} size="sm" />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-heading">
                    {b.profile?.display_name ?? 'Deleted player'}{' '}
                    {b.profile && <span className="text-xs font-normal text-muted">@{b.profile.username}</span>}
                  </div>
                  <div className="text-xs text-muted">
                    {b.reason ? <span className="text-ink">"{b.reason}"</span> : 'No reason given'} · {relativeDay(b.created_at)}
                    {b.banned_by_name ? ` by ${b.banned_by_name}` : ''}
                  </div>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onUnban(b)}>
                Unban
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BanModal({ target, onClose, onBan }: { target: RosterMember | null; onClose: () => void; onBan: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (target) setReason('');
  }, [target]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onBan(reason);
      onClose();
    } catch (err) {
      toast.error('Could not ban', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={target != null}
      onClose={busy ? () => {} : onClose}
      title={`Ban ${target?.profile.display_name ?? ''}?`}
      description="They are removed from the chapter right away and can't rejoin until you lift the ban. They'll get a notification with your reason."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" type="submit" form="ban-form" loading={busy}>
            Ban member
          </Button>
        </>
      }
    >
      <form id="ban-form" onSubmit={submit}>
        <Textarea
          label="Reason"
          hint="Optional, but it helps. Shown to the member and to other executives."
          value={reason}
          maxLength={500}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Repeatedly sharing answers during chapter tests"
        />
      </form>
    </Modal>
  );
}

function AddMemberModal({ open, onClose, chapterId, onAdded }: { open: boolean; onClose: () => void; chapterId: string; onAdded: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) {
      setQ('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim().replace(/^@/, '');
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let live = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchProfiles(term, 8)
        .then((r) => live && setResults(r))
        .catch(() => live && setResults([]))
        .finally(() => live && setSearching(false));
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const add = async (username: string) => {
    setAdding(username);
    try {
      await addMemberByUsername(chapterId, username);
      toast.success(`@${username} added`, "They'll get a notification.");
      onAdded();
      onClose();
    } catch (e) {
      toast.error('Could not add', errorMessage(e));
    } finally {
      setAdding(null);
    }
  };

  const exact = q.trim().replace(/^@/, '').toLowerCase();

  return (
    <Modal open={open} onClose={onClose} title="Add a member" description="Search by username or name. Players must already have an FBLA United account and not be in another chapter." size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (/^[a-z0-9_]{3,20}$/.test(exact)) void add(exact);
        }}
      >
        <Input
          label="Username"
          placeholder="@username"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />
      </form>
      <div className="mt-4 min-h-24">
        {searching && results.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : results.length > 0 ? (
          <ul className="divide-y divide-line rounded-[2px] border border-line">
            {results.map((p) => {
              const taken = p.chapter_id != null;
              return (
                <li key={p.id} className="flex items-center gap-3 p-2.5">
                  <Avatar src={p.avatar_url} name={p.display_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-heading">{p.display_name}</div>
                    <div className="truncate text-xs text-muted">
                      @{p.username}
                      {p.school ? ` · ${p.school}` : ''}
                    </div>
                  </div>
                  {p.chapter_id === chapterId ? (
                    <Badge tone="success">Member</Badge>
                  ) : taken ? (
                    <Badge>In a chapter</Badge>
                  ) : (
                    <Button size="sm" loading={adding === p.username} onClick={() => void add(p.username)}>
                      Add
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : exact.length >= 2 ? (
          <p className="text-sm text-muted">No players found for "{exact}".</p>
        ) : (
          <p className="text-sm text-muted">Tip: sharing the invite link is usually faster for a whole class.</p>
        )}
      </div>
    </Modal>
  );
}
