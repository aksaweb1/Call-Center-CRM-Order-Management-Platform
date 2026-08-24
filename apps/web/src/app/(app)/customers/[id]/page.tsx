'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useApi } from '@/lib/hook';
import { useAuth } from '@/lib/auth';
import {
  Call,
  CustomerDetail,
  Lead,
  Note,
  Order,
  PageResult,
} from '@/lib/types';
import {
  Badge,
  EmptyState,
  Spinner,
  formatCurrency,
  formatDate,
} from '@/components/ui';
import OrderForm from '@/components/order-form';
import { api } from '@/lib/client';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canCreateOrder = user?.permissions?.includes('order.create') ?? false;

  const customer = useApi<CustomerDetail>(id ? `/customers/${id}` : null);
  const orders = useApi<PageResult<Order>>(id ? `/orders?customerId=${id}&limit=5` : null);
  const leads = useApi<PageResult<Lead>>(id ? `/leads?customerId=${id}&limit=5` : null);
  const calls = useApi<PageResult<Call>>(id ? `/calls?customerId=${id}&limit=5` : null);
  const notes = useApi<PageResult<Note>>(id ? `/notes?customerId=${id}&limit=5` : null);

  const c = customer.data;

  const canUpdateCustomer = user?.permissions?.includes('customer.update') ?? false;
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editMsg, setEditMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    alternatePhone: '',
    email: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
    dob: '',
    customerType: 'INDIVIDUAL',
    tags: '',
  });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  function openEdit() {
    if (!c) return;
    setForm({
      name: c.name ?? '',
      phone: c.phone ?? '',
      alternatePhone: c.alternatePhone ?? '',
      email: c.email ?? '',
      city: c.city ?? '',
      state: c.state ?? '',
      country: c.country ?? '',
      pincode: c.pincode ?? '',
      dob: c.dob ? c.dob.slice(0, 10) : '',
      customerType: c.customerType ?? 'INDIVIDUAL',
      tags: (c.tags ?? []).join(', '),
    });
    setEditMsg(null);
    setEditing(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!c) return;
    setSavingEdit(true);
    setEditMsg(null);
    try {
      const updated = await api<CustomerDetail>(`/customers/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim() || undefined,
          phone: form.phone.replace(/\s+/g, '').trim() || undefined,
          alternatePhone: form.alternatePhone.trim() || undefined,
          email: form.email.trim() || undefined,
          city: form.city.trim() || undefined,
          state: form.state.trim() || undefined,
          country: form.country.trim() || undefined,
          pincode: form.pincode.trim() || undefined,
          dob: form.dob || undefined,
          customerType: form.customerType,
          tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      customer.setData(updated);
      setEditing(false);
      setEditMsg({ tone: 'ok', text: 'Profile updated.' });
      setMsg(null);
    } catch (err) {
      setEditMsg({ tone: 'err', text: err instanceof Error ? err.message : 'Could not update profile' });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handlePincodeChange(value: string) {
    const pin = value.replace(/\D/g, '').slice(0, 6);
    setForm((f) => ({ ...f, pincode: pin }));
    if (pin.length !== 6) return;
    setPinLoading(true);
    setEditMsg(null);
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
      const json = (await res.json()) as Array<{
        Status: string;
        PostOffice?: Array<{ District: string; State: string }>;
      }>;
      const office = json?.[0]?.PostOffice?.[0];
      if (office) {
        setForm((f) => ({
          ...f,
          city: office.District && office.District !== '' ? office.District : f.city,
          state: office.State && office.State !== '' ? office.State : f.state,
        }));
      }
    } catch {
      // ignore — user can still type city/state manually
    } finally {
      setPinLoading(false);
    }
  }

  if (customer.loading) return <Spinner label="Loading customer…" />;
  if (customer.error)
    return <EmptyState title="Could not load customer" description={customer.error} />;
  if (!c) return null;

  const count = c._count;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/customers" className="text-sm text-blue-600 hover:underline">
            ← Back to customers
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{c.name}</h1>
            <Badge tone={c.customerType === 'COMPANY' ? 'violet' : 'blue'}>{c.customerType}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Since {formatDate(c.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {c.tags?.map((t) => (
            <Badge key={t} tone="slate">{t}</Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canUpdateCustomer && (
            <button
              onClick={openEdit}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit profile
            </button>
          )}
          {canCreateOrder && (
            <button
              onClick={() => setShowOrderForm((v) => !v)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              {showOrderForm ? 'Hide order form' : '+ Create order'}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Edit profile</h2>
            {!savingEdit && (
              <button onClick={() => setEditing(false)} className="text-sm text-slate-500 hover:text-slate-700">
                ✕ Close
              </button>
            )}
          </div>
          {editMsg && (
            <p className={`mb-3 text-sm ${editMsg.tone === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{editMsg.text}</p>
          )}
          <form onSubmit={handleSaveEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className={input} />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} required inputMode="tel" className={input} />
            </Field>
            <Field label="Alternate phone">
              <input value={form.alternatePhone} onChange={(e) => setForm((f) => ({ ...f, alternatePhone: e.target.value }))} inputMode="tel" className={input} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={input} />
            </Field>
            <Field label="Pincode">
              <div className="relative">
                <input
                  value={form.pincode}
                  onChange={(e) => handlePincodeChange(e.target.value)}
                  placeholder="6-digit pincode"
                  inputMode="numeric"
                  className={`${input} ${pinLoading ? 'pr-8' : ''}`}
                />
                {pinLoading && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">…</span>
                )}
              </div>
            </Field>
            <Field label="City">
              <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className={input} />
            </Field>
            <Field label="State">
              <input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} className={input} />
            </Field>
            <Field label="Country">
              <input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} className={input} />
            </Field>
            <Field label="Date of birth">
              <input type="date" value={form.dob} onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))} className={input} />
            </Field>
            <Field label="Customer type">
              <select value={form.customerType} onChange={(e) => setForm((f) => ({ ...f, customerType: e.target.value }))} className={input}>
                <option value="INDIVIDUAL">Individual</option>
                <option value="COMPANY">Company</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Tags (comma separated)">
                <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} className={input} />
              </Field>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
              {!savingEdit && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {showOrderForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Create order</h2>
          {msg && (
            <p className={`mb-3 text-sm ${msg.tone === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>
          )}
          <OrderForm
            customerId={c.id}
            onSaved={() => {
              setMsg({ tone: 'ok', text: 'Order created.' });
              orders.reload();
            }}
            onError={(text) => setMsg({ tone: 'err', text })}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Profile</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Phone</dt><dd className="font-medium text-slate-900">{c.phone}</dd></div>
            <div><dt className="text-slate-500">Alternate phone</dt><dd className="font-medium text-slate-900">{c.alternatePhone ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Email</dt><dd className="font-medium text-slate-900">{c.email ?? '—'}</dd></div>
            <div><dt className="text-slate-500">City / State</dt><dd className="font-medium text-slate-900">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</dd></div>
            <div><dt className="text-slate-500">Pincode</dt><dd className="font-medium text-slate-900">{c.pincode ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Date of birth</dt><dd className="font-medium text-slate-900">{c.dob ? `${formatDate(c.dob)}${ageOf(c.dob) != null ? ` (${ageOf(c.dob)} y)` : ''}` : '—'}</dd></div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Activity</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Leads</dt><dd className="font-semibold text-slate-900">{count.leads}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Orders</dt><dd className="font-semibold text-slate-900">{count.orders}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Calls</dt><dd className="font-semibold text-slate-900">{count.calls}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Follow-ups</dt><dd className="font-semibold text-slate-900">{count.followUps}</dd></div>
          </dl>
          {c.addresses && c.addresses.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Addresses</p>
              {c.addresses.map((a) => (
                <p key={a.id} className="text-sm text-slate-600">
                  {[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}
                  {a.isDefault && <span className="ml-1 text-blue-600">(default)</span>}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Recent orders" link={`/orders?customerId=${c.id}`}>
          {orders.loading ? <Spinner /> : orders.error ? (
            <EmptyState title="Could not load orders" description={orders.error} />
          ) : (orders.data?.items ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No orders.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Placed</th>
                  <th className="px-4 py-2">Total</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(orders.data?.items ?? []).map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2 font-medium text-blue-600">{o.orderNumber}</td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(o.placedAt)}</td>
                    <td className="px-4 py-2 text-slate-900">{formatCurrency(o.total)}</td>
                    <td className="px-4 py-2"><Badge tone={STATUS_TONE(o.status)}>{o.status}</Badge></td>
                    <td className="px-4 py-2"><Badge tone={STATUS_TONE(o.paymentStatus)}>{o.paymentStatus}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Leads" link={`/leads?customerId=${c.id}`}>
          {leads.loading ? <Spinner /> : leads.error ? (
            <EmptyState title="Could not load leads" description={leads.error} />
          ) : (leads.data?.items ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No leads.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Priority</th>
                  <th className="px-4 py-2">Agent</th>
                  <th className="px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(leads.data?.items ?? []).map((l) => {
                  const history = (l as unknown as { metadata?: { agentHistory?: Array<{ agent: string; dateIso: string | null; remark: string }> } }).metadata?.agentHistory;
                  const hasHistory = Array.isArray(history) && history.length > 1;
                  return (
                    <>
                      <tr key={l.id}>
                        <td className="px-4 py-2">
                          <Link href={`/leads/${l.id}`} className="font-medium text-slate-900 hover:text-blue-600 hover:underline">
                            {l.title ?? l.customer?.name ?? '—'}
                          </Link>
                        </td>
                        <td className="px-4 py-2"><Badge tone={STATUS_TONE(l.status)}>{l.status}</Badge></td>
                        <td className="px-4 py-2"><Badge tone={l.priority === 'URGENT' || l.priority === 'HIGH' ? 'red' : 'slate'}>{l.priority}</Badge></td>
                        <td className="px-4 py-2 text-slate-600">{l.agent?.fullName ?? '—'}</td>
                        <td className="px-4 py-2 text-slate-500">{formatDate(l.createdAt)}</td>
                      </tr>
                      {hasHistory && (
                        <tr key={`${l.id}-history`}>
                          <td colSpan={5} className="bg-amber-50/60 px-4 py-2 text-xs text-slate-600">
                            <span className="font-medium text-amber-700">Flow: </span>
                            {history!.map((h, i) => (
                              <span key={i}>
                                {i > 0 && <span className="mx-1 text-slate-400">→</span>}
                                <span className="font-medium text-slate-700">{h.agent}</span>
                                {h.remark && <span className="text-slate-500"> ({h.remark})</span>}
                              </span>
                            ))}
                            <span className="ml-2 text-slate-400">· {history!.length} assignments, latest wins</span>
                            <Link href={`/leads/${l.id}`} className="ml-2 text-blue-600 hover:underline">View history</Link>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Calls" link={`/calls?customerId=${c.id}`}>
          {calls.loading ? <Spinner /> : calls.error ? (
            <EmptyState title="Could not load calls" description={calls.error} />
          ) : (calls.data?.items ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No calls.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Direction</th>
                  <th className="px-4 py-2">Agent</th>
                  <th className="px-4 py-2">Duration</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(calls.data?.items ?? []).map((cl) => (
                  <tr key={cl.id}>
                    <td className="px-4 py-2 text-slate-600">{formatDate(cl.startedAt)}</td>
                    <td className="px-4 py-2"><Badge tone={cl.direction === 'INBOUND' ? 'blue' : 'violet'}>{cl.direction}</Badge></td>
                    <td className="px-4 py-2 text-slate-600">{cl.agent?.fullName ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-600">{cl.durationSecs != null ? `${cl.durationSecs}s` : '—'}</td>
                    <td className="px-4 py-2"><Badge tone={STATUS_TONE(cl.status)}>{cl.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Notes" link={`/notes?customerId=${c.id}`}>
          {notes.loading ? <Spinner /> : notes.error ? (
            <EmptyState title="Could not load notes" description={notes.error} />
          ) : (notes.data?.items ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No notes.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(notes.data?.items ?? []).map((n) => (
                <li key={n.id} className="py-3">
                  <p className="text-sm text-slate-700">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {n.user?.fullName ?? 'Unknown'} · {formatDate(n.createdAt)}
                    {n.pinned && <span className="ml-2 text-amber-600">Pinned</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, link, children }: { title: string; link: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        {link && <Link href={link} className="text-xs text-blue-600 hover:underline">View all</Link>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function ageOf(dob: string): number | null {
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

const STATUS_TONE = (s: string) =>
  ({ completed: 'green', paid: 'green', delivered: 'green', won: 'green', cancelled: 'red', failed: 'red', lost: 'red', rejected: 'red', pending: 'amber', new: 'amber', processing: 'amber' })[s.toLowerCase()] ?? 'slate';