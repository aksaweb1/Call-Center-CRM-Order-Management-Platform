'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hook';
import { useUrlParams } from '@/lib/use-url-params';
import { usePageTitle } from '@/lib/use-page-title';
import { Lead, PageResult, User } from '@/lib/types';
import { Badge, EmptyState, Spinner, TableSkeleton, formatDate } from '@/components/ui';
import { CallButton } from '@/components/call-button';
import { api } from '@/lib/client';

const LEAD_STATUSES = ['NEW', 'ASSIGNED', 'CALLING', 'INTERESTED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALL_BACK_REQUESTED', 'NOT_INTERESTED'];
const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function LeadsPageInner() {
  usePageTitle('Leads');
  const { user } = useAuth();
  const canCreate = user?.permissions?.includes('lead.create') ?? false;
  const canUpdate = user?.permissions?.includes('lead.update') ?? false;
  const canAssign = user?.permissions?.includes('lead.assign') ?? false;
  const canReadUsers = user?.permissions?.includes('user.read') ?? false;
  const { get, set } = useUrlParams();

  // Filter state initialised from the URL so deep links (?customerId=…) work.
  const [page, setPage] = useState(() => Math.max(1, Number(get('page')) || 1));
  const [search, setSearch] = useState(() => get('search') ?? '');
  const [searchInput, setSearchInput] = useState(() => get('search') ?? '');
  const [statusFilter, setStatusFilter] = useState(() => get('status') ?? '');
  const [priorityFilter, setPriorityFilter] = useState(() => get('priority') ?? '');
  const [agentFilter, setAgentFilter] = useState(() => get('agentId') ?? '');
  const customerId = get('customerId');

  // Debounce the search box so we don't hammer the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) {
        setSearch(searchInput);
        setPage(1);
        set({ search: searchInput || undefined, page: undefined });
        setSelected(new Set());
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);
  const [form, setForm] = useState({ name: '', phone: '', priority: 'MEDIUM', agentId: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [formError, setFormError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [assignPopup, setAssignPopup] = useState<{ from: string; to: string } | null>(null);
  const [confirmAssign, setConfirmAssign] = useState<{ agentId: string; from: string; to: string } | null>(null);

  // ── Bulk selection ────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), limit: '20', sortBy: 'createdAt' });
  if (search) qs.set('search', search);
  if (statusFilter) qs.set('status', statusFilter);
  if (priorityFilter) qs.set('priority', priorityFilter);
  if (agentFilter) qs.set('agentId', agentFilter);
  if (customerId) qs.set('customerId', customerId);

  const { data, loading, error, setData } = useApi<PageResult<Lead>>(
    `/leads?${qs.toString()}&_=${refreshKey}`,
  );
  // Only users who may read employees can pick a manual agent.
  const agents = useApi<PageResult<User>>(canReadUsers ? '/users?roleKey=AGENT&limit=100' : null);

  const leads = useMemo(() => data?.items ?? [], [data]);
  const agentList = useMemo(() => agents.data?.items ?? [], [agents.data]);

  const allOnPageSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) leads.forEach((l) => next.delete(l.id));
      else leads.forEach((l) => next.add(l.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkReassign(agentId: string) {
    if (!agentId || selected.size === 0) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const r = await api<{ assigned: number }>('/leads/assign-many', {
        method: 'POST',
        body: JSON.stringify({ leadIds: [...selected], agentId }),
      });
      const name = agentList.find((a) => a.id === agentId)?.fullName ?? 'agent';
      setBulkMsg(`${r.assigned} lead(s) reassigned to ${name}.`);
      setSelected(new Set());
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setBulkMsg(e instanceof Error ? e.message : 'Bulk reassign failed');
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkStatus(status: string) {
    if (!status || selected.size === 0) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const r = await api<{ updated: number }>('/leads/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ leadIds: [...selected], status }),
      });
      setBulkMsg(`${r.updated} lead(s) marked ${status}.`);
      setSelected(new Set());
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setBulkMsg(e instanceof Error ? e.message : 'Bulk update failed');
    } finally {
      setBulkBusy(false);
    }
  }

  function applyFilter(update: { page?: number; search?: string; status?: string; priority?: string; agentId?: string }) {
    if (update.page !== undefined) setPage(update.page);
    if (update.search !== undefined) setSearch(update.search);
    if (update.status !== undefined) setStatusFilter(update.status);
    if (update.priority !== undefined) setPriorityFilter(update.priority);
    if (update.agentId !== undefined) setAgentFilter(update.agentId);
    set({
      page: !update.page || update.page === 1 ? undefined : update.page,
      search: update.search || undefined,
      status: update.status || undefined,
      priority: update.priority || undefined,
      agentId: update.agentId || undefined,
    });
    setSelected(new Set());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim() || 'unknown';
    const phone = form.phone.replace(/\s+/g, '').trim();
    if (!phone) {
      setFormError('Phone number is required.');
      return;
    }
    setFormError('');
    setSaved('');

    // Manual agent selected: if this customer already has a lead with a
    // different agent, ask for confirmation before overriding it.
    if (form.agentId) {
      try {
        const existing = await api<PageResult<Lead>>(
          `/leads?search=${encodeURIComponent(phone)}&limit=1&sortBy=createdAt`,
        );
        const current = existing.items?.[0]?.agent;
        if (current && current.id !== form.agentId) {
          const to = agentList.find((a) => a.id === form.agentId)?.fullName ?? 'Agent';
          setConfirmAssign({ agentId: form.agentId, from: current.fullName, to });
          return;
        }
      } catch {
        // fall through — proceed to create if lookup fails
      }
    }

    await createLead(name, phone, form.agentId || undefined);
  }

  async function createLead(name: string, phone: string, agentId?: string) {
    const priority = form.priority;
    setSaving(true);
    try {
      const created = await api<Lead>('/leads', {
        method: 'POST',
        body: JSON.stringify({
          customerName: name,
          phone,
          sourceCode: 'whatsapp',
          description: 'Lead captured from WhatsApp',
          priority,
          agentId,
        }),
      });
      const to = created.agent?.fullName ?? 'Unassigned';
      setAssignPopup({ from: 'Unassigned', to });
      setSaved(
        `Lead added for ${name} (${phone})${agentId ? ` — assigned to ${to}` : ` — auto-assigned to ${to}.`}`,
      );
      setForm({ name: '', phone: '', priority: 'MEDIUM', agentId: '' });
      setPage(1);
      setData(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not add lead');
    } finally {
      setSaving(false);
    }
  }

  function confirmCreateWithAgent() {
    if (!confirmAssign) return;
    const { agentId } = confirmAssign;
    const { name, phone } = form;
    setConfirmAssign(null);
    void createLead(name, phone, agentId);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">
          Leads{customerId ? ' — customer' : ''}
        </h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search leads…"
          className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => applyFilter({ status: e.target.value, page: 1 })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => applyFilter({ priority: e.target.value, page: 1 })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All priorities</option>
          {LEAD_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {canReadUsers && (
          <select
            value={agentFilter}
            onChange={(e) => applyFilter({ agentId: e.target.value, page: 1 })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All agents</option>
            {agentList.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
          </select>
        )}
        {(search || statusFilter || priorityFilter || agentFilter || customerId) && (
          <button
            onClick={() => {
              window.history.replaceState(null, '', '/leads');
              setSearch(''); setSearchInput(''); setStatusFilter(''); setPriorityFilter(''); setAgentFilter('');
              setPage(1);
              setSelected(new Set());
            }}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (canAssign || canUpdate) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-blue-800">{selected.size} selected</span>
          {canAssign && canReadUsers && (
            <select
              defaultValue=""
              disabled={bulkBusy}
              onChange={(e) => { void bulkReassign(e.target.value); e.target.value = ''; }}
              className="rounded-lg border border-blue-300 px-3 py-1.5 text-sm"
            >
              <option value="">Reassign to…</option>
              {agentList.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
            </select>
          )}
          {canUpdate && (
            <select
              defaultValue=""
              disabled={bulkBusy}
              onChange={(e) => { void bulkStatus(e.target.value); e.target.value = ''; }}
              className="rounded-lg border border-blue-300 px-3 py-1.5 text-sm"
            >
              <option value="">Set status to…</option>
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            Clear selection
          </button>
          {bulkBusy && <Spinner label="Working…" />}
          {bulkMsg && <span className="text-sm text-slate-700">{bulkMsg}</span>}
        </div>
      )}

      {canCreate && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Add lead from WhatsApp</h2>
              <p className="text-xs text-slate-500">Paste the phone number from the WhatsApp chat — the lead is created and assigned automatically. Name is optional (saved as "unknown" if blank).</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Customer name (optional)"
              className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="Phone number"
              inputMode="tel"
              className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="LOW">Priority: Low</option>
              <option value="MEDIUM">Priority: Medium</option>
              <option value="HIGH">Priority: High</option>
              <option value="URGENT">Priority: Urgent</option>
            </select>
            <select
              value={form.agentId}
              onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Assign: Auto</option>
              {agentList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add lead'}
            </button>
          </form>

          {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
          {saved && <p className="mt-2 text-sm text-emerald-600">{saved}</p>}
        </div>
      )}

      {loading && <TableSkeleton rows={6} cols={7} />}
      {error && <EmptyState title="Could not load leads" description={error} />}

      {!loading && !error && (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {(canUpdate || canAssign) && (
                    <th className="w-10 px-3 py-3">
                      <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} aria-label="Select all on page" />
                    </th>
                  )}
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={(canUpdate || canAssign) ? 9 : 8} className="px-4 py-10 text-center text-slate-400">
                      No leads match.
                    </td>
                  </tr>
                )}
                {leads.map((l) => (
                  <tr key={l.id} className={`hover:bg-slate-50 ${selected.has(l.id) ? 'bg-blue-50/60' : ''}`}>
                    {(canUpdate || canAssign) && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(l.id)}
                          onChange={() => toggleOne(l.id)}
                          aria-label={`Select lead ${l.customer?.name ?? l.id}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link href={`/leads/${l.id}`} className="font-medium text-slate-900 hover:text-blue-600 hover:underline">
                        {l.customer?.name ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {l.customer?.phone ? (
                        <>
                          <a href={`tel:${l.customer.phone}`} className="hover:text-emerald-600">{l.customer.phone}</a>
                          <span className="ml-2 inline-block align-middle">
                            <CallButton leadId={l.id} />
                          </span>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{l.sourceRef?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[l.status] ?? 'slate'}>
                          {l.status}
                        </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={l.priority === 'URGENT' || l.priority === 'HIGH' ? 'red' : 'slate'}>
                        {l.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{l.agent?.fullName ?? 'Unassigned'}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(l.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/leads/${l.id}`}
                          className="inline-flex rounded-lg border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Handle
                        </Link>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">
                Page {data.page} of {data.totalPages} · {data.total} leads
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => applyFilter({ page: Math.max(1, page - 1) })}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() => applyFilter({ page: Math.min(data.totalPages, page + 1) })}
                  disabled={page >= data.totalPages}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

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
            <h3 className="text-lg font-semibold text-slate-900">Lead assigned</h3>
            <p className="mt-2 text-sm text-slate-600">
              This lead was assigned to{' '}
              <span className="font-semibold text-blue-600">{assignPopup.to}</span>.
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
              This customer already has a lead with{' '}
              <span className="font-semibold text-slate-900">{confirmAssign.from}</span>. Do you want to
              assign this new lead to <span className="font-semibold text-blue-600">{confirmAssign.to}</span>?
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={confirmCreateWithAgent}
                disabled={saving}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Adding…' : 'Yes, assign'}
              </button>
              <button
                onClick={() => setConfirmAssign(null)}
                disabled={saving}
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

export default function LeadsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading leads…" />}>
      <LeadsPageInner />
    </Suspense>
  );
}

const STATUS_TONE: Record<string, string> = {
  CONVERTED: 'green',
  ORDER_CREATED: 'green',
  INTERESTED: 'blue',
  NEW: 'blue',
  ASSIGNED: 'amber',
  CALLING: 'amber',
  CALL_BACK_REQUESTED: 'amber',
  NOT_INTERESTED: 'red',
  CANCELLED: 'red',
  WRONG_NUMBER: 'red',
  NO_ANSWER: 'slate',
  BUSY: 'slate',
  INVALID_NUMBER: 'slate',
};