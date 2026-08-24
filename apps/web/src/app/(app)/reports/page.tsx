'use client';

import { useState } from 'react';
import { useApi } from '@/lib/hook';
import { Spinner, EmptyState, formatCurrency } from '@/components/ui';
import { API_URL } from '@/lib/api';
import { getCookie } from '@/lib/client';

type ReportType = 'sales' | 'calls' | 'fulfillment' | 'inventory' | 'leads';

const TYPES: ReportType[] = ['sales', 'calls', 'fulfillment', 'inventory', 'leads'];

export default function ReportsPage() {
  const [type, setType] = useState<ReportType>('sales');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);

  const { data, loading, error, reload } = useApi<unknown>(`/reports/${type}${qs.toString() ? `?${qs}` : ''}`);

  function download() {
    const params = qs.toString() ? `?${qs}` : '';
    const token = getCookie('access_token');
    window.open(`${API_URL}/reports/${type}/export${params}`, '_blank');
    if (token) {
      // Re-fetch isn't needed; export works via cookie-less bearer in header only for fetch.
      fetch(`${API_URL}/reports/${type}/export${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (res) => {
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}-report.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Reports</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={reload}
            className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium hover:bg-slate-200"
          >
            Apply
          </button>
          <button
            onClick={download}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${
              type === t ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <Spinner />}
      {error && <EmptyState title="Could not load report" description={error} />}

      {!loading && !error && data ? (
        <ReportView data={data as Record<string, unknown>} type={type} />
      ) : null}
    </div>
  );
}

function ReportView({ data, type }: { data: Record<string, unknown>; type: ReportType }) {
  const summary = data.summary as Record<string, unknown> | undefined;

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Object.entries(summary).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">{k}</p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {typeof v === 'number' && type === 'sales' && /revenue|average/i.test(k)
                  ? formatCurrency(v)
                  : String(v)}
              </p>
            </div>
          ))}
        </div>
      )}

      {Object.entries(data)
        .filter(([k]) => k !== 'summary' && k !== 'range')
        .map(([k, v]) => (
          <div key={k} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 capitalize">
              {k.replace(/([A-Z])/g, ' $1').toLowerCase()}
            </div>
            <div className="overflow-x-auto p-4 text-sm">
              <GenericTable data={v} />
            </div>
          </div>
        ))}
    </div>
  );
}

function GenericTable({ data }: { data: unknown }) {
  if (Array.isArray(data)) {
    if (data.length === 0) return <p className="text-slate-400">No data.</p>;
    const cols = [...new Set(data.flatMap((r) => (typeof r === 'object' && r ? Object.keys(r) : [])))];
    return (
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>{cols.map((c) => <th key={c} className="py-2 pr-4">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className="py-2 pr-4 text-slate-700">
                  {typeof row === 'object' && row ? String((row as Record<string, unknown>)[c] ?? '') : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (data && typeof data === 'object') {
    return (
      <pre className="whitespace-pre-wrap text-slate-700">{JSON.stringify(data, null, 2)}</pre>
    );
  }
  return <p className="text-slate-700">{String(data)}</p>;
}