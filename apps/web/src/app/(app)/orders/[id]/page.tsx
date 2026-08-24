'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useApi } from '@/lib/hook';
import { useAuth } from '@/lib/auth';
import { Order } from '@/lib/types';
import { Badge, EmptyState, Spinner, formatCurrency, formatDate } from '@/components/ui';
import { api } from '@/lib/client';

const STATUS_TONE: Record<string, string> = {
  PENDING: 'amber',
  CONFIRMED: 'blue',
  PACKED: 'violet',
  DISPATCHED: 'blue',
  SHIPPED: 'blue',
  DELIVERED: 'green',
  RETURNED: 'slate',
  CANCELLED: 'red',
  REFUNDED: 'red',
};

const ORDER_STATUSES = [
  'PENDING', 'CONFIRMED', 'PACKED', 'DISPATCHED',
  'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED', 'REFUNDED',
];

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'NET_BANKING', 'COD'];

const SHIPMENT_STATUSES = ['PENDING', 'PICKED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY', 'RETURNED'];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canUpdateStatus = user?.permissions?.includes('order.update') ?? false;
  const canRecordPayment = user?.permissions?.includes('payment.create') ?? false;
  const canCreateShipment = user?.permissions?.includes('shipment.create') ?? false;
  const canUpdateShipment = user?.permissions?.includes('shipment.update') ?? false;

  const order = useApi<Order>(id ? `/orders/${id}` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const o = order.data;

  async function updateStatus(status: string) {
    if (!o) return;
    setBusy('status');
    setMsg(null);
    try {
      const updated = await api<Order>(`/orders/${o.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      order.setData({ ...o, status: updated.status });
      setMsg({ tone: 'ok', text: `Status updated to ${status}.` });
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not update status' });
    } finally {
      setBusy(null);
    }
  }

  async function recordPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!o) return;
    const fd = new FormData(e.currentTarget);
    setBusy('payment');
    setMsg(null);
    try {
      await api(`/orders/${o.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(fd.get('amount')),
          method: String(fd.get('method')),
          transactionId: String(fd.get('txn') || ''),
        }),
      });
      setMsg({ tone: 'ok', text: 'Payment recorded — order marked paid.' });
      order.setData(null);
      void api<Order>(`/orders/${o.id}`).then((d) => order.setData(d));
    } catch (err) {
      setMsg({ tone: 'err', text: err instanceof Error ? err.message : 'Could not record payment' });
    } finally {
      setBusy(null);
    }
  }

  async function createShipment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!o) return;
    const fd = new FormData(e.currentTarget);
    setBusy('shipment');
    setMsg(null);
    try {
      await api(`/orders/${o.id}/shipments`, {
        method: 'POST',
        body: JSON.stringify({
          courierName: String(fd.get('courier') || ''),
          trackingId: String(fd.get('tracking') || ''),
        }),
      });
      setMsg({ tone: 'ok', text: 'Shipment created — order dispatched.' });
      order.setData(null);
      void api<Order>(`/orders/${o.id}`).then((d) => order.setData(d));
    } catch (err) {
      setMsg({ tone: 'err', text: err instanceof Error ? err.message : 'Could not create shipment' });
    } finally {
      setBusy(null);
    }
  }

  async function updateShipmentStatus(status: string) {
    if (!o) return;
    setBusy('shpstatus');
    setMsg(null);
    try {
      await api(`/orders/${o.id}/shipments/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setMsg({ tone: 'ok', text: `Shipment marked ${status}.` });
      order.setData(null);
      void api<Order>(`/orders/${o.id}`).then((d) => order.setData(d));
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not update shipment' });
    } finally {
      setBusy(null);
    }
  }

  if (order.loading) return <Spinner label="Loading order…" />;
  if (order.error) return <EmptyState title="Could not load order" description={order.error} />;
  if (!o) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/orders" className="text-sm text-blue-600 hover:underline">← Back to orders</Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{o.orderNumber}</h1>
            <Badge tone={STATUS_TONE[o.status] ?? 'slate'}>{o.status}</Badge>
            <Badge tone={o.paymentStatus === 'PAID' ? 'green' : 'amber'}>{o.paymentStatus}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Placed {formatDate(o.placedAt)} · {o.agent?.fullName ?? 'No agent'}
          </p>
        </div>
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
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Items</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Product</th>
                    <th className="py-2 pr-4">SKU</th>
                    <th className="py-2 pr-4">Qty</th>
                    <th className="py-2 pr-4">Unit</th>
                    <th className="py-2 pr-4 text-right">Line</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(o.items ?? []).map((it) => (
                    <tr key={it.id}>
                      <td className="py-2.5 pr-4 font-medium text-slate-800">{it.product?.name ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-slate-500">{it.product?.sku ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-slate-600">{it.quantity}</td>
                      <td className="py-2.5 pr-4 text-slate-600">{formatCurrency(it.unitPrice)}</td>
                      <td className="py-2.5 pr-4 text-right font-medium text-slate-800">{formatCurrency(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatCurrency(o.itemsTotal)}</span>
              </div>
              {Number(o.discount ?? 0) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Discount</span>
                  <span>−{formatCurrency(o.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>GST</span>
                <span>{formatCurrency(o.gstTotal)}</span>
              </div>
              {Number(o.shippingCharges ?? 0) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Shipping</span>
                  <span>{formatCurrency(o.shippingCharges)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                <span>Total</span>
                <span>{formatCurrency(o.total)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Timeline</h2>
            {(o as Order & { timeline?: Array<{ action: string; metadata?: Record<string, unknown>; createdAt: string }> }).timeline?.length ? (
              <ul className="divide-y divide-slate-100">
                {((o as Order & { timeline: Array<{ action: string; metadata?: Record<string, unknown>; createdAt: string }> }).timeline).map((t, i) => (
                  <li key={i} className="flex items-start gap-3 py-2.5">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    <div>
                      <p className="text-sm text-slate-700">{t.action}</p>
                      {t.metadata && Object.keys(t.metadata).length > 0 && (
                        <p className="text-xs text-slate-400">{JSON.stringify(t.metadata)}</p>
                      )}
                      <p className="text-xs text-slate-400">{formatDate(t.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No activity recorded.</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Details</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Customer</dt>
                <dd className="font-medium text-slate-900">
                  <Link href={`/customers/${o.customer?.id}`} className="text-blue-600 hover:underline">
                    {o.customer?.name}
                  </Link>{' '}
                  <span className="text-slate-500">· {o.customer?.phone}</span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Agent</dt>
                <dd className="font-medium text-slate-900">{o.agent?.fullName ?? '—'}</dd>
              </div>
              {o.lead && (
                <div>
                  <dt className="text-slate-500">Source lead</dt>
                  <dd className="font-medium text-slate-900">
                    <Link href={`/leads/${o.lead.id}`} className="text-blue-600 hover:underline">
                      {o.lead.title ?? 'Lead'}
                    </Link>{' '}
                    <Badge tone={o.lead.status === 'CONVERTED' ? 'green' : 'slate'}>{o.lead.status}</Badge>
                  </dd>
                </div>
              )}
              {o.notes && (
                <div>
                  <dt className="text-slate-500">Notes</dt>
                  <dd className="font-medium text-slate-900">{o.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {o.invoice && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Invoice</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Number</dt><dd className="font-medium text-slate-900">{o.invoice.invoiceNumber}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className="font-medium text-slate-900"><Badge tone={o.invoice.status === 'PAID' ? 'green' : 'amber'}>{o.invoice.status}</Badge></dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Amount</dt><dd className="font-medium text-slate-900">{formatCurrency(o.invoice.totalAmount)}</dd></div>
              </dl>
            </div>
          )}

          {canUpdateStatus && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Update status</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ORDER_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(s)}
                    disabled={busy === 'status' || s === o.status}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      s === o.status
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

          {canRecordPayment && o.paymentStatus !== 'PAID' && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Record payment</h2>
              <form onSubmit={recordPayment} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Amount (₹)</label>
                  <input
                    name="amount"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={o.total}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Method</label>
                  <select name="method" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Transaction ID</label>
                  <input name="txn" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <button
                  type="submit"
                  disabled={busy === 'payment'}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy === 'payment' ? 'Recording…' : 'Record payment'}
                </button>
              </form>
            </div>
          )}

          {o.shipment ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Shipment</h2>
              <dl className="mb-3 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Courier</dt><dd className="font-medium text-slate-900">{o.shipment.courierName ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Tracking</dt><dd className="font-medium text-slate-900">{o.shipment.trackingId ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className="font-medium text-slate-900"><Badge tone="blue">{o.shipment.status}</Badge></dd></div>
              </dl>
              {canUpdateShipment && (
                <div className="grid grid-cols-2 gap-2">
                  {SHIPMENT_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateShipmentStatus(s)}
                      disabled={busy === 'shpstatus' || s === o.shipment?.status}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                        s === o.shipment?.status
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {s.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : canCreateShipment ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Create shipment</h2>
              <form onSubmit={createShipment} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Courier</label>
                  <input name="courier" placeholder="e.g. DTDC, BlueDart" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Tracking ID</label>
                  <input name="tracking" placeholder="Tracking number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <button
                  type="submit"
                  disabled={busy === 'shipment'}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy === 'shipment' ? 'Creating…' : 'Create shipment'}
                </button>
              </form>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Payments</h2>
            {(o.payments ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">No payments recorded.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(o.payments ?? []).map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-800">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-slate-400">{p.method}{p.transactionId ? ` · ${p.transactionId}` : ''}</p>
                    </div>
                    <Badge tone="green">{p.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
