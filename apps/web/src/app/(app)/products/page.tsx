'use client';

import { useMemo, useState } from 'react';
import { useApi } from '@/lib/hook';
import { useAuth } from '@/lib/auth';
import { Category, PageResult, Product } from '@/lib/types';
import { Badge, EmptyState, Spinner, formatCurrency } from '@/components/ui';
import { api } from '@/lib/client';

type Mode = 'add' | 'edit' | null;

export default function ProductsPage() {
  const { user } = useAuth();
  const canCreate = user?.permissions?.includes('product.create') ?? false;
  const canUpdate = user?.permissions?.includes('product.update') ?? false;
  const canDelete = user?.permissions?.includes('product.delete') ?? false;
  const canStock = user?.permissions?.includes('inventory.update') ?? false;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [mode, setMode] = useState<Mode>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const qs = new URLSearchParams({ page: String(page), limit: '20' });
  if (search.trim()) qs.set('search', search.trim());

  const { data, loading, error, reload } = useApi<PageResult<Product>>(
    `/products?${qs.toString()}&_=${refreshKey}`,
  );
  const cats = useApi<Category[]>('/products/categories');

  const products = useMemo(() => data?.items ?? [], [data]);
  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cats.data ?? []) m.set(c.id, c.name);
    return m;
  }, [cats.data]);

  function refresh() {
    setRefreshKey((k) => k + 1);
    void reload();
  }

  async function handleDelete(p: Product) {
    if (!confirm(`Delete product "${p.name}"?`)) return;
    try {
      await api(`/products/${p.id}`, { method: 'DELETE' });
      setMsg({ tone: 'ok', text: `${p.name} deleted.` });
      refresh();
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not delete product' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Products</h1>
        <div className="flex items-center gap-2">
          {canCreate && (
            <button
              onClick={() => {
                setEditing(null);
                setMode('add');
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              + Add Product
            </button>
          )}
          <CategoryManager cats={cats} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} onChanged={refresh} />
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

      {mode && (
        <ProductForm
          mode={mode}
          product={editing}
          categories={cats.data ?? []}
          onClose={() => setMode(null)}
          onSaved={() => {
            setMode(null);
            setMsg({ tone: 'ok', text: mode === 'add' ? 'Product created.' : 'Product updated.' });
            refresh();
          }}
          onError={(m) => setMsg({ tone: 'err', text: m })}
        />
      )}

      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name or SKU…"
          className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {loading && <Spinner />}
      {error && <EmptyState title="Could not load products" description={error} />}

      {!loading && !error && (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Status</th>
                  {(canUpdate || canDelete || canStock) && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      No products yet.
                    </td>
                  </tr>
                )}
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.sku}</td>
                    <td className="px-4 py-3 text-slate-600">{p.category?.name ?? categoryMap.get(p.categoryId ?? '') ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-900">
                      {formatCurrency(p.price)}
                      {Number(p.discount ?? 0) > 0 && (
                        <span className="ml-1 text-xs text-emerald-600">-{p.discount}%</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.stock}
                      {canStock && (
                        <button
                          onClick={() => {
                            const qty = prompt(`Adjust stock for ${p.name} (use + or - value):`, '0');
                            if (qty === null) return;
                            const n = Number(qty);
                            if (Number.isNaN(n)) return;
                            const reason = prompt('Reason for adjustment:', 'MANUAL');
                            if (reason === null) return;
                            void (async () => {
                              try {
                                await api(`/products/${p.id}/stock`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ quantity: n, reason: reason.trim() || 'MANUAL' }),
                                });
                                setMsg({ tone: 'ok', text: `Stock updated for ${p.name}.` });
                                refresh();
                              } catch (e) {
                                setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not adjust stock' });
                              }
                            })();
                          }}
                          className="ml-2 text-xs font-medium text-blue-600 hover:underline"
                          title="Adjust stock"
                        >
                          adjust
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={p.isActive ? 'green' : 'slate'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    {(canUpdate || canDelete) && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {canUpdate && (
                            <button
                              onClick={() => {
                                setEditing(p);
                                setMode('edit');
                              }}
                              className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(p)}
                              className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
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

function ProductForm({
  mode,
  product,
  categories,
  onClose,
  onSaved,
  onError,
}: {
  mode: 'add' | 'edit';
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [sku, setSku] = useState(product?.sku ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [desc, setDesc] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product?.price ?? '');
  const [discount, setDiscount] = useState(product ? String(product.discount ?? 0) : '');
  const [gstRate, setGstRate] = useState(product ? String(product.gstRate ?? 18) : '18');
  const [stock, setStock] = useState(product ? String(product.stock) : '0');
  const [lowStockAt, setLowStockAt] = useState(product ? String(product.lowStockAt ?? 10) : '10');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) {
      onError('Name and SKU are required.');
      return;
    }
    setBusy(true);
    const body = {
      sku: sku.trim(),
      name: name.trim(),
      description: desc.trim() || undefined,
      price: Number(price) || 0,
      discount: Number(discount) || 0,
      gstRate: Number(gstRate) || 18,
      stock: Number(stock) || 0,
      lowStockAt: Number(lowStockAt) || 10,
      categoryId: categoryId || undefined,
      isActive,
    };
    try {
      if (mode === 'add') {
        await api('/products', { method: 'POST', body: JSON.stringify(body) });
      } else if (product) {
        await api(`/products/${product.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save product');
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const label = 'mb-1 block text-xs font-medium text-slate-600';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {mode === 'add' ? 'Add product' : `Edit ${product?.name}`}
        </h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Name *</label>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={label}>SKU *</label>
          <input className={input} value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Description</label>
          <textarea className={input} rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div>
          <label className={label}>Price (₹)</label>
          <input className={input} type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <label className={label}>Discount %</label>
          <input className={input} type="number" min={0} max={100} value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
        <div>
          <label className={label}>GST Rate %</label>
          <input className={input} type="number" min={0} max={100} value={gstRate} onChange={(e) => setGstRate(e.target.value)} />
        </div>
        <div>
          <label className={label}>Category</label>
          <select className={input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Stock</label>
          <input className={input} type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
        <div>
          <label className={label}>Low-stock threshold</label>
          <input className={input} type="number" min={0} value={lowStockAt} onChange={(e) => setLowStockAt(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
          <label className="text-sm text-slate-700">Active</label>
        </div>
        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : mode === 'add' ? 'Create' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CategoryManager({
  cats,
  canCreate,
  canUpdate,
  canDelete,
  onChanged,
}: {
  cats: { data: Category[] | null; reload: () => void };
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!canCreate && !canUpdate && !canDelete) return null;

  async function addCategory() {
    if (!name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await api('/products/categories', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      setName('');
      cats.reload();
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not create category');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(id: string, catName: string) {
    if (!confirm(`Delete category "${catName}"?`)) return;
    setBusy(true);
    try {
      await api(`/products/categories/${id}`, { method: 'DELETE' });
      cats.reload();
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not delete category');
    } finally {
      setBusy(false);
    }
  }

  async function renameCategory(id: string, current: string) {
    const next = prompt('Rename category to:', current);
    if (next === null || !next.trim()) return;
    setBusy(true);
    try {
      await api(`/products/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: next.trim() }),
      });
      cats.reload();
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not rename category');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        Categories
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Categories</h3>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          {msg && <p className="mb-2 text-xs text-red-600">{msg}</p>}
          {canCreate && (
            <div className="mb-3 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                placeholder="New category name"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={addCategory}
                disabled={busy}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {(cats.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                <span>{c.name}</span>
                <span className="flex gap-1">
                  {canUpdate && (
                    <button onClick={() => renameCategory(c.id, c.name)} className="text-xs font-medium text-blue-600 hover:underline">
                      Rename
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => deleteCategory(c.id, c.name)} className="text-xs font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  )}
                </span>
              </li>
            ))}
            {(cats.data ?? []).length === 0 && (
              <li className="px-2 py-2 text-sm text-slate-400">No categories yet.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
