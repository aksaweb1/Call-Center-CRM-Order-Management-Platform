'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@/lib/hook';
import { useAuth } from '@/lib/auth';
import { Call, FollowUp, Lead, Note, Order, PageResult, User } from '@/lib/types';
import { Badge, EmptyState, Spinner, formatCurrency, formatDate } from '@/components/ui';
import OrderForm from '@/components/order-form';
import { api } from '@/lib/client';
import { usePageTitle } from '@/lib/use-page-title';
import { useCall } from '@/components/call-context';

const LEAD_STATUSES = [
  'NEW', 'ASSIGNED', 'CALLING', 'INTERESTED', 'NO_ANSWER', 'BUSY',
  'WRONG_NUMBER', 'CALL_BACK_REQUESTED', 'NOT_INTERESTED',
  'ORDER_CREATED', 'CONVERTED', 'CANCELLED', 'INVALID_NUMBER',
];

const TONE: Record<string, string> = {
  CONVERTED: 'green', ORDER_CREATED: 'green', INTERESTED: 'blue',
  NEW: 'blue', ASSIGNED: 'amber', CALLING: 'amber', CALL_BACK_REQUESTED: 'amber',
  NOT_INTERESTED: 'red', CANCELLED: 'red', WRONG_NUMBER: 'red',
  NO_ANSWER: 'slate', BUSY: 'slate', INVALID_NUMBER: 'slate',
};

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canCall = user?.permissions?.includes('call.create') ?? false;
  const canCreateFollowUp = user?.permissions?.includes('followup.create') ?? false;
  const canUpdateFollowUp = user?.permissions?.includes('followup.update') ?? false;
  const canUpdateLead = user?.permissions?.includes('lead.update') ?? false;
  const canCreateOrder = user?.permissions?.includes('order.create') ?? false;
  const canAssign = user?.permissions?.includes('lead.assign') ?? false;
  const canCreateNote = user?.permissions?.includes('note.create') ?? false;

  const lead = useApi<Lead>(id ? `/leads/${id}` : null);
  const calls = useApi<PageResult<Call>>(id ? `/calls?leadId=${id}&limit=20` : null);
  const followups = useApi<PageResult<FollowUp>>(id ? `/followups?leadId=${id}&limit=100` : null);
  const notes = useApi<PageResult<Note>>(id ? `/notes?leadId=${id}&limit=20` : null);
  const agents = useApi<PageResult<User>>('/users?roleKey=AGENT&limit=100');

  const [busy, setBusy] = useState<'call' | 'status' | 'followup' | 'followup-toggle' | 'assign' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [assignPopup, setAssignPopup] = useState<{ from: string; to: string } | null>(null);
  const [confirmAssign, setConfirmAssign] = useState<{ agentId: string; from: string; to: string } | null>(null);
  const [toggleId, setToggleId] = useState<string | null>(null);

  const [fuDate, setFuDate] = useState(defaultFollowUpTime());
  const [fuTitle, setFuTitle] = useState('');
  const [fuDesc, setFuDesc] = useState('');
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const { activeCall, setActiveCall, minimized, setMinimized, callElapsed } = useCall();
  const [historyLiveDur, setHistoryLiveDur] = useState<{ id: string; secs: number } | null>(null);
  const isBusyOnCall = !!activeCall && ['INITIATED', 'RINGING', 'CONNECTED'].includes(activeCall.status);

  const [noteBody, setNoteBody] = useState('');
  const [notePinned, setNotePinned] = useState(false);

  const l = lead.data;
  usePageTitle(l ? `${l.customer?.name ?? 'Lead'} — ${l.status}` : 'Lead');
  const isOwnLead = !!l && (l.agent?.id === user?.id || user?.role === 'SUPER_ADMIN');

  const history = useMemo(() => {
    const items: Array<{
      at: string;
      text: string;
      tone: 'green' | 'amber';
      followUp?: FollowUp;
    }> = [];
    const meta = l?.metadata as Lead['metadata'] | undefined;
    const hasChain = !!(meta?.agentHistory && Array.isArray(meta.agentHistory) && meta.agentHistory.length > 1);
    if (meta?.remark && !hasChain) {
      items.push({
        at: meta.remarkDate ?? l!.createdAt,
        text: `Remark: ${meta.remark}`,
        tone: 'amber',
      });
    }
    if (hasChain) {
      const h = meta!.agentHistory as Array<{ agent: string; dateIso: string | null; date: string; remark: string }>;
      for (let i = 0; i < h.length; i++) {
        const cur = h[i];
        const at = cur.dateIso ?? l!.createdAt;
        if (i === 0) {
          items.push({ at, text: `Initially assigned to ${cur.agent}${cur.remark ? ` — ${cur.remark}` : ''}`, tone: 'amber' });
        } else {
          const prev = h[i - 1].agent;
          items.push({ at, text: `Reassigned from ${prev} to ${cur.agent}${cur.remark ? ` — ${cur.remark}` : ''}`, tone: 'amber' });
        }
      }
    }
    for (const c of calls.data?.items ?? []) {
      const dur = historyLiveDur && historyLiveDur.id === c.id ? historyLiveDur.secs : c.durationSecs;
      items.push({
        at: c.startedAt,
        text: `${c.direction === 'INBOUND' ? 'Inbound' : 'Outbound'} call ${c.status}${dur != null ? ` · ${dur}s` : ''} · ${c.provider}`,
        tone: c.status === 'COMPLETED' || c.status === 'CONNECTED' ? 'green' : 'amber',
      });
    }
    for (const f of followups.data?.items ?? []) {
      items.push({
        at: f.scheduledFor,
        text: `Follow-up${f.isDone ? ' completed' : ' scheduled'}: ${f.title ?? 'Follow-up'}${f.description ? ` — ${f.description}` : ''}`,
        tone: f.isDone ? 'green' : 'amber',
        followUp: f,
      });
    }
    for (const n of notes.data?.items ?? []) {
      items.push({
        at: n.createdAt,
        text: `Note${n.pinned ? ' (pinned)' : ''}: ${n.body.slice(0, 160)}${n.body.length > 160 ? '…' : ''}`,
        tone: n.pinned ? 'green' : 'amber',
      });
    }
    items.sort((a, b) => (a.at < b.at ? 1 : -1));
    return items;
  }, [calls.data, followups.data, notes.data]);

  function reloadCalls() {
    calls.setData(null);
    void api<PageResult<Call>>(`/calls?leadId=${l?.id}&limit=10&_=${Date.now()}`)
      .then((d) => calls.setData(d))
      .catch(() => {});
  }

  function reloadFollowUps() {
    followups.setData(null);
    void api<PageResult<FollowUp>>(`/followups?leadId=${l?.id}&limit=100&_=${Date.now()}`)
      .then((d) => followups.setData(d))
      .catch(() => {});
  }

  function reloadNotes() {
    notes.setData(null);
    void api<PageResult<Note>>(`/notes?leadId=${l?.id}&limit=20&_=${Date.now()}`)
      .then((d) => notes.setData(d))
      .catch(() => {});
  }

  async function handleNoteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!l || !noteBody.trim()) return;
    setBusy('followup');
    try {
      await api('/notes', {
        method: 'POST',
        body: JSON.stringify({ body: noteBody.trim(), leadId: l.id, customerId: l.customerId, pinned: notePinned || undefined }),
      });
      setNoteBody('');
      setNotePinned(false);
      setMsg({ tone: 'ok', text: 'Note added.' });
      reloadNotes();
    } catch (err) {
      setMsg({ tone: 'err', text: err instanceof Error ? err.message : 'Could not add note' });
    } finally {
      setBusy(null);
    }
  }

  async function toggleFollowUpDone(f: FollowUp) {
    setToggleId(f.id);
    setMsg(null);
    try {
      const updated = await api<FollowUp>(`/followups/${f.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isDone: !f.isDone }),
      });
      setMsg({ tone: 'ok', text: updated.isDone ? 'Follow-up marked as done.' : 'Follow-up reopened.' });
      reloadFollowUps();
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not update follow-up' });
    } finally {
      setToggleId(null);
    }
  }

  async function handleCall() {
    if (!l) return;
    setBusy('call');
    setMsg(null);
    try {
      const c = await api<Call>('/calls/initiate', {
        method: 'POST',
        body: JSON.stringify({ leadId: l.id }),
      });
      setActiveCall({ ...c, status: 'INITIATED' } as Call);
      setMinimized(false);
      setMsg({ tone: 'ok', text: `Web call started to ${l.customer?.phone ?? ''} via ${c.provider}. Answer in your browser softphone.` });
      lead.setData({ ...l, status: 'CALLING' });
      reloadCalls();
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not start the call' });
    } finally {
      setBusy(null);
    }
  }

  // Keep historyLiveDur in sync when a call completes while this page is open
  useEffect(() => {
    if (!activeCall) return;
    if ((activeCall.status === 'COMPLETED' || activeCall.status === 'FAILED') && callElapsed > 0 && activeCall.durationSecs == null) {
      setHistoryLiveDur({ id: activeCall.id, secs: callElapsed });
    }
  }, [activeCall?.status, activeCall?.id, callElapsed]);

  async function handleHangup() {
    if (!activeCall) return;
    const liveTalkAtHangup = callElapsed > 0 ? callElapsed : (activeCall.durationSecs ?? 0);
    const callId = activeCall.id;
    setBusy('call');
    try {
      await api(`/calls/${callId}/hangup`, { method: 'POST' });
      // Show 22s immediately and keep it — don't let Tata's 19s overwrite history even after refresh
      const immediate = { ...activeCall, status: 'COMPLETED', durationSecs: liveTalkAtHangup || activeCall.durationSecs } as Call;
      setActiveCall(immediate);
      setHistoryLiveDur({ id: callId, secs: liveTalkAtHangup || 0 });
      // Persist the live 22s as the Call's duration so refresh keeps 22s (not Tata's 19s)
      if (liveTalkAtHangup > 0) {
        void api(`/calls/${callId}`, { method: 'PATCH', body: JSON.stringify({ durationSecs: liveTalkAtHangup } as unknown as Record<string, unknown>) }).catch(() => {});
      }
      setMsg({ tone: 'ok', text: `Call ended — talk time ${immediate.durationSecs ?? 0}s` });
      // Still fetch Tata's value in background for Reports, but don't change History's displayed 22s
      void (async () => {
        await new Promise((r) => setTimeout(r, 4000));
        try {
          await api<Call>(`/calls/${callId}`);
        } catch {}
        reloadCalls();
      })();
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Hangup failed' });
    } finally {
      setBusy(null);
    }
  }

  async function handleRedial() {
    if (!l) return;
    setActiveCall(null);
    // Small delay to close modal before re-initiating
    setTimeout(() => void handleCall(), 300);
  }

  async function handleDisposition(status: string) {
    if (!l) return;
    setBusy('status');
    try {
      const updated = await api<Lead>(`/leads/${l.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      lead.setData(updated);
      setMsg({ tone: 'ok', text: `Lead marked as ${status}` });
      setActiveCall(null);
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not update lead' });
    } finally {
      setBusy(null);
    }
  }

  async function handleStatus(next: string) {
    if (!l) return;
    setBusy('status');
    setMsg(null);
    try {
      const updated = await api<Lead>(`/leads/${l.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      lead.setData(updated);
      setMsg({ tone: 'ok', text: `Status updated to ${next}.` });
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not update status' });
    } finally {
      setBusy(null);
    }
  }

  function onAssignSelect(agentId: string) {
    if (!l) return;
    if (!agentId) return;
    const current = l.agent;
    const target = (agents.data?.items ?? []).find((a) => a.id === agentId);
    if (!target) return;
    if (current?.id === agentId) return;
    if (!current) {
      // First assignment — assign immediately, no confirmation.
      void handleAssign(agentId);
    } else {
      // Already assigned to a different agent — ask for confirmation first.
      setConfirmAssign({
        agentId,
        from: current.fullName ?? 'Unassigned',
        to: target.fullName,
      });
    }
  }

  async function handleAssign(agentId: string) {
    if (!l) return;
    const from = l.agent?.fullName ?? 'Unassigned';
    setBusy('assign');
    setMsg(null);
    try {
      const updated = await api<Lead>(`/leads/${l.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ agentId }),
      });
      const to = updated.agent?.fullName ?? 'Unassigned';
      lead.setData(updated);
      setAssignPopup({ from, to });
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not reassign lead' });
    } finally {
      setBusy(null);
    }
  }

  function confirmReassign() {
    if (!confirmAssign) return;
    const { agentId } = confirmAssign;
    setConfirmAssign(null);
    void handleAssign(agentId);
  }

  async function handleFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!l) return;
    setBusy('followup');
    setMsg(null);
    try {
      await api('/followups', {
        method: 'POST',
        body: JSON.stringify({
          customerId: l.customerId,
          leadId: l.id,
          scheduledFor: new Date(fuDate).toISOString(),
          title: fuTitle.trim() || 'Follow-up',
          description: fuDesc.trim() || undefined,
        }),
      });
      setMsg({ tone: 'ok', text: `Follow-up scheduled for ${formatDate(fuDate)}.` });
      setFuTitle('');
      setFuDesc('');
      setFuDate(defaultFollowUpTime());
      reloadFollowUps();
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not schedule follow-up' });
    } finally {
      setBusy(null);
    }
  }

  function handleOrderSaved(order: Order) {
    setCreatedOrder(order);
    setMsg({
      tone: 'ok',
      text: `Order ${order.orderNumber} created.`,
    });
    lead.reload();
  }

  if (lead.loading) return <Spinner label="Loading lead…" />;
  if (lead.error) return <EmptyState title="Could not load lead" description={lead.error} />;
  if (!l) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/leads" className="text-sm text-blue-600 hover:underline">
            ← Back to leads
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{l.customer?.name ?? 'Lead'}</h1>
            <Badge tone={TONE[l.status] ?? 'slate'}>{l.status}</Badge>
            <Badge tone={l.priority === 'URGENT' || l.priority === 'HIGH' ? 'red' : 'slate'}>
              {l.priority}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Assigned to {l.agent?.fullName ?? 'nobody'} · created {formatDate(l.createdAt)}
          </p>
        </div>
        {canCall && (
          <button
            onClick={handleCall}
            disabled={busy === 'call' || isBusyOnCall}
            title={isBusyOnCall ? `Already on call — ${activeCall?.status} — hang up or close first` : undefined}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === 'call' ? 'Calling…' : isBusyOnCall ? `On call — ${activeCall?.status}` : 'Call now'}
          </button>
        )}
      </div>

      {msg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            msg.tone === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Details</h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Customer</dt>
                <dd className="font-medium text-slate-900">
                  <Link href={`/customers/${l.customerId}`} className="text-blue-600 hover:underline">
                    {l.customer?.name}
                  </Link>{' '}
                  <span className="text-slate-500">· {l.customer?.phone}</span>
                  {l.customer?.email && <span className="text-slate-500"> · {l.customer.email}</span>}
                </dd>
              </div>
              <div><dt className="text-slate-500">Source</dt><dd className="font-medium text-slate-900">{l.sourceRef?.name ?? '—'}</dd></div>
              <div><dt className="text-slate-500">Title</dt><dd className="font-medium text-slate-900">{l.title ?? '—'}</dd></div>
              <div>
                <dt className="text-slate-500">Assigned to</dt>
                <dd className="font-medium text-slate-900">
                  {canAssign ? (
                    <select
                      value={l.agent?.id ?? ''}
                      disabled={busy === 'assign' || agents.loading}
                      onChange={(e) => onAssignSelect(e.target.value)}
                      className="mt-0.5 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
                    >
                      <option value="">Unassigned</option>
                      {(agents.data?.items ?? []).map((a) => (
                        <option key={a.id} value={a.id}>{a.fullName}</option>
                      ))}
                    </select>
                  ) : (
                    l.agent?.fullName ?? 'Unassigned'
                  )}
                </dd>
              </div>
              <div><dt className="text-slate-500">Assigned at</dt><dd className="font-medium text-slate-900">{l.assignedAt ? formatDate(l.assignedAt) : '—'}</dd></div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Description</dt>
                <dd className="font-medium text-slate-900">{l.description ?? '—'}</dd>
              </div>
              {l.tags && l.tags.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">Tags</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {l.tags.map((t) => (
                      <Badge key={t.id} tone="slate">{t.name}</Badge>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {canCreateNote && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Add a note</h2>
              <form onSubmit={handleNoteSubmit} className="space-y-2">
                <textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Write a note about this lead…"
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" checked={notePinned} onChange={(e) => setNotePinned(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
                    Pin this note
                  </label>
                  <button
                    type="submit"
                    disabled={busy === 'followup' || !noteBody.trim()}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                  >
                    {busy === 'followup' ? 'Saving…' : 'Add note'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">History</h2>
            </div>
            {calls.loading || followups.loading || notes.loading ? (
              <div className="p-4"><Spinner /></div>
            ) : history.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">
                No calls, follow-ups or notes yet. Tap “Call now” to start.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {history.map((h, i) => (
                  <li key={i} className="flex items-start gap-3 px-4 py-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${h.tone === 'green' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700">{h.text}</p>
                      <p className="text-xs text-slate-400">{formatDate(h.at)}</p>
                    </div>
                    {h.followUp && canUpdateFollowUp && (
                      <button
                        onClick={() => toggleFollowUpDone(h.followUp!)}
                        disabled={toggleId === h.followUp.id}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                          h.followUp.isDone
                            ? 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                      >
                        {toggleId === h.followUp.id ? '…' : h.followUp.isDone ? 'Reopen' : 'Mark done'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {canUpdateLead && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Update status</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {LEAD_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatus(s)}
                    disabled={busy === 'status' || s === l.status}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      s === l.status
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {s.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {canCreateOrder && isOwnLead && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Create order</h2>

              {(createdOrder || l.convertedOrder) && (
                <div className="mb-4 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
                  <p className="font-semibold text-emerald-800">
                    Order {(createdOrder ?? l.convertedOrder)?.orderNumber} created
                  </p>
                  <p className="text-emerald-700">
                    Total {formatCurrency((createdOrder ?? l.convertedOrder)!.total)} ·{' '}
                    {(createdOrder ?? l.convertedOrder)!.status}
                  </p>
                  <Link
                    href={`/orders/${(createdOrder ?? l.convertedOrder)!.id}`}
                    className="inline-block text-emerald-700 underline hover:text-emerald-900"
                  >
                    View order details →
                  </Link>
                  <p className="pt-1 text-xs text-emerald-600">
                    You can create another order for this customer below.
                  </p>
                </div>
              )}

              <OrderForm
                customerId={l.customerId}
                leadId={l.id}
                onSaved={handleOrderSaved}
                onError={(text) => setMsg({ tone: 'err', text })}
              />
            </div>
          )}

          {canCreateFollowUp && isOwnLead && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Schedule follow-up</h2>
              <form onSubmit={handleFollowUp} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">When</label>
                  <input
                    required
                    type="datetime-local"
                    value={fuDate}
                    onChange={(e) => setFuDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
                  <input
                    value={fuTitle}
                    onChange={(e) => setFuTitle(e.target.value)}
                    placeholder="Follow-up"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Note</label>
                  <textarea
                    value={fuDesc}
                    onChange={(e) => setFuDesc(e.target.value)}
                    rows={2}
                    placeholder="What should the agent remember?"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy === 'followup'}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy === 'followup' ? 'Scheduling…' : 'Schedule'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {assignPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <button
              onClick={() => setAssignPopup(null)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              ✕
            </button>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">
              {assignPopup.from === 'Unassigned' ? 'Lead assigned' : 'Lead reassigned'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {assignPopup.from === 'Unassigned' ? (
                <>This lead was assigned to <span className="font-semibold text-blue-600">{assignPopup.to}</span>.</>
              ) : (
                <>
                  This lead was moved from{' '}
                  <span className="font-semibold text-slate-900">{assignPopup.from}</span> to{' '}
                  <span className="font-semibold text-blue-600">{assignPopup.to}</span>.
                </>
              )}
            </p>
            <button
              onClick={() => setAssignPopup(null)}
              className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {confirmAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <button
              onClick={() => setConfirmAssign(null)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              ✕
            </button>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Change assigned agent?</h3>
            <p className="mt-2 text-sm text-slate-600">
              This lead is currently with{' '}
              <span className="font-semibold text-slate-900">{confirmAssign.from}</span>. Do you want to
              reassign it to <span className="font-semibold text-blue-600">{confirmAssign.to}</span>?
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={confirmReassign}
                disabled={busy === 'assign'}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy === 'assign' ? 'Assigning…' : 'Yes, reassign'}
              </button>
              <button
                onClick={() => setConfirmAssign(null)}
                disabled={busy === 'assign'}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}

function formatDateTimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultFollowUpTime() {
  return formatDateTimeLocal(new Date(Date.now() + 24 * 3600 * 1000));
}
