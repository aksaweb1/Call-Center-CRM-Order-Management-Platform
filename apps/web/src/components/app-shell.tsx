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
  LogOut,
  UserPlus,
  ShieldCheck,
  UserCog,
  Radio,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/client';
import { useEffect, useState } from 'react';
import { useCall } from '@/components/call-context';
import { GlobalSearch } from '@/components/global-search';
import { Phone } from 'lucide-react';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/leads', label: 'Leads', icon: UserPlus },
  { href: '/calls', label: 'Calls', icon: PhoneCall },
  { href: '/calls/live', label: 'Live Calls', icon: Radio, supervisorOnly: true },
  { href: '/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/followups', label: 'Follow-ups', icon: CalendarClock, badge: true },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const ADMIN_NAV: Array<{ href: string; label: string; icon: typeof UserCog; roles: string[] }> = [
  { href: '/users', label: 'Employees', icon: UserCog, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/permissions', label: 'Permissions', icon: ShieldCheck, roles: ['SUPER_ADMIN'] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const callCtx = useCall();

  useEffect(() => {
    if (!user?.permissions?.includes('followup.read')) {
      setPendingCount(null);
      return;
    }
    let cancelled = false;
    // Badge = follow-ups that need action now (overdue + due today).
    const load = () => {
      Promise.all([
        api<Array<unknown>>('/followups/today').catch(() => []),
        api<Array<unknown>>('/followups/overdue').catch(() => []),
      ]).then(([today, overdue]) => {
        if (!cancelled) setPendingCount((today.length ?? 0) + (overdue.length ?? 0));
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

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {drawerOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}
      <aside
        className={`flex w-60 flex-col border-r border-slate-200 bg-white fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 lg:static lg:translate-x-0 ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <Link href="/" className="text-lg font-bold text-slate-900">
            Call Center CRM
          </Link>
          <button
            onClick={() => setDrawerOpen(false)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
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
          {NAV.filter((item: { supervisorOnly?: boolean }) => {
            if (!item.supervisorOnly) return true;
            return ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEADER'].includes(user?.role ?? '');
          }).map((item) => {
            // "/calls" shouldn't light up while on "/calls/live".
            const active =
              item.href === '/calls'
                ? pathname === '/calls' || (pathname.startsWith('/calls/') && !pathname.startsWith('/calls/live'))
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            const showBadge = item.badge && pendingCount != null && pendingCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
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
          {ADMIN_NAV.filter((item) => item.roles.includes(user?.role ?? '')).map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
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

      <main className="min-w-0 flex-1 overflow-auto">
        <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen((o) => !o)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden sm:block">
              <GlobalSearch />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {callCtx?.activeCall && (
              <button
                onClick={() => callCtx.setMinimized(false)}
                className="flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 lg:px-4"
              >
                <Phone className="h-4 w-4" />
                <span className="hidden sm:inline">Call running — {callCtx.activeCall.status} {callCtx.callElapsed > 0 ? `${Math.floor(callCtx.callElapsed / 60)}:${String(callCtx.callElapsed % 60).padStart(2, '0')}` : ''}</span>
                <span className="sm:hidden">Call · {callCtx.callElapsed > 0 ? `${Math.floor(callCtx.callElapsed / 60)}:${String(callCtx.callElapsed % 60).padStart(2, '0')}` : callCtx.activeCall.status}</span>
              </button>
            )}
            <span suppressHydrationWarning className="hidden text-sm text-slate-500 sm:block">{new Date().toLocaleDateString()}</span>
          </div>
        </div>
        <div className="border-b border-slate-200 bg-white px-4 py-2 sm:hidden">
          <GlobalSearch />
        </div>
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}