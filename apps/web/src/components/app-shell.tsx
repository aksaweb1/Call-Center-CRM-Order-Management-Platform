'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  PhoneCall,
  ShoppingCart,
  Package,
  CalendarClock,
  BarChart3,
  Settings,
  Search,
  LogOut,
  UserPlus,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/client';
import { useEffect, useState } from 'react';
import { useCall } from '@/components/call-context';
import { Phone } from 'lucide-react';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/leads', label: 'Leads', icon: UserPlus },
  { href: '/calls', label: 'Calls', icon: PhoneCall },
  { href: '/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/followups', label: 'Follow-ups', icon: CalendarClock, badge: true },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const ADMIN_NAV = [
  { href: '/users', label: 'Employees', icon: UserCog },
  { href: '/permissions', label: 'Permissions', icon: ShieldCheck },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const callCtx = useCall();

  useEffect(() => {
    if (!user?.permissions?.includes('followup.read')) {
      setPendingCount(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      api<{ count: number }>('/followups/pending-count')
        .then((d) => {
          if (!cancelled) setPendingCount(d.count);
        })
        .catch(() => {
          if (!cancelled) setPendingCount(null);
        });
    };
    load();
    const t = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user?.id, user?.permissions]);

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center border-b border-slate-200 px-4">
          <Link href="/" className="text-lg font-bold text-slate-900">
            Call Center CRM
          </Link>
        </div>

        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
              {(user?.fullName ?? user?.email ?? 'U').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {user?.fullName || user?.email}
              </p>
              <p className="text-xs text-slate-500">{user?.role ?? '—'}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            const showBadge = item.badge && pendingCount != null && pendingCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
          {user?.role === 'SUPER_ADMIN' &&
            ADMIN_NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
        </nav>

        <div className="border-t border-slate-200 p-2">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <div className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Search customers, orders…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-3">
            {callCtx?.activeCall && (
              <button
                onClick={() => callCtx.setMinimized(false)}
                className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                <Phone className="h-4 w-4" />
                Call running — {callCtx.activeCall.status} {callCtx.callElapsed > 0 ? `${Math.floor(callCtx.callElapsed / 60)}:${String(callCtx.callElapsed % 60).padStart(2, '0')}` : ''}
              </button>
            )}
            <span className="text-sm text-slate-500">{new Date().toLocaleDateString()}</span>
          </div>
        </div>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}