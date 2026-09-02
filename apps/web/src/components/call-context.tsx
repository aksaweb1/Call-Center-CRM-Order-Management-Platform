'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Call } from '@/lib/types';
import { api } from '@/lib/client';

type CallContextType = {
  activeCall: Call | null;
  setActiveCall: (c: Call | null) => void;
  minimized: boolean;
  setMinimized: (v: boolean) => void;
  callElapsed: number;
};

/** Dispositions offered right after a call ends. */
const WRAPUP_DISPOSITIONS = [
  { outcome: 'INTERESTED', leadStatus: 'INTERESTED', tone: 'bg-emerald-50 border-emerald-300 text-emerald-800' },
  { outcome: 'CALL_BACK_REQUESTED', leadStatus: 'CALL_BACK_REQUESTED', tone: 'bg-blue-50 border-blue-300 text-blue-800' },
  { outcome: 'NOT_INTERESTED', leadStatus: 'NOT_INTERESTED', tone: 'bg-red-50 border-red-300 text-red-800' },
  { outcome: 'NO_ANSWER', leadStatus: 'NO_ANSWER', tone: 'bg-amber-50 border-amber-300 text-amber-800' },
  { outcome: 'BUSY', leadStatus: 'BUSY', tone: 'bg-slate-50 border-slate-300 text-slate-700' },
  { outcome: 'WRONG_NUMBER', leadStatus: 'WRONG_NUMBER', tone: 'bg-violet-50 border-violet-300 text-violet-800' },
] as const;

const CallContext = createContext<CallContextType | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [callElapsed, setCallElapsed] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const setActiveCallTracked = (c: Call | null) => {
    if (c == null && activeCall) {
      setDismissed((prev) => new Set(prev).add(activeCall.id));
    } else if (c) {
      setDismissed((prev) => {
        if (prev.has(c.id)) {
          const n = new Set(prev);
          n.delete(c.id);
          return n;
        }
        return prev;
      });
    }
    setActiveCall(c);
  };

  useEffect(() => {
    if (!activeCall) return;
    if (dismissed.has(activeCall.id)) {
      setActiveCall(null);
      return;
    }
    const id = activeCall.id;
    const isEarly = activeCall.status === 'INITIATED' || activeCall.status === 'RINGING';
    const interval = isEarly ? 1000 : 3000;
    const iv = setInterval(() => {
      void api<Call>(`/calls/${id}`)
        .then((c) => {
          if (dismissed.has(c.id) && (c.status === 'COMPLETED' || c.status === 'FAILED' || c.status === 'MISSED' || c.status === 'BUSY')) return;
          setActiveCall(c);
        })
        .catch(() => {});
    }, interval);
    return () => clearInterval(iv);
  }, [activeCall?.id, activeCall?.status]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'CONNECTED') {
      setCallElapsed(0);
      return;
    }
    const base = activeCall.durationSecs ?? 0;
    const t0 = Date.now();
    const iv = setInterval(() => setCallElapsed(base + Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [activeCall?.id, activeCall?.status, activeCall?.durationSecs]);

  return (
    <CallContext.Provider value={{ activeCall, setActiveCall: setActiveCallTracked, minimized, setMinimized, callElapsed }}>
      {children}
      {activeCall && !minimized && <GlobalCallModal />}
    </CallContext.Provider>
  );
}

function GlobalCallModal() {
  const { activeCall, setActiveCall, setMinimized, callElapsed } = useCall();
  // Which call id is awaiting its post-call wrap-up (set right after hangup).
  const [wrapUpFor, setWrapUpFor] = useState<string | null>(null);
  useEffect(() => {
    setWrapUpFor(null);
  }, [activeCall?.id]);
  if (!activeCall) return null;
  const c = activeCall;
  const isLive = c.status === 'INITIATED' || c.status === 'RINGING' || c.status === 'CONNECTED';
  const canWrapUp = !!(c.leadId || c.customerId);
  const showWrapUp = !isLive && wrapUpFor === c.id && canWrapUp;
  const handleHangup = async () => {
    const liveTalk = callElapsed > 0 ? callElapsed : (c.durationSecs ?? 0);
    try {
      await api(`/calls/${c.id}/hangup`, { method: 'POST' });
      // Keep the live talk time in the popup so Talk time doesn't flip to —
      const updated = await api<Call>(`/calls/${c.id}`);
      const withTalk = updated.durationSecs == null && liveTalk > 0 ? ({ ...updated, durationSecs: liveTalk } as Call) : updated;
      if (liveTalk > 0 && updated.durationSecs == null) {
        void api(`/calls/${c.id}`, { method: 'PATCH', body: JSON.stringify({ durationSecs: liveTalk } as unknown as Record<string, unknown>) }).catch(() => {});
      }
      setActiveCall(withTalk as Call);
      if (canWrapUp) setWrapUpFor(c.id); // go straight into disposition capture
    } catch {}
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${showWrapUp ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
              {showWrapUp ? (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" /></svg>
              )}
            </span>
            {showWrapUp ? 'How did the call go?' : `Web Call — ${c.status}`}
          </h3>
          {!showWrapUp && (
            <button onClick={() => setMinimized(true)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" title="Minimize">—</button>
          )}
        </div>
        {showWrapUp ? (
          <CallWrapUp
            call={c}
            onDone={() => setActiveCall(null)}
            onSkip={() => setActiveCall(null)}
          />
        ) : (
          <>
            <p className="text-sm text-slate-600">Calling <span className="font-semibold text-slate-900">{c.dialedNumber ?? 'customer'}</span> via {c.provider === 'TATA' ? 'Tata Smartflo' : c.provider}.</p>
            <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Status</span><span className={`font-medium capitalize ${c.status === 'CONNECTED' ? 'text-emerald-600' : c.status === 'RINGING' ? 'text-amber-600' : ''}`}>{c.status === 'INITIATED' ? 'calling agent…' : c.status.toLowerCase()}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Talk time</span><span className="font-medium">{c.status === 'CONNECTED' ? `${Math.floor(callElapsed / 60)}:${String(callElapsed % 60).padStart(2, '0')} (live talk)` : c.durationSecs != null ? `${c.durationSecs}s` : '—'}</span></div>
              {c.status === 'CONNECTED' && <p className="mt-2 text-center text-xs font-medium text-emerald-600">● Call connected — talking now</p>}
            </div>
            <div className="mt-4 flex gap-2">
              {isLive && <button onClick={handleHangup} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">Hangup</button>}
              {!isLive && !canWrapUp && <button onClick={() => setActiveCall(null)} className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Close</button>}
              {!isLive && canWrapUp && wrapUpFor !== c.id && (
                <button onClick={() => setWrapUpFor(c.id)} className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
                  Log outcome
                </button>
              )}
              <button onClick={() => setMinimized(true)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Minimize</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Post-call wrap-up: disposition + note + optional follow-up in one step.
 * Saving updates the call outcome, the lead status, and (optionally)
 * schedules a follow-up — no navigation needed.
 */
function CallWrapUp({
  call,
  onDone,
  onSkip,
}: {
  call: Call;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [disposition, setDisposition] = useState<string | null>(call.outcome ?? null);
  const [notes, setNotes] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!disposition) {
      setError('Pick an outcome first');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/calls/${call.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ outcome: disposition, notes: notes.trim() || undefined }),
      });
      const map = WRAPUP_DISPOSITIONS.find((d) => d.outcome === disposition);
      if (call.leadId && map) {
        await api(`/leads/${call.leadId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: map.leadStatus }),
        }).catch(() => {});
      }
      if (scheduleAt && call.customerId) {
        await api('/followups', {
          method: 'POST',
          body: JSON.stringify({
            customerId: call.customerId,
            ...(call.leadId ? { leadId: call.leadId } : {}),
            scheduledFor: new Date(scheduleAt).toISOString(),
            title: `Follow-up: ${disposition.replaceAll('_', ' ').toLowerCase()}`,
          }),
        }).catch(() => {});
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the outcome');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">
        Call to <span className="font-semibold text-slate-900">{call.dialedNumber}</span> ended
        {call.durationSecs ? ` · ${call.durationSecs}s` : ''}. Log the outcome so nothing gets lost.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {WRAPUP_DISPOSITIONS.map((d) => (
          <button
            key={d.outcome}
            type="button"
            disabled={busy}
            onClick={() => setDisposition(d.outcome)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors ${
              disposition === d.outcome
                ? `${d.tone} ring-2 ring-blue-400`
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {d.outcome.replaceAll('_', ' ').toLowerCase()}
          </button>
        ))}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes from the call (optional)…"
        rows={2}
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <label className="mt-2 block text-xs font-medium text-slate-600">
        Schedule a follow-up (optional)
      </label>
      <input
        type="datetime-local"
        value={scheduleAt}
        onChange={(e) => setScheduleAt(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {disposition === 'CALL_BACK_REQUESTED' && !scheduleAt && (
        <p className="mt-1 text-xs text-amber-600">A callback follow-up will be auto-created for this lead.</p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={save}
          disabled={busy || !disposition}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save & close'}
        </button>
        <button
          onClick={onSkip}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
