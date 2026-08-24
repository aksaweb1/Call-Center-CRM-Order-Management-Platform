'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useApi } from '@/lib/hook';
import { Order, PageResult } from '@/lib/types';
import { Spinner, EmptyState, Badge, formatCurrency, formatDate } from '@/components/ui';

const STATUS_TONE: Record<string, string> = {
  PENDING: 'amber',
  CONFIRMED: 'blue',
  PACKED: 'violet',
  SHIPPED: 'blue',
  DELIVERED: 'green',
  CANCELLED: 'red',
};

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), limit: '20' });
  const { data, loading, error } = useApi<PageResult<Order>>(`/orders?${qs.toString()}`);

  const orders = useMemo(() => data?.items ?? [], [data]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Orders</h1>

      {loading && <Spinner />}
      {error && <EmptyState title="Could not load orders" description={error} />}

      {!loading && !error && (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      No orders yet.
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
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[o.status] ?? 'slate'}>{o.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{o.paymentStatus}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(o.total)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(o.placedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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