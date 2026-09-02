'use client';

import { useState } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { api } from '@/lib/client';
import { useAuth } from '@/lib/auth';
import { useCall } from '@/components/call-context';
import type { Call } from '@/lib/types';

/**
 * One-click click-to-call for any row that has a lead id. Starts the same
 * web call as the lead detail page and opens the global call modal.
 */
export function CallButton({
  leadId,
  title = 'Start web call',
}: {
  leadId: string;
  title?: string;
}) {
  const { user } = useAuth();
  const callCtx = useCall();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user?.permissions?.includes('call.create')) return null;

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api<Call>('/calls/initiate', {
        method: 'POST',
        body: JSON.stringify({ leadId }),
      });
      callCtx?.setActiveCall({ ...c, status: 'INITIATED' } as Call);
      callCtx?.setMinimized(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start call');
    } finally {
      setBusy(false);
      setTimeout(() => setError(null), 4000);
    }
  }

  return (
    <span className="inline-flex items-center">
      <button
        onClick={start}
        disabled={busy || !!callCtx?.activeCall}
        title={callCtx?.activeCall ? 'Another call is in progress' : title}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <PhoneOff className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
      </button>
      {error && (
        <span className="ml-1 max-w-[160px] truncate text-xs text-red-600" title={error}>
          {error}
        </span>
      )}
    </span>
  );
}
