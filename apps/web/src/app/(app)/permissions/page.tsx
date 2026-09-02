'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useApi } from '@/lib/hook';
import { useAuth } from '@/lib/auth';
import {
  PageResult,
  PermissionModule,
  User,
  UserEffectivePermissions,
} from '@/lib/types';
import { Badge, EmptyState, Spinner } from '@/components/ui';
import { api } from '@/lib/client';

type TriState = 'grant' | 'revoke' | 'default';

export default function PermissionsPage() {
  const { user } = useAuth();
  const users = useApi<PageResult<User>>('/users?limit=100');
  const catalog = useApi<PermissionModule[]>('/permissions');

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [overrides, setOverrides] = useState<Record<string, TriState>>({});
  // Last saved tri-state map — used to detect unsaved changes.
  const [savedOverrides, setSavedOverrides] = useState<Record<string, TriState>>({});
  const [details, setDetails] = useState<UserEffectivePermissions | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const allUsers = useMemo(() => users.data?.items ?? [], [users.data]);

  // Unsaved changes exist when the current selection differs from the last
  // saved tri-state map.
  const isDirty = useMemo(() => {
    const keys = new Set([...Object.keys(overrides), ...Object.keys(savedOverrides)]);
    for (const k of keys) {
      if ((overrides[k] ?? 'default') !== (savedOverrides[k] ?? 'default')) return true;
    }
    return false;
  }, [overrides, savedOverrides]);

  const selectableUsers = useMemo(
    () => allUsers.filter((u) => u.role?.key !== 'SUPER_ADMIN'),
    [allUsers],
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return selectableUsers;
    return selectableUsers.filter((u) =>
      [u.fullName, u.email, u.role?.key, u.role?.name, u.team?.name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [selectableUsers, search]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function loadDetail(userId: string) {
    setLoadingDetail(true);
    setMessage('');
    try {
      const d = await api<UserEffectivePermissions>(`/users/${userId}/permissions`);
      const base = computeTriStates(d);
      setDetails(d);
      setOverrides(base);
      setSavedOverrides(base);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not load permissions');
    } finally {
      setLoadingDetail(false);
    }
  }

  function computeTriStates(d: UserEffectivePermissions): Record<string, TriState> {
    const map: Record<string, TriState> = {};
    for (const k of d.granted) map[k] = 'grant';
    for (const k of d.revoked) map[k] = 'revoke';
    return map;
  }

  useEffect(() => {
    if (selectedUserId) loadDetail(selectedUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  function cycle(key: string) {
    setOverrides((prev) => {
      const cur = prev[key] ?? 'default';
      const next: TriState = cur === 'default' ? 'grant' : cur === 'grant' ? 'revoke' : 'default';
      const copy = { ...prev };
      if (next === 'default') delete copy[key];
      else copy[key] = next;
      return copy;
    });
  }

  async function handleSave() {
    if (!selectedUserId) return;
    setSaving(true);
    setMessage('');
    try {
      const d = await api<UserEffectivePermissions>(`/users/${selectedUserId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({
          granted: Object.entries(overrides)
            .filter(([, v]) => v === 'grant')
            .map(([k]) => k),
          revoked: Object.entries(overrides)
            .filter(([, v]) => v === 'revoke')
            .map(([k]) => k),
        }),
      });
      const base = computeTriStates(d);
      setDetails(d);
      setOverrides(base);
      setSavedOverrides(base);
      setMessage('Permissions saved. The change applies on the next login / token refresh.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save permissions');
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== 'SUPER_ADMIN') {
    return <EmptyState title="Access denied" description="Only the SUPER_ADMIN can manage permissions." />;
  }

  if (users.loading || catalog.loading) return <Spinner />;
  if (users.error) return <EmptyState title="Could not load users" description={users.error} />;

  const selected = selectedUserId
    ? allUsers.find((u) => u.id === selectedUserId)
    : undefined;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Permissions</h1>
        <p className="text-sm text-slate-500">
          Give or take any permission to or from an agent. Super admin can never be limited.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <label className="mb-2 block text-sm font-medium text-slate-700">Select an agent</label>
        <div ref={boxRef} className="relative w-full max-w-md">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search by name, email, role or team…"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {open && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {filteredUsers.length === 0 && (
                <p className="px-4 py-3 text-sm text-slate-500">No agent matches “{search}”.</p>
              )}
              {filteredUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setSelectedUserId(u.id);
                    setSearch('');
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50 ${
                    selectedUserId === u.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{u.fullName}</span>
                    <span className="block truncate text-xs text-slate-500">{u.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {u.role?.name ?? u.role?.key}
                    {u.team?.name ? ` · ${u.team.name}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected && details && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="blue">Role: {details.role}</Badge>
            <Badge tone="slate">{details.rolePermissions.length} from role</Badge>
            <Badge tone="green">{details.granted.length} granted</Badge>
            <Badge tone="red">{details.revoked.length} revoked</Badge>
          </div>
        )}
      </div>

      {selected && details && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {selected.fullName} — click a permission to cycle (from role → granted → revoked)
            </h2>
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              title={isDirty ? 'Save permission changes' : 'No changes to save'}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : isDirty ? 'Save changes' : 'Saved'}
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {(catalog.data ?? []).map((mod) => (
              <div key={mod.module} className="px-4 py-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {mod.module}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {mod.permissions.map((p) => {
                    const state = overrides[p.key] ?? 'default';
                    const fromRole = (details.rolePermissions ?? []).includes(p.key);
                    const effective = (details.effective ?? []).includes(p.key);
                    return (
                      <button
                        key={p.key}
                        onClick={() => cycle(p.key)}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                          state === 'grant'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : state === 'revoke'
                              ? 'border-red-300 bg-red-50 text-red-800'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-mono">{p.key}</span>
                        <span className="ml-2 shrink-0">
                          {state === 'grant' ? (
                            <Badge tone="green">grant</Badge>
                          ) : state === 'revoke' ? (
                            <Badge tone="red">revoke</Badge>
                          ) : fromRole ? (
                            <Badge tone="slate">role</Badge>
                          ) : (
                            <Badge tone="slate">no</Badge>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loadingDetail && <Spinner label="Loading permissions…" />}
      {message && <p className="text-sm text-slate-600">{message}</p>}
    </div>
  );
}