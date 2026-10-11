// Audit log: every sensitive change (roles, bans, removals, trainers, deleted chapters, owner access, feedback
// triage, email lookups), append-only in fbla_audit_log (0104). Searchable by action, text and time window.
import { useEffect, useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import { Badge, Button, EmptyState, Input, Select, Table, TBody, TD, TH, THead, TR } from '../../components/ui';
import type { AuditRow } from '../../api/owner';
import { auditActionLabel, auditChange, auditSource } from '../../lib/owner';
import { LoadState, useLoad, useOwnerSource, when } from './shared';

const WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
  { value: '730', label: 'Last 2 years' },
];

const PAGE = 50;

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
  const [limit, setLimit] = useState(PAGE);
  const query = useDebounced(q.trim());
  const state = useLoad(
    () => src.auditSearch({ days: Number(days), action: action || null, q: query, limit }),
    `audit:${days}:${action}:${query}:${limit}:${refreshKey}`,
  );
  useEffect(() => setLimit(PAGE), [days, action, query]);

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
        {(d) =>
          d.rows.length === 0 ? (
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
                {d.total === 1 ? '1 entry' : `${d.total.toLocaleString('en-CA')} entries`}
              </p>
              <AuditTable rows={d.rows} />
              {d.total > d.rows.length && (
                <Button variant="outline" size="sm" block onClick={() => setLimit((l) => l + PAGE)} loading={state.loading}>
                  Show more ({d.total - d.rows.length} left)
                </Button>
              )}
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

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <Table>
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
                <Badge className="mt-1" tone={source === 'Owner console' ? 'red' : source === 'Database' ? 'neutral' : 'blue'}>
                  {source}
                </Badge>
              </TD>
              <TD className="whitespace-nowrap text-ink">{target(r)}</TD>
              <TD className="min-w-56 text-sm">
                {change && <div className="text-ink">{change}</div>}
                {reason && <div className="text-muted">Reason: {reason}</div>}
                {!change && !reason && <span className="text-muted">None</span>}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
