'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useApi } from '@/lib/hook';
import { useAuth } from '@/lib/auth';
import { useUrlParams } from '@/lib/use-url-params';
import { usePageTitle } from '@/lib/use-page-title';
import { Order, PageResult } from '@/lib/types';
import { Spinner, EmptyState, Badge, TableSkeleton, formatCurrency, formatDate } from '@/components/ui';
import { api } from '@/lib/client';

const STATUS_TONE: Record<string, string> = {
  PENDING: 'amber',
  CONFIRMED: 'blue',
  PACKED: 'violet',
  DISPATCHED: 'blue',
  DELIVERED: 'green',
  RETURNED: 'red',
  CANCELLED: 'red',
  REFUNDED: 'slate',
};

const PAYMENT_TONE: Record<string, string> = {
  PENDING: 'amber',
  PAID: 'green',
  FAILED: 'red',
  REFUNDED: 'slate',
  PARTIALLY_REFUNDED: 'amber',
};

const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'RETURNED', 'CANCELLED', 'REFUNDED'];
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'];

function OrdersPageInner() {
  usePageTitle('Orders');
  const { get, set } = useUrlParams();
  const { user } = useAuth();
  const canRecordPayment = user?.permissions?.includes('payment.create') ?? false;

  // Filter state initialised from the URL (deep links like /orders?customerId=… work).
  const [page, setPage] = useState(() => Math.max(1, Number(get('page')) || 1));
  const [searchInput, setSearchInput] = useState(() => get('search') ?? '');
  const [search, setSearch] = useState(() => get('search') ?? '');
  const [status, setStatus] = useState(() => get('status') ?? '');
  const [paymentStatus, setPaymentStatus] = useState(() => get('paymentStatus') ?? '');
  const [from, setFrom] = useState(() => get('from') ?? '');
  const [to, setTo] = useState(() => get('to') ?? '');
  const customerId = get('customerId');

  // Debounce search-as-you-type.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const qs = new URLSearchParams({ page: String(page), limit: '20' });
  if (search) qs.set('search', search);
  if (status) qs.set('status', status);
  if (paymentStatus) qs.set('paymentStatus', paymentStatus);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (customerId) qs.set('customerId', customerId);

  const { data, loading, error, reload } = useApi<PageResult<Order>>(`/orders?${qs.toString()}`);
  const orders = useMemo(() => data?.items ?? [], [data]);

  function goToPage(p: number) {
    setPage(p);
    set({ page: p === 1 ? undefined : p });
  }
  function onSearch(v: string) {
    setSearchInput(v);
    goToPage(1); // also resets page param in URL
    set({ search: v || undefined, page: undefined });
  }

  // ── Inline record payment ────────────────────────────────────────────
  const [payOrder, setPayOrder] = useState<Order | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payBusy, setPayBusy] = useState(false);
  const [payMsg, setPayMsg] = useState<string | null>(null);

  function openPay(o: Order) {
    setPayOrder(o);
    setPayAmount(String(parseFloat(o.total) || ''));
    setPayMethod('CASH');
    setPayMsg(null);
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payOrder) return;
    const amount = parseFloat(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPayMsg('Enter a valid amount');
      return;
    }
    setPayBusy(true);
    setPayMsg(null);
    try {
      await api(`/orders/${payOrder.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount, method: payMethod }),
      });
      setPayOrder(null);
      reload();
    } catch (err) {
      setPayMsg(err instanceof Error ? err.message : 'Could not record payment');
    } finally {
      setPayBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">
        Orders{customerId ? ' — customer' : ''}
      </h1>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <input
          value={searchInput}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search order #, customer, phone…"
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); goToPage(1); set({ status: e.target.value || undefined }); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={paymentStatus}
          onChange={(e) => { setPaymentStatus(e.target.value); goToPage(1); set({ paymentStatus: e.target.value || undefined }); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All payments</option>
          {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); goToPage(1); set({ from: e.target.value || undefined }); }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); goToPage(1); set({ to: e.target.value || undefined }); }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        {(search || status || paymentStatus || from || to) && (
          <button
            onClick={() => {
              setSearchInput(''); setSearch(''); setStatus(''); setPaymentStatus(''); setFrom(''); setTo('');
              goToPage(1);
              set({ search: undefined, status: undefined, paymentStatus: undefined, from: undefined, to: undefined, page: undefined });
            }}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading && <TableSkeleton rows={6} cols={6} />}
      {error && <EmptyState title="Could not load orders" description={error} />}

      {!loading && !error && (
        <>
          <div className="overflow-x-auto overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Order No</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Placed</th>
                  {canRecordPayment && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={canRecordPayment ? 8 : 7} className="px-4 py-10 text-center text-slate-400">
                      No orders match.
                    </td>
                  </tr>
                )}
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link href={`/orders/${o.id}`} className="text-blue-600 hover:underline">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{o.customer?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{o.agent?.fullName ?? '—'}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[o.status] ?? 'slate'}>{o.status}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={PAYMENT_TONE[o.paymentStatus] ?? 'slate'}>{o.paymentStatus}</Badge></td>
                    <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(o.total)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(o.placedAt)}</td>
                    {canRecordPayment && (
                      <td className="px-4 py-3 text-right">
                        {o.paymentStatus !== 'PAID' && !['CANCELLED', 'REFUNDED'].includes(o.status) && (
                          <button
                            onClick={() => openPay(o)}
                            className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                          >
                            Record payment
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Page {data.page} of {data.totalPages} · {data.total} orders</span>
              <div className="flex gap-2">
                <button
                  onClick={() => goToPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() => goToPage(Math.min(data.totalPages, page + 1))}
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

      {/* Inline record-payment modal */}
      {payOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-1 text-lg font-semibold text-slate-900">Record payment</h3>
            <p className="mb-4 text-sm text-slate-500">
              {payOrder.orderNumber} · {payOrder.customer?.name ?? ''} · {formatCurrency(payOrder.total)}
            </p>
            <form onSubmit={submitPayment} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Amount (₹)</label>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {['CASH', 'UPI', 'CARD', 'NET_BANKING'].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {payMsg && <p className="text-sm text-red-600">{payMsg}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={payBusy}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {payBusy ? 'Saving…' : 'Save payment'}
                </button>
                <button
                  type="button"
                  onClick={() => setPayOrder(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<Spinner label="Loading orders…" />}>
      <OrdersPageInner />
    </Suspense>
  );
}
