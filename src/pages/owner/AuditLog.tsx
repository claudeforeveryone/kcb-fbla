// Audit log: every sensitive change (roles, bans, removals, admin adds, trainers, deleted chapters, owner access,
// feedback triage, email lookups), append-only in fbla_audit_log (0104). Searchable by action, text and time window.
import { useEffect, useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import { Badge, EmptyState, Input, Select, Table, TBody, TD, TH, THead, TR } from '../../components/ui';
import type { AuditRow } from '../../api/owner';
import { auditActionLabel, auditChange, auditSource } from '../../lib/owner';
import { EmptyValue, LoadState, MoreButton, useOwnerSource, usePaged, when } from './shared';

const WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
  { value: '730', label: 'Last 2 years' },
];

const PAGE = 50;
const rowId = (r: AuditRow) => r.id;

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AuditLog({ refreshKey }: { refreshKey: number }) {
  const src = useOwnerSource();
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [days, setDays] = useState('90');
  const query = useDebounced(q.trim());
  const state = usePaged(
    (offset) => src.auditSearch({ days: Number(days), action: action || null, q: query, limit: PAGE, offset }),
    `audit:${days}:${action}:${query}:${refreshKey}`,
    rowId,
  );

  const actions = state.data?.actions ?? [];
  const actionOptions = [
    { value: '', label: 'All actions' },
    ...[...new Set([...actions, ...(action ? [action] : [])])]
      .map((a) => ({ value: a, label: auditActionLabel(a) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <Input
          aria-label="Search the audit log"
          placeholder="Search by username, action or detail"
          leftIcon={<Search className="size-4" />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={80}
        />
        <Select aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)} options={actionOptions} />
        <Select aria-label="Time window" value={days} onChange={(e) => setDays(e.target.value)} options={WINDOWS} />
      </div>
      <LoadState state={state} skeleton="table">
        {() =>
          state.rows.length === 0 ? (
            <EmptyState
              icon={<ScrollText />}
              title={query || action ? 'No matching entries' : 'No changes logged yet'}
              description={
                query || action
                  ? 'Try a wider time window or a different search.'
                  : 'Role changes, bans, removals and owner actions are recorded here as they happen.'
              }
            />
          ) : (
            <>
              <p className="text-sm text-muted" aria-live="polite">
                {state.total === 1 ? '1 entry' : `${state.total.toLocaleString('en-CA')} entries`}
              </p>
              <AuditCards rows={state.rows} />
              <AuditTable rows={state.rows} />
              <MoreButton state={state} />
            </>
          )
        }
      </LoadState>
    </div>
  );
}

function who(r: AuditRow): string {
  if (r.actor_username) return `@${r.actor_username}`;
  return r.actor_id ? 'Account without a profile' : 'System';
}

function target(r: AuditRow): string {
  if (r.target_username) return `@${r.target_username}`;
  if (r.target_type === 'chapter' && typeof r.detail?.name === 'string') return r.detail.name;
  if (r.target_type === 'feedback') return 'A feedback report';
  if (!r.target_id) return '';
  return `${r.target_type ?? 'item'} ${r.target_id.slice(0, 8)}`;
}

const sourceTone = (source: string): 'red' | 'neutral' | 'blue' => (source === 'Owner console' ? 'red' : source === 'Database' ? 'neutral' : 'blue');

/** Phones: one card per entry (what, when, who, affected, details) instead of a five-column table. */
export function AuditCards({ rows }: { rows: AuditRow[] }) {
  return (
    <ul className="divide-y divide-line border border-line bg-surface sm:hidden" aria-label="Audit log entries">
      {rows.map((r) => {
        const change = auditChange(r.action, r.detail);
        const reason = typeof r.detail?.reason === 'string' ? r.detail.reason : '';
        const source = auditSource(r.action, r.detail, r.actor_id);
        const affected = target(r);
        return (
          <li key={r.id} className="space-y-1.5 p-4 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 font-semibold text-ink">{auditActionLabel(r.action)}</span>
              <span className="shrink-0 text-xs text-muted">{when(r.created_at)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink">
              <span>{who(r)}</span>
              <Badge tone={sourceTone(source)}>{source}</Badge>
              {affected && <span className="text-muted">on {affected}</span>}
            </div>
            {change && <p className="text-ink">{change}</p>}
            {reason && <p className="break-words text-muted">Reason: {reason}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <Table wrapClassName="hidden sm:block">
      <THead>
        <tr>
          <TH>When</TH>
          <TH>What</TH>
          <TH>By</TH>
          <TH>Affected</TH>
          <TH>Details</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((r) => {
          const change = auditChange(r.action, r.detail);
          const reason = typeof r.detail?.reason === 'string' ? r.detail.reason : '';
          const source = auditSource(r.action, r.detail, r.actor_id);
          return (
            <TR key={r.id}>
              <TD className="whitespace-nowrap text-muted">{when(r.created_at)}</TD>
              <TD className="whitespace-nowrap font-medium text-ink">{auditActionLabel(r.action)}</TD>
              <TD className="whitespace-nowrap">
                <div className="text-ink">{who(r)}</div>
                <Badge className="mt-1" tone={sourceTone(source)}>
                  {source}
                </Badge>
              </TD>
              <TD className="whitespace-nowrap text-ink">{target(r)}</TD>
              <TD className="min-w-56 text-sm">
                {change && <div className="text-ink">{change}</div>}
                {reason && <div className="text-muted">Reason: {reason}</div>}
                {!change && !reason && <EmptyValue label="No details" />}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
