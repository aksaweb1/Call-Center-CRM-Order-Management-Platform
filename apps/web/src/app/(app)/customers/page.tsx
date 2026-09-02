'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/hook';
import { usePageTitle } from '@/lib/use-page-title';
import { Customer, PageResult } from '@/lib/types';
import { Spinner, EmptyState, Badge, TableSkeleton } from '@/components/ui';

export default function CustomersPage() {
  usePageTitle('Customers');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const qs = new URLSearchParams({ page: String(page), limit: '20' });
  if (search) qs.set('search', search);
  const { data, loading, error } = useApi<PageResult<Customer>>(`/customers?${qs.toString()}`);

  const customers = useMemo(() => data?.items ?? [], [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Customers</h1>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name, phone, email…"
          className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {loading && <TableSkeleton rows={6} cols={5} />}
      {error && <EmptyState title="Could not load customers" description={error} />}

      {!loading && !error && (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Tags</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      No customers found.
                    </td>
                  </tr>
                )}
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.id}`} className="font-medium text-blue-600 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <a href={`tel:${c.phone}`} className="hover:text-emerald-600">{c.phone}</a>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{c.city ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.tags?.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">
                Page {data.page} of {data.totalPages} · {data.total} customers
              </span>
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