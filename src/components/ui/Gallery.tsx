// Dev-only component gallery at /dev/ui (registered in App.tsx only when import.meta.env.DEV).
import { useState } from 'react';
import { Bell, Flame, Inbox, Plus, Target, Trophy } from 'lucide-react';
import { Page, Section } from '../layout/Page';
import { BarChart, Donut, LineChart, RadarChart, Sparkline } from '../charts';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  CountdownTimer,
  Dropdown,
  EloBadge,
  EmptyState,
  ErrorState,
  Input,
  Kbd,
  Modal,
  PageHeader,
  Pill,
  ProgressBar,
  ProgressRing,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonCards,
  StatTile,
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tabs,
  Textarea,
  Tooltip,
  TIERS,
  useToast,
} from '.';

const days = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 8, 20 + i)).toISOString());

export default function Gallery() {
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [seg, setSeg] = useState<'week' | 'month' | 'all'>('week');
  const [on, setOn] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pill, setPill] = useState('all');

  return (
    <>
      <PageHeader
        eyebrow="Design system"
        title="Component gallery"
        subtitle="Every shared UI piece, in one place."
        actions={
          <>
            <Button variant="inverse" leftIcon={<Plus className="size-4" />}>Inverse</Button>
            <Button variant="accent">Accent</Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <EloBadge elo={1234} onDark />
          <CountdownTimer seconds={95} variant="onDark" />
        </div>
      </PageHeader>
      <Page>
        <Section title="Buttons">
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Loading</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" variant="outline" aria-label="Bell"><Bell className="size-4" /></Button>
          </div>
        </Section>
        <Section title="Badges, avatars, tiers">
          <div className="flex flex-wrap items-center gap-2">
            {(['neutral', 'navy', 'red', 'blue', 'success', 'warning'] as const).map((t) => (
              <Badge key={t} tone={t} dot>{t}</Badge>
            ))}
            <Badge tone="red" solid>Live</Badge>
            <Avatar name="Maya Chen" size="sm" />
            <Avatar name="Jordan Lee" />
            <Avatar name="Sam Patel" size="lg" />
            {TIERS.map((t) => <EloBadge key={t.name} elo={t.min + 50} size="sm" />)}
            <Tooltip content="Press K to search"><Kbd>K</Kbd></Tooltip>
          </div>
        </Section>
        <Section title="Stats">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Elo" value="742" delta={18} icon={<Trophy />} chart={<Sparkline values={[600, 640, 630, 700, 742]} />} />
            <StatTile label="Accuracy" value="81%" sub="last 7 days" delta={-3} deltaSuffix="%" icon={<Target />} />
            <StatTile label="Streak" value="12" sub="days" icon={<Flame />} tone="navy" />
            <Card className="flex items-center gap-4">
              <ProgressRing value={72} />
              <div className="flex-1"><ProgressBar value={36} max={50} label="Paper A" showValue tone="red" /></div>
            </Card>
          </div>
        </Section>
        <Section title="Charts">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Elo history" subtitle="Last two weeks" action={<SegmentedControl size="sm" value={seg} onChange={setSeg} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All' }]} />} />
              <LineChart title="Elo over time" series={[{ name: 'You', data: days.map((d, i) => ({ x: d, y: 500 + i * 18 + (i % 3) * 25 })) }, { name: 'Chapter avg', data: days.map((d, i) => ({ x: d, y: 520 + i * 6 })) }]} />
            </Card>
            <Card>
              <CardHeader title="Accuracy by area" />
              <BarChart title="Accuracy by area" max={100} formatValue={(v) => `${v}%`} data={[{ label: 'Financial statements', value: 84, sub: '42/50' }, { label: 'Payroll', value: 61 }, { label: 'Ethics', value: 92 }, { label: 'Inventory', value: 45, highlight: true }]} />
            </Card>
            <Card>
              <CardHeader title="Questions per day" />
              <BarChart title="Questions per day" orientation="vertical" data={days.slice(0, 10).map((d, i) => ({ label: d.slice(5, 10), value: (i * 7) % 23 + 3 }))} />
            </Card>
            <Card>
              <CardHeader title="Answers" />
              <Donut title="Answer split" segments={[{ label: 'Correct', value: 62, color: 'var(--success)' }, { label: 'Wrong', value: 24, color: 'var(--red)' }, { label: 'Skipped', value: 6, color: 'var(--line-strong)' }]} center={<div><div className="font-display text-2xl font-extrabold text-heading">92</div><div className="text-xs text-muted">answers</div></div>} />
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title="Strengths" />
              <RadarChart title="Accuracy by area" axes={['Finance', 'Law', 'Marketing', 'Ethics', 'Economics', 'Management']} series={[{ name: 'You', values: [80, 55, 72, 90, 40, 66] }, { name: 'Chapter', values: [60, 62, 58, 70, 55, 60] }]} />
            </Card>
          </div>
        </Section>
        <Section title="Navigation">
          <Tabs value={tab} onChange={setTab} items={[{ value: 'overview', label: 'Overview' }, { value: 'members', label: 'Members', count: 24 }, { value: 'tests', label: 'Tests' }]} />
          <div className="mt-4 flex flex-wrap gap-2">
            {['all', 'objective', 'case'].map((p) => <Pill key={p} active={pill === p} onClick={() => setPill(p)}>{p}</Pill>)}
            <Tabs variant="pills" value={tab} onChange={setTab} items={[{ value: 'overview', label: 'Overview' }, { value: 'members', label: 'Members' }]} />
            <Dropdown trigger={(p) => <Button variant="outline" {...p}>Menu</Button>} items={[{ label: 'Edit', onSelect: () => toast.info('Edit') }, { type: 'separator' }, { label: 'Delete', danger: true, onSelect: () => setConfirm(true) }]} align="start" />
          </div>
        </Section>
        <Section title="Forms">
          <Card className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" placeholder="Maya" hint="Shown to your chapter." />
            <Input label="Username" error="That username is taken." defaultValue="maya" />
            <Select label="Event" placeholder="Pick one" defaultValue="" options={[{ value: 'a', label: 'Accounting' }, { value: 'm', label: 'Marketing' }]} />
            <Textarea label="Bio" rows={2} />
            <Switch checked={on} onChange={setOn} label="Weekly email" description="A Monday summary of your week." />
            <div className="flex gap-2">
              <Button onClick={() => setModal(true)}>Open modal</Button>
              <Button variant="secondary" onClick={() => toast.success('Saved', 'Your changes are live.')}>Toast</Button>
              <Button variant="danger" onClick={() => toast.error('Could not save')}>Error</Button>
            </div>
          </Card>
        </Section>
        <Section title="Table">
          <Table>
            <THead><tr><TH>#</TH><TH>Player</TH><TH align="right" sort="desc" onSort={() => {}}>Elo</TH></tr></THead>
            <TBody>
              {['Maya Chen', 'Jordan Lee', 'Sam Patel'].map((n, i) => (
                <TR key={n} highlight={i === 1}><TD className="tabular">{i + 1}</TD><TD><span className="flex items-center gap-2"><Avatar name={n} size="sm" />{n}</span></TD><TD align="right">{1300 - i * 120}</TD></TR>
              ))}
            </TBody>
          </Table>
        </Section>
        <Section title="States">
          <div className="grid gap-4 lg:grid-cols-2">
            <EmptyState icon={<Inbox />} title="No assignments yet" description="When an executive assigns a test, it shows up here." action={<Button size="sm">Browse events</Button>} />
            <ErrorState onRetry={() => toast.info('Retrying')} />
            <Card><Skeleton className="mb-3 h-5 w-1/3" /><Skeleton className="h-24" /></Card>
          </div>
          <SkeletonCards className="mt-4" />
        </Section>
      </Page>
      <Modal open={modal} onClose={() => setModal(false)} title="Start a mock exam?" description="100 questions, 50 minutes." footer={<><Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button><Button variant="accent" onClick={() => setModal(false)}>Start</Button></>}>
        <p className="text-sm text-muted">The timer starts as soon as you begin.</p>
      </Modal>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void toast.success('Deleted')} title="Delete this test?" description="This cannot be undone." confirmLabel="Delete" variant="danger" />
    </>
  );
}
