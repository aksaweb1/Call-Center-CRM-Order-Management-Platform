'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@/lib/hook';
import { useAuth } from '@/lib/auth';
import { PageResult, TelephonyAccount, User } from '@/lib/types';
import { Badge, EmptyState, Spinner } from '@/components/ui';
import { api } from '@/lib/client';

const ROLE_OPTIONS = [
  { key: 'MANAGER', name: 'Manager' },
  { key: 'TEAM_LEADER', name: 'Team Leader' },
  { key: 'AGENT', name: 'Agent' },
  { key: 'DISPATCHER', name: 'Dispatcher' },
  { key: 'FINANCE', name: 'Finance' },
  { key: 'QA', name: 'QA' },
  { key: 'SUPPORT', name: 'Support' },
  { key: 'DELIVERY', name: 'Delivery' },
  { key: 'VIEWER', name: 'Viewer' },
];

const ROLE_TONE: Record<string, 'blue' | 'green' | 'red' | 'amber' | 'slate'> = {
  SUPER_ADMIN: 'red',
  MANAGER: 'blue',
  TEAM_LEADER: 'blue',
  AGENT: 'green',
  DISPATCHER: 'amber',
  FINANCE: 'amber',
  QA: 'slate',
  SUPPORT: 'green',
  DELIVERY: 'slate',
  VIEWER: 'slate',
};

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  role: 'AGENT',
  teamId: '',
  callDevice: 'MOBILE' as 'MOBILE' | 'WEB_DIALER',
  telephonyAccountId: '',
};

export default function UsersPage() {
  const { user } = useAuth();
  const users = useApi<PageResult<User>>('/users?limit=100');
  const tataAccounts = useApi<TelephonyAccount[]>('/telephony/accounts');

  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    fullName: string;
    roleKey: string;
    teamId: string;
    isActive: boolean;
    phone: string;
    callDevice: 'MOBILE' | 'WEB_DIALER';
    telephonyAccountId: string;
    password: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const allUsers = useMemo(() => users.data?.items ?? [], [users.data]);

  const teams = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of allUsers) {
      if (u.team?.id && !map.has(u.team.id)) map.set(u.team.id, u.team.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allUsers]);

  useEffect(() => {
    if ((message || error) && !creating && !saving && !editingId) {
      const t = setTimeout(() => {
        setMessage('');
        setError('');
      }, 6000);
      return () => clearTimeout(t);
    }
  }, [message, error, creating, saving, editingId]);

  function startEdit(u: User) {
    setEditingId(u.id);
    setEditForm({
      fullName: u.fullName,
      roleKey: u.role?.key ?? 'AGENT',
      teamId: u.team?.id ?? '',
      isActive: u.isActive ?? true,
      phone: u.phone ?? '',
      callDevice: (u.callDevice as 'MOBILE' | 'WEB_DIALER') ?? 'MOBILE',
      telephonyAccountId: u.telephonyAccountId ?? '',
      password: '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    setMessage('');
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
          roleKey: form.role,
          teamId: form.teamId || undefined,
          callDevice: form.callDevice,
          telephonyAccountId: form.telephonyAccountId || undefined,
        }),
      });
      const assigned = form.telephonyAccountId
        ? ` — bound to Tata ${form.telephonyAccountId}`
        : form.callDevice === 'WEB_DIALER'
          ? ' — Web dialer'
          : ` — Mobile ${form.phone}`;
      setForm(emptyForm);
      setMessage(`Agent ${form.fullName} added${assigned}.`);
      users.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add agent');
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingId || !editForm) return;
    if (editForm.password && editForm.password.length > 0 && editForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api(`/users/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: editForm.fullName,
          phone: editForm.phone.trim() || undefined,
          roleKey: editForm.roleKey,
          teamId: editForm.teamId || undefined,
          isActive: editForm.isActive,
          callDevice: editForm.callDevice,
          telephonyAccountId: editForm.telephonyAccountId || null,
          ...(editForm.password ? { password: editForm.password } : {}),
        }),
      });
      setMessage(editForm.password ? 'Changes saved — password updated.' : 'Changes saved — calls for this user will now ring on the assigned account.');
      cancelEdit();
      users.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update employee');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(u: User) {
    const ok = window.confirm(`Remove ${u.fullName}? This permanently deletes the account.`);
    if (!ok) return;
    setError('');
    setMessage('');
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' });
      setMessage(`${u.fullName} removed.`);
      users.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove employee');
    }
  }

  if (!['SUPER_ADMIN', 'ADMIN'].includes(user?.role ?? '')) {
    return <EmptyState title="Access denied" description="Only SUPER_ADMIN or ADMIN can manage employees." />;
  }

  if (users.loading) return <Spinner />;
  if (users.error) return <EmptyState title="Could not load users" description={users.error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Employees</h1>
        <p className="text-sm text-slate-500">
          Add agents, change their role or team, deactivate, or remove them. Role change affects
          their base permissions immediately.
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Add employee
        </h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Full name</label>
            <input
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Rakesh Kumar"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="agent@callcenter.local"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
            <input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="9000000099"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Password (min 8)</label>
            <input
              required
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Call source</label>
            <select
              value={form.callDevice}
              onChange={(e) => setForm({ ...form, callDevice: e.target.value as 'MOBILE' | 'WEB_DIALER' })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="MOBILE">Mobile — agent gets call on phone</option>
              <option value="WEB_DIALER">Web dialer — Smartflow browser phone</option>
            </select>
            <p className="mt-1 text-xs text-slate-400">Real dialing uses the Tata account below if assigned.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Tata account
              {tataAccounts.loading ? ' · loading…' : tataAccounts.data ? ` · ${tataAccounts.data.length} available` : ''}
            </label>
            <select
              value={form.telephonyAccountId}
              onChange={(e) => setForm({ ...form, telephonyAccountId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— not assigned (use phone/device default) —</option>
              {(tataAccounts.data ?? []).map((a) => (
                <option key={a.id} value={a.number || a.id}>
                  {a.name} · {a.number} [{a.type}]
                </option>
              ))}
            </select>
            {tataAccounts.error && <p className="mt-1 text-xs text-amber-600">Could not fetch Tata accounts: {tataAccounts.error} — you can still set mobile manually.</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Team</label>
            <select
              value={form.teamId}
              onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— none —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Adding…' : 'Add employee'}
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            All employees ({allUsers.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Team</th>
                <th className="px-4 py-3 font-medium">Call source</th>
                <th className="px-4 py-3 font-medium">Tata account</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allUsers.map((u) => {
                const isSuper = u.role?.key === 'SUPER_ADMIN';
                const editing = editingId === u.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {editing ? (
                        <div className="space-y-1">
                          <input
                            value={editForm?.fullName ?? ''}
                            onChange={(e) => setEditForm((f) => (f ? { ...f, fullName: e.target.value } : f))}
                            placeholder="Full name"
                            className="w-full max-w-[180px] rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          />
                          {!isSuper && (
                            <input
                              type="password"
                              value={editForm?.password ?? ''}
                              onChange={(e) => setEditForm((f) => (f ? { ...f, password: e.target.value } : f))}
                              placeholder="New password (leave blank = no change)"
                              autoComplete="new-password"
                              className="w-full max-w-[180px] rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-sm"
                            />
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="font-medium text-slate-900">{u.fullName}</p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {editing ? (
                        <input
                          value={editForm?.phone ?? ''}
                          onChange={(e) => setEditForm((f) => (f ? { ...f, phone: e.target.value } : f))}
                          placeholder="Mobile number"
                          className="w-full max-w-[140px] rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        u.phone ?? '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing && !isSuper ? (
                        <select
                          value={editForm?.roleKey ?? ''}
                          onChange={(e) => setEditForm((f) => (f ? { ...f, roleKey: e.target.value } : f))}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge tone={ROLE_TONE[u.role?.key ?? ''] ?? 'slate'}>
                          {u.role?.name ?? u.role?.key ?? '—'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {editing ? (
                        <select
                          value={editForm?.teamId ?? ''}
                          onChange={(e) => setEditForm((f) => (f ? { ...f, teamId: e.target.value } : f))}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        >
                          <option value="">— none —</option>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        u.team?.name ?? '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <select
                          value={editForm?.callDevice ?? 'MOBILE'}
                          onChange={(e) => setEditForm((f) => (f ? { ...f, callDevice: e.target.value as 'MOBILE' | 'WEB_DIALER' } : f))}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        >
                          <option value="MOBILE">Mobile</option>
                          <option value="WEB_DIALER">Web dialer</option>
                        </select>
                      ) : (
                        <Badge tone={u.callDevice === 'WEB_DIALER' ? 'violet' : 'slate'}>
                          {u.callDevice === 'WEB_DIALER' ? 'Web dialer' : 'Mobile'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <select
                          value={editForm?.telephonyAccountId ?? ''}
                          onChange={(e) => setEditForm((f) => (f ? { ...f, telephonyAccountId: e.target.value } : f))}
                          className="w-full min-w-[160px] rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        >
                          <option value="">— not assigned —</option>
                          {(tataAccounts.data ?? []).map((a) => (
                            <option key={a.id} value={a.number || a.id}>
                              {a.name} · {a.number} [{a.type}]
                            </option>
                          ))}
                          {editForm?.telephonyAccountId &&
                            !(tataAccounts.data ?? []).some((a) => (a.number || a.id) === editForm.telephonyAccountId) && (
                              <option value={editForm.telephonyAccountId}>
                                {editForm.telephonyAccountId} (currently assigned)
                              </option>
                            )}
                        </select>
                      ) : u.telephonyAccountId ? (
                        <span className="font-mono text-xs text-slate-700" title={u.telephonyAccountId}>
                          {u.telephonyAccountId}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">— not assigned —</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing && !isSuper ? (
                        <label className="flex items-center gap-2 text-slate-700">
                          <input
                            type="checkbox"
                            checked={editForm?.isActive ?? true}
                            onChange={(e) =>
                              setEditForm((f) => (f ? { ...f, isActive: e.target.checked } : f))
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Active
                        </label>
                      ) : (
                        <Badge tone={u.isActive === false ? 'red' : 'green'}>
                          {u.isActive === false ? 'Inactive' : 'Active'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editing ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          {!isSuper && (
                            <>
                              <button
                                onClick={() => startEdit(u)}
                                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(u)}
                                className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
