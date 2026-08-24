'use client';

import { useState } from 'react';
import {
  PhoneCall,
  Users,
  ShoppingBag,
  CalendarClock,
  Phone,
  TrendingUp,
  Wallet,
  Crown,
  Package,
  BarChart3,
  ListOrdered,
  Percent,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hook';
import { AgentDashboard, ManagerDashboard, CeoDashboard } from '@/lib/types';
import { Card, Spinner, EmptyState, formatCurrency } from '@/components/ui';

const MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEADER', 'QA'];

function compactCurrency(value: number): string {
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return String(Math.round(value));
}

const LEAD_TONES: Record<string, string> = {
  CONVERTED: 'bg-emerald-500',
  ORDER_CREATED: 'bg-emerald-500',
  INTERESTED: 'bg-blue-500',
  NEW: 'bg-blue-500',
  ASSIGNED: 'bg-amber-500',
  CALLING: 'bg-amber-500',
  CALL_BACK_REQUESTED: 'bg-amber-500',
  NOT_INTERESTED: 'bg-red-500',
  CANCELLED: 'bg-red-500',
  WRONG_NUMBER: 'bg-red-500',
  NO_ANSWER: 'bg-slate-400',
  BUSY: 'bg-slate-400',
  INVALID_NUMBER: 'bg-slate-400',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'AGENT';
  const isManager = MANAGER_ROLES.includes(role);

  if (!isManager) return <AgentDashboardView />;
  return <ManagerDashboardView />;
}

function AgentDashboardView({ agentId: propAgentId }: { agentId?: string } = {}) {
  const { user } = useAuth();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(propAgentId ?? null);
  const isManager = user ? MANAGER_ROLES.includes(user.role) : false;
  const url = selectedAgent ? `/dashboard/agent/${selectedAgent}` : '/dashboard/agent';
  const { data, loading, error } = useApi<AgentDashboard>(url);
  const agents = useApi<{ items: Array<{ id: string; fullName: string }> }>('/users?roleKey=AGENT&limit=100');

  if (loading) return <Spinner />;
  if (error) return <EmptyState title="Could not load dashboard" description={error} />;
  if (!data) return <EmptyState title="No data yet" />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Welcome back, {user?.fullName?.split(' ')[0] ?? 'agent'}
          </h1>
          <p className="text-sm text-slate-500">Here is your performance today.</p>
        </div>
        {isManager && (
          <select value={selectedAgent ?? ''} onChange={(e) => setSelectedAgent(e.target.value || null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">My dashboard</option>
            {(agents.data?.items ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.fullName}</option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card title="Leads Today" value={String(data.leadsToday)} icon={<Users className="h-4 w-4" />} />
        <Card title="Calls Today" value={String(data.callsToday)} icon={<PhoneCall className="h-4 w-4" />} accent="bg-violet-50 text-violet-600" />
        <Card title="Pending Follow-ups" value={String(data.pendingFollowUps)} icon={<CalendarClock className="h-4 w-4" />} accent="bg-amber-50 text-amber-600" />
        <Card title="Pending Orders" value={String(data.pendingOrders)} icon={<ShoppingBag className="h-4 w-4" />} accent="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card title="Sales Today" value={formatCurrency(data.salesToday)} icon={<Wallet className="h-4 w-4" />} accent="bg-emerald-50 text-emerald-600" />
        <Card title="Orders Today" value={String(data.ordersToday)} icon={<ShoppingBag className="h-4 w-4" />} />
        <Card title="Conversion" value={`${data.conversionPercent}%`} icon={<TrendingUp className="h-4 w-4" />} accent="bg-blue-50 text-blue-600" />
        <Card title="Avg Call Duration" value={`${Math.round(data.averageCallSecs / 60)}m ${data.averageCallSecs % 60}s`} icon={<Phone className="h-4 w-4" />} accent="bg-violet-50 text-violet-600" />
      </div>
    </div>
  );
}

function ManagerDashboardView() {
  const [tab, setTab] = useState<'overview' | 'executive' | 'agent'>('overview');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const { user } = useAuth();
  const isCeo = user?.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Team performance overview</p>
        </div>
        {isCeo && (
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              onClick={() => setTab('overview')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === 'overview' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Team Overview
            </button>
            <button
              onClick={() => setTab('executive')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === 'executive' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <Crown className="h-3.5 w-3.5" /> Executive
              </span>
            </button>
          </div>
        )}
      </div>

      {tab === 'agent' && selectedAgent ? (
        <AgentDashboardView agentId={selectedAgent} />
      ) : tab === 'overview' ? (
        <ManagerOverview onSelectAgent={(id) => { setSelectedAgent(id); setTab('agent'); }} />
      ) : (
        <ExecutiveOverview />
      )}
    </div>
  );
}

function ManagerOverview({ onSelectAgent }: { onSelectAgent?: (id: string) => void }) {
  const { data, loading, error } = useApi<ManagerDashboard>('/dashboard/manager');

  if (loading) return <Spinner />;
  if (error) return <EmptyState title="Could not load dashboard" description={error} />;
  if (!data) return <EmptyState title="No data yet" />;

  const maxLeads = Math.max(1, ...data.leadFunnel.map((l) => l._count._all));
  const maxOrders = Math.max(1, ...data.ordersByStatus.map((o) => o._count._all));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card title="Revenue (30d)" value={formatCurrency(data.revenue)} icon={<Wallet className="h-4 w-4" />} accent="bg-emerald-50 text-emerald-600" />
        <Card title="Orders (30d)" value={String(data.totalOrders)} icon={<ShoppingBag className="h-4 w-4" />} />
        <Card title="Pending Follow-ups" value={String(data.pendingFollowUps)} icon={<CalendarClock className="h-4 w-4" />} accent="bg-amber-50 text-amber-600" />
        <Card title="Avg Call Duration" value={`${Math.round(data.callStats.avgDurationSecs / 60)}m ${data.callStats.avgDurationSecs % 60}s`} icon={<Phone className="h-4 w-4" />} accent="bg-violet-50 text-violet-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ListOrdered className="h-4 w-4 text-slate-400" /> Lead Funnel
          </h3>
          <div className="space-y-3">
            {data.leadFunnel.map((l) => (
              <div key={l.status} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-xs text-slate-600">{l.status}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${LEAD_TONES[l.status] ?? 'bg-slate-400'}`}
                    style={{ width: `${(l._count._all / maxLeads) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-semibold text-slate-700">{l._count._all}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ShoppingBag className="h-4 w-4 text-slate-400" /> Orders by Status
          </h3>
          <div className="space-y-3">
            {data.ordersByStatus.map((o) => (
              <div key={o.status} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-xs text-slate-600">{o.status}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${(o._count._all / maxOrders) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-semibold text-slate-700">{o._count._all}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Users className="h-4 w-4 text-slate-400" /> Top Agents by Revenue
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-4">Agent</th>
                <th className="py-2 pr-4">Orders</th>
                <th className="py-2 pr-4">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.agentRanking.map((a) => (
                <tr key={a.agentId ?? a.agentName} onClick={() => a.agentId && onSelectAgent?.(a.agentId)} className={a.agentId ? 'cursor-pointer hover:bg-slate-50' : ''}>
                  <td className="py-2.5 pr-4 font-medium text-blue-600 hover:underline">{a.agentName}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{a.orders}</td>
                  <td className="py-2.5 pr-4 font-semibold text-slate-800">{formatCurrency(a.revenue)}</td>
                </tr>
              ))}
              {data.agentRanking.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-slate-400">No orders in this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ExecutiveOverview() {
  const { data, loading, error } = useApi<CeoDashboard>('/dashboard/ceo');

  if (loading) return <Spinner />;
  if (error) return <EmptyState title="Could not load executive dashboard" description={error} />;
  if (!data) return <EmptyState title="No data yet" />;

  const maxRevenue = Math.max(1, ...data.monthlyRevenue.map((m) => m.total));
  const maxLeads = Math.max(1, ...data.leadBySource.map((s) => s.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card title="Revenue (90d)" value={formatCurrency(data.revenue)} icon={<Wallet className="h-4 w-4" />} accent="bg-emerald-50 text-emerald-600" />
        <Card title="Orders (90d)" value={String(data.totalOrders)} icon={<ShoppingBag className="h-4 w-4" />} />
        <Card title="Cancellation Rate" value={`${data.cancellationRate.toFixed(1)}%`} icon={<Percent className="h-4 w-4" />} accent="bg-red-50 text-red-600" />
        <Card title="Top Sources" value={String(data.leadBySource.length)} icon={<BarChart3 className="h-4 w-4" />} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <TrendingUp className="h-4 w-4 text-slate-400" /> Monthly Revenue
        </h3>
        <div className="flex h-40 items-end gap-3">
          {data.monthlyRevenue.map((m) => (
            <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] font-medium text-slate-500">
                {compactCurrency(m.total)}
              </span>
              <div
                className="w-full rounded-t-md bg-blue-500"
                style={{ height: `${(m.total / maxRevenue) * 100}%`, minHeight: m.total > 0 ? 4 : 0 }}
              />
              <span className="text-[10px] text-slate-500">{m.month}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Package className="h-4 w-4 text-slate-400" /> Top Products
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">Qty</th>
                  <th className="py-2 pr-4">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.topProducts.map((p) => (
                  <tr key={p.id ?? p.name}>
                    <td className="py-2.5 pr-4 font-medium text-slate-800">{p.name}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{p.sku ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{p.quantity}</td>
                    <td className="py-2.5 pr-4 font-semibold text-slate-800">{formatCurrency(p.lineTotal)}</td>
                  </tr>
                ))}
                {data.topProducts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-slate-400">No sales in this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Users className="h-4 w-4 text-slate-400" /> Leads by Source
          </h3>
          <div className="space-y-3">
            {data.leadBySource.map((s) => (
              <div key={s.sourceId ?? s.sourceName} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-xs text-slate-600">{s.sourceName}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-violet-500"
                    style={{ width: `${(s.count / maxLeads) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-semibold text-slate-700">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
