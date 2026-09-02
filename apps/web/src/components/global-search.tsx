'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, UserPlus, ShoppingCart, Package } from 'lucide-react';
import { api } from '@/lib/client';
import type { SearchResult } from '@/lib/types';

type Item = {
  key: string;
  group: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href: string;
};

const GROUP_ORDER = ['Customers', 'Leads', 'Orders', 'Products'];

/**
 * Global search wired to GET /search?q= (customers + leads + orders +
 * products). Debounced, abort-safe, keyboard-navigable, and focused with
 * Cmd/Ctrl+K from anywhere.
 */
export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // Cmd/Ctrl+K focuses the search from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Debounced search with stale-response guard.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    let stale = false;
    const t = setTimeout(() => {
      api<SearchResult>(`/search?q=${encodeURIComponent(term)}&limit=6`)
        .then((r) => {
          if (!stale) {
            setResults(r);
            setActiveIdx(0);
          }
        })
        .catch(() => {
          if (!stale) setResults(null);
        });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  const items = useMemo<Item[]>(() => {
    if (!results) return [];
    const list: Item[] = [];
    for (const c of results.customers ?? []) {
      list.push({
        key: `c-${c.id}`,
        group: 'Customers',
        icon: <User className="h-4 w-4" />,
        title: c.name,
        subtitle: [c.phone, c.email].filter(Boolean).join(' · '),
        href: `/customers/${c.id}`,
      });
    }
    for (const l of results.leads ?? []) {
      list.push({
        key: `l-${l.id}`,
        group: 'Leads',
        icon: <UserPlus className="h-4 w-4" />,
        title: l.title || l.customer?.name || 'Lead',
        subtitle: l.customer ? `${l.customer.name} · ${l.customer.phone} · ${l.status}` : l.status,
        href: `/leads/${l.id}`,
      });
    }
    for (const o of results.orders ?? []) {
      list.push({
        key: `o-${o.id}`,
        group: 'Orders',
        icon: <ShoppingCart className="h-4 w-4" />,
        title: o.orderNumber,
        subtitle: `${o.status} · ₹${o.total}`,
        href: `/orders/${o.id}`,
      });
    }
    for (const p of results.products ?? []) {
      list.push({
        key: `p-${p.id}`,
        group: 'Products',
        icon: <Package className="h-4 w-4" />,
        title: p.name,
        subtitle: `${p.sku} · ₹${p.price}`,
        href: '/products',
      });
    }
    return list
      .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
      .slice(0, 12);
  }, [results]);

  const go = useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      setOpen(false);
      setQ('');
      setResults(null);
      router.push(item.href);
    },
    [router],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(items[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search customers, leads, orders…"
        aria-label="Global search"
        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-12 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:block">
        ⌘K
      </kbd>

      {showDropdown && (
        <div className="absolute z-30 mt-1 max-h-96 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No matches for “{q.trim()}”.</p>
          ) : (
            <>
              {items.map((item, idx) => {
                const newGroup = idx === 0 || items[idx - 1].group !== item.group;
                return (
                  <div key={item.key}>
                    {newGroup && (
                      <p className="border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {item.group}
                      </p>
                    )}
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault(); // keep input focus until navigation
                        go(item);
                      }}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                        idx === activeIdx ? 'bg-blue-50' : ''
                      }`}
                    >
                      <span className="text-slate-400">{item.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">{item.title}</span>
                        {item.subtitle && (
                          <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>
                        )}
                      </span>
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
