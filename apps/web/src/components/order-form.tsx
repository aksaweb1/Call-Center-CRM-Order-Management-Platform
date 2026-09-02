'use client';

import { useMemo, useState } from 'react';
import { useApi } from '@/lib/hook';
import { Order, PageResult, Product } from '@/lib/types';
import { formatCurrency } from '@/components/ui';
import { api } from '@/lib/client';

export default function OrderForm({
  customerId,
  leadId,
  onSaved,
  onError,
  compact,
}: {
  customerId: string;
  leadId?: string;
  onSaved?: (order: Order) => void;
  onError?: (msg: string) => void;
  compact?: boolean;
}) {
  const products = useApi<PageResult<Product>>('/products?limit=100');
  // Pricing is server-authoritative: only product + quantity are sent.
  const [items, setItems] = useState<Array<{ productId: string; quantity: number }>>([]);
  const [productSearch, setProductSearch] = useState('');
  const [shipping, setShipping] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const filteredProducts = useMemo(() => {
    const all = (products.data?.items ?? []).filter((p) => p.stock > 0);
    const q = productSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [products.data, productSearch]);

  const preview = useMemo(() => {
    if (!products.data) return null;
    const byId = new Map((products.data.items ?? []).map((p) => [p.id, p]));
    const lines = items
      .filter((i) => i.productId && i.quantity > 0)
      .map((i) => {
        const p = byId.get(i.productId);
        if (!p) return null;
        const price = Number(p.price);
        return { name: p.name, qty: i.quantity, price, line: price * i.quantity };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const subtotal = lines.reduce((s, x) => s + x.line, 0);
    const ship = shipping.trim() ? Number(shipping) : 0;
    return { lines, subtotal, ship, total: subtotal + ship };
  }, [items, shipping, products.data]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valid = items.filter((i) => i.productId && i.quantity > 0);
    if (valid.length === 0) {
      onError?.('Add at least one product with a quantity.');
      return;
    }
    setBusy(true);
    try {
      const order = await api<Order>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          ...(leadId ? { leadId } : {}),
          items: valid.map((i) => ({ productId: i.productId, quantity: Number(i.quantity) })),
          ...(shipping.trim() ? { shippingCharges: Number(shipping) } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      setItems([]);
      setShipping('');
      setNotes('');
      onSaved?.(order);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Could not create order');
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const label = 'mb-1 block text-xs font-medium text-slate-600';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {(products.data?.items ?? []).length > 8 && (
        <input
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          placeholder="Filter products by name or SKU…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      )}
      {items.length === 0 && <p className="text-xs text-slate-500">No products added yet.</p>}
      {items.map((item, index) => {
        const product = (products.data?.items ?? []).find((p) => p.id === item.productId);
        return (
          <div key={index} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex gap-2">
              <select
                value={item.productId}
                onChange={(e) =>
                  setItems((arr) => arr.map((it, i) => (i === index ? { ...it, productId: e.target.value } : it)))
                }
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select product…</option>
                {filteredProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · ₹{p.price} · stock {p.stock}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) =>
                  setItems((arr) => arr.map((it, i) => (i === index ? { ...it, quantity: Number(e.target.value) } : it)))
                }
                className="w-16 rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setItems((arr) => arr.filter((_, i) => i !== index))}
                className="rounded-lg px-2 text-sm text-red-600 hover:bg-red-50"
              >
                ✕
              </button>
            </div>
            {product && (
              <p className="text-xs text-slate-500">
                {product.name} · ₹{product.price} × {item.quantity} = {formatCurrency(Number(product.price) * item.quantity)}
              </p>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => setItems((arr) => [...arr, { productId: '', quantity: 1 }])}
        disabled={products.loading}
        className="text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        + Add product
      </button>

      {!compact && (
        <>
          <div>
            <label className={label}>Shipping charge (₹)</label>
            <input
              type="number"
              min={0}
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              placeholder="0"
              className={input}
            />
          </div>
          <div>
            <label className={label}>Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note on the order"
              className={input}
            />
          </div>
        </>
      )}

      {preview && (preview.lines.length > 0 || Number(preview.ship) > 0) && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{formatCurrency(preview.subtotal)}</span>
          </div>
          {preview.ship > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Shipping</span>
              <span>{formatCurrency(preview.ship)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900">
            <span>Total (excl. GST)</span>
            <span>{formatCurrency(preview.total)}</span>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={busy || products.loading}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? 'Creating order…' : 'Create order'}
      </button>
    </form>
  );
}
