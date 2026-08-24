'use client';

import { useApi } from '@/lib/hook';
import { Spinner, EmptyState } from '@/components/ui';

interface Setting {
  key: string;
  value: unknown;
  description?: string | null;
}

export default function SettingsPage() {
  const { data, loading, error } = useApi<Setting[]>('/settings');

  if (loading) return <Spinner />;
  if (error) return <EmptyState title="Could not load settings" description={error} />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Settings</h1>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!data || data.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                  No settings configured yet.
                </td>
              </tr>
            ) : (
              data.map((s) => (
                <tr key={s.key} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{s.key}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{s.description ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}