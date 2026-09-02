'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useApi } from '@/lib/hook';
import { usePageTitle } from '@/lib/use-page-title';
import { FollowUp } from '@/lib/types';
import { Spinner, EmptyState, Badge, TableSkeleton, formatDate } from '@/components/ui';
import { CallButton } from '@/components/call-button';
import { api } from '@/lib/client';

type Section = 'overdue' | 'today' | 'upcoming' | 'completed';

export default function FollowUpsPage() {
  usePageTitle('My Day — Follow-ups');
  // Cache-buster so every section reloads after any mutation.
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const upcomingFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const upcomingTo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, []);

  const overdue = useApi<FollowUp[]>(`/followups/overdue?_r=${tick}`);
  const today = useApi<FollowUp[]>(`/followups/today?_r=${tick}`);
  const upcoming = useApi<FollowUp[]>(
    `/followups/range?from=${encodeURIComponent(upcomingFrom)}&to=${encodeURIComponent(upcomingTo)}&_r=${tick}`,
  );
  const completedList = useApi<{ items: FollowUp[] }>(`/followups?limit=50&_r=${tick}`);

  const loading = overdue.loading || today.loading || upcoming.loading;
  const error = overdue.error || today.error || upcoming.error;

  const completed = useMemo(
    () =>
      (completedList.data?.items ?? [])
        .filter((f) => f.isDone)
        .sort((a, b) =>
          a.completedAt && b.completedAt ? (a.completedAt < b.completedAt ? 1 : -1) : 0,
        ),
    [completedList.data],
  );

  async function toggleDone(f: FollowUp) {
    await api(`/followups/${f.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isDone: !f.isDone }),
    }).catch(() => {});
    refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Day</h1>
        <p className="text-sm text-slate-500">
          Overdue first, then today — complete or call without leaving this page.
        </p>
      </div>

      {loading && <TableSkeleton rows={5} cols={4} />}
      {error && <EmptyState title="Could not load follow-ups" description={error} />}

      {!loading && !error && (
        <>
          <FollowUpSection
            title={`Overdue (${overdue.data?.length ?? 0})`}
            tone="red"
            label="Overdue"
            items={overdue.data ?? []}
            empty="Nothing overdue. Great job!"
            onToggle={toggleDone}
          />
          <FollowUpSection
            title={`Due today (${today.data?.length ?? 0})`}
            tone="amber"
            label="Today"
            items={today.data ?? []}
            empty="No follow-ups left for today."
            onToggle={toggleDone}
          />
          <FollowUpSection
            title={`Next 7 days (${upcoming.data?.length ?? 0})`}
            tone="blue"
            label="Upcoming"
            items={(upcoming.data ?? []).filter((f) => !f.isDone)}
            empty="No upcoming follow-ups scheduled."
            onToggle={toggleDone}
          />
          <details className="rounded-xl border border-slate-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Recently completed ({completed.length})
            </summary>
            <div className="border-t border-slate-100">
              {completed.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">No completed follow-ups yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {completed.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium text-slate-900">{f.customer?.name ?? '—'}</span>
                        <span className="ml-2 text-slate-500">{f.title ?? ''}</span>
                        <span className="ml-2 text-xs text-slate-400">done {formatDate(f.completedAt)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {f.lead?.id && <CallButton leadId={f.lead.id} />}
                        {f.lead?.id && (
                          <Link href={`/leads/${f.lead.id}`} className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">
                            Open
                          </Link>
                        )}
                        <button
                          onClick={() => toggleDone(f)}
                          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Reopen
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function FollowUpSection({
  title,
  tone,
  label,
  items,
  empty,
  onToggle,
}: {
  title: string;
  tone: 'red' | 'amber' | 'blue';
  label: string;
  items: FollowUp[];
  empty: string;
  onToggle: (f: FollowUp) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {f.customer?.name ?? '—'}
                    {f.customer?.phone && (
                      <a href={`tel:${f.customer.phone}`} className="ml-2 text-xs font-normal text-slate-400 hover:text-emerald-600">
                        {f.customer.phone}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{f.title ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(f.scheduledFor)}</td>
                  <td className="px-4 py-3 text-slate-600">{f.agent?.fullName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center justify-end gap-1.5">
                      <Badge tone={tone}>{label}</Badge>
                      {f.lead?.id && <CallButton leadId={f.lead.id} />}
                      {f.lead?.id && (
                        <Link
                          href={`/leads/${f.lead.id}`}
                          className="inline-flex rounded-lg border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Handle
                        </Link>
                      )}
                      <button
                        onClick={() => onToggle(f)}
                        className="inline-flex rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        ✓ Done
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
