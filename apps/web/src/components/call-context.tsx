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
  if (!activeCall) return null;
  const c = activeCall;
  const isLive = c.status === 'INITIATED' || c.status === 'RINGING' || c.status === 'CONNECTED';
  const handleHangup = async () => {
    const liveTalk = callElapsed > 0 ? callElapsed : (c.durationSecs ?? 0);
    try {
      await api(`/calls/${c.id}/hangup`, { method: 'POST' });
      // Keep the live 22s in the popup so Talk time doesn't flip to —
      const updated = await api<Call>(`/calls/${c.id}`);
      const withTalk = updated.durationSecs == null && liveTalk > 0 ? ({ ...updated, durationSecs: liveTalk } as Call) : updated;
      if (liveTalk > 0 && updated.durationSecs == null) {
        void api(`/calls/${c.id}`, { method: 'PATCH', body: JSON.stringify({ durationSecs: liveTalk } as unknown as Record<string, unknown>) }).catch(() => {});
      }
      setActiveCall(withTalk as Call);
    } catch {}
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" /></svg>
            </span>
            Web Call — {c.status}
          </h3>
          <button onClick={() => setMinimized(true)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" title="Minimize">—</button>
        </div>
        <p className="text-sm text-slate-600">Calling <span className="font-semibold text-slate-900">{(c as unknown as { dialedNumber?: string }).dialedNumber ?? 'customer'}</span> via Tata Smartflo.</p>
        <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Status</span><span className={`font-medium capitalize ${c.status === 'CONNECTED' ? 'text-emerald-600' : c.status === 'RINGING' ? 'text-amber-600' : ''}`}>{c.status === 'INITIATED' ? 'calling agent…' : c.status.toLowerCase()}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Talk time</span><span className="font-medium">{c.status === 'CONNECTED' ? `${Math.floor(callElapsed / 60)}:${String(callElapsed % 60).padStart(2, '0')} (live talk)` : c.durationSecs != null ? `${c.durationSecs}s` : '—'}</span></div>
          {c.status === 'CONNECTED' && <p className="mt-2 text-center text-xs font-medium text-emerald-600">● Call connected — talking now</p>}
          <p className="mt-3 text-xs text-slate-500">Real PSTN call: Smartflo first rings your phone <span className="font-mono">9133778923</span> (agent 0507809690002), then dials the customer and bridges.</p>
        </div>
        <div className="mt-4 flex gap-2">
          {isLive && <button onClick={handleHangup} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">Hangup</button>}
          {!isLive && <button onClick={() => setActiveCall(null)} className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Close</button>}
          <button onClick={() => setMinimized(true)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Minimize</button>
        </div>
      </div>
    </div>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
