'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { useApi } from '@/lib/hook';
import { useAuth } from '@/lib/auth';
import { Customer, Note, PageResult } from '@/lib/types';
import { Badge, EmptyState, Spinner, formatDate } from '@/components/ui';
import { api } from '@/lib/client';

function NotesPageInner() {
  const params = useSearchParams();
  const customerId = params.get('customerId') ?? undefined;
  const leadId = params.get('leadId') ?? undefined;

  const { user } = useAuth();
  const canCreate = user?.permissions?.includes('note.create') ?? false;
  const canUpdate = user?.permissions?.includes('note.update') ?? false;

  const [page, setPage] = useState(1);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const qs = new URLSearchParams({ page: String(page), limit: '20' });
  if (customerId) qs.set('customerId', customerId);
  if (leadId) qs.set('leadId', leadId);

  const { data, loading, error, setData } = useApi<PageResult<Note>>(
    `/notes?${qs.toString()}&_=${refreshKey}`,
  );
  const customer = useApi<Customer | null>(
    customerId ? `/customers/${customerId}` : null,
  );

  const notes = useMemo(() => data?.items ?? [], [data]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    setErr('');
    try {
      await api('/notes', {
        method: 'POST',
        body: JSON.stringify({
          body: text,
          ...(customerId ? { customerId } : {}),
          ...(leadId ? { leadId } : {}),
        }),
      });
      setBody('');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add note');
    } finally {
      setSaving(false);
    }
  }

  async function togglePin(n: Note) {
    try {
      await api(`/notes/${n.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned: !n.pinned }),
      });
      setData(null);
      setRefreshKey((k) => k + 1);
    } catch {
      /* ignore */
    }
  }

  async function remove(n: Note) {
    if (!confirm('Delete this note?')) return;
    try {
      await api(`/notes/${n.id}`, { method: 'DELETE' });
      setData(null);
      setRefreshKey((k) => k + 1);
    } catch {
      /* ignore */
    }
  }

  const filteredTitle = customerId
    ? `Notes for ${customer.data?.name ?? 'customer'}`
    : leadId
      ? 'Notes for lead'
      : 'Notes';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">{filteredTitle}</h1>
        {customerId && (
          <Link href={`/customers/${customerId}`} className="text-sm text-blue-600 hover:underline">
            ← Back to customer
          </Link>
        )}
        {leadId && (
          <Link href={`/leads/${leadId}`} className="text-sm text-blue-600 hover:underline">
            ← Back to lead
          </Link>
        )}
      </div>

      {canCreate && (
        <form onSubmit={handleAdd} className="rounded-xl border border-slate-200 bg-white p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Write a note…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || !body.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add note'}
            </button>
            {err && <p className="text-sm text-red-600">{err}</p>}
          </div>
        </form>
      )}

      {loading && <Spinner />}
      {error && <EmptyState title="Could not load notes" description={error} />}

      {!loading && !error && (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {notes.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">No notes.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notes.map((n) => (
                  <li key={n.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700">{n.body}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {n.user?.fullName ?? 'Unknown'} · {formatDate(n.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {n.pinned && <Badge tone="amber">Pinned</Badge>}
                        {canUpdate && (
                          <>
                            <button
                              onClick={() => togglePin(n)}
                              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                            >
                              {n.pinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button
                              onClick={() => remove(n)}
                              className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Page {data.page} of {data.totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
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
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense fallback={<Spinner label="Loading notes…" />}>
      <NotesPageInner />
    </Suspense>
  );
}
