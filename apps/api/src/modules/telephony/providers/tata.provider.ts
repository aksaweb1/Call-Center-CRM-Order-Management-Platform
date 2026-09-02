import { Injectable, Logger } from '@nestjs/common';
import { config } from '../../../config';
import {
  InitiateCallInput,
  CallResult,
  TelephonyAccount,
  TelephonyProvider,
  WebhookCallContext,
  TelephonyProviders,
} from '../interfaces/telephony-provider.interface';

/**
 * TATA Smartflo (cloudphone.tatateleservices.com) provider.
 * Docs: https://docs.smartflo.tatatelebusiness.com
 * - Auth:   POST /v1/auth/login  ({email,password}) -> {access_token, expires_in}
 * - Dial:   POST /v1/click_to_call ({agent_number, destination_number, caller_id, async})
 * - Events: webhook notifications with $call_id, $call_status, $ref_id, ... fields
 */
@Injectable()
export class TataProvider implements TelephonyProvider {
  readonly name: TelephonyProviders = 'TATA';
  private readonly logger = new Logger(TataProvider.name);

  private get baseUrl(): string {
    return process.env.TATA_API_URL ?? 'https://api-smartflo.tatateleservices.com';
  }
  private get email(): string {
    return process.env.TATA_EMAIL ?? '';
  }
  private get password(): string {
    return process.env.TATA_PASSWORD ?? '';
  }
  private get directToken(): string {
    return process.env.TATA_TOKEN ?? '';
  }
  private get agentNumber(): string {
    return process.env.TATA_AGENT_NUMBER ?? '';
  }
  private get callerId(): string {
    return process.env.TATA_CALLER_ID ?? '';
  }

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  private resolveUrl(path: string): string {
    // path like "/click_to_call" or "/call_detail_records?..."
    // If baseUrl already ends with /v1 (cloudphone .../connect/api/v1) don't add extra /v1
    const base = this.baseUrl.replace(/\/$/, '');
    if (base.endsWith('/v1')) return `${base}${path}`;
    return `${base}/v1${path}`;
  }

  /** Returns a fresh bearer token. Prefers TATA_TOKEN env if set, else email/password login. */
  private async token(): Promise<string> {
    // Direct JWT from Tata Connect API (e.g. eyJhbGciOi...). Use as-is.
    if (this.directToken) {
      // Light expiry check — warn but still return so the API can give a clear error.
      try {
        const payload = JSON.parse(Buffer.from(this.directToken.split('.')[1], 'base64').toString('utf8'));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          this.logger.warn(`TATA_TOKEN expired at ${new Date(payload.exp * 1000).toISOString()} (sub=${payload.sub ?? 'unknown'}) — rotate via https://cloudphone.tatateleservices.com/connect/api/v1/api-token`);
        }
      } catch {}
      return this.directToken;
    }
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }
    if (!this.email || !this.password) {
      this.logger.warn('TATA credentials missing and TATA_TOKEN not set — using offline simulated token');
      return 'simulated';
    }

    const res = await fetch(this.resolveUrl('/auth/login'), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!res.ok) {
      throw new Error(`TATA auth failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: number; success?: boolean };
    if (!body.access_token) {
      throw new Error('TATA auth response missing access_token');
    }
    this.accessToken = body.access_token;
    // expires_in is seconds; leave a 60s safety margin.
    this.tokenExpiresAt = Date.now() + ((body.expires_in ?? 3600) - 60) * 1000;
    return this.accessToken;
  }

  async initiateCall(input: InitiateCallInput): Promise<CallResult> {
    const jwt = await this.token();
    if (jwt === 'simulated') {
      this.logger.warn('TATA credentials missing — simulating call initiation');
      return { provider: this.name, providerCallId: `tata-sim-${Date.now()}`, status: 'initiated' };
    }
    const customIdentifier = `crm-${Date.now()}`;
    const body: Record<string, unknown> = {
      agent_number: input.agentPhone ?? this.agentNumber,
      destination_number: input.to,
      caller_id: input.from ?? this.callerId,
      async: 1,
      call_timeout: 45,
      custom_identifier: customIdentifier,
    };

    const res = await fetch(this.resolveUrl('/click_to_call'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`TATA click-to-call failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { ref_id?: string; call_id?: string };
    // Smartflo returns ref_id for click_to_call; keep customIdentifier as fallback for webhook correlation
    const refId = json.ref_id ?? json.call_id ?? customIdentifier;
    return {
      provider: this.name,
      providerCallId: refId,
      status: 'initiated',
    };
  }

  async getCall(providerCallId: string) {
    const jwtProbe = await this.token();
    if (jwtProbe === 'simulated') return { status: 'unknown' };
    try {
      const jwt = jwtProbe;
      const url = `${this.baseUrl}/v1/call/records?call_id=${encodeURIComponent(providerCallId)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' } });
      if (!res.ok) return { status: 'unknown' };
      const body = (await res.json()) as { results?: Array<{ status?: string; call_duration?: number; answered_seconds?: number }> };
      const rec = body.results?.[0];
      if (!rec) return { status: 'unknown' };
      return {
        status: rec.status ?? 'unknown',
        durationSecs: rec.answered_seconds ?? rec.call_duration,
      };
    } catch {
      return { status: 'unknown' };
    }
  }

  parseWebhook(payload: Record<string, unknown>): WebhookCallContext {
    const p = payload as Record<string, any>;
    // Smartflo sends $prefixed keys; keep harmless aliases for robustness.
    const callStatus = (p.$call_status ?? p.call_status ?? p.status ?? '').toString().toLowerCase();
    let eventType: WebhookCallContext['eventType'] = 'completed';
    if (callStatus === 'answered') eventType = 'connected';
    else if (callStatus === 'missed') eventType = 'missed';
    else if (callStatus === 'busy') eventType = 'busy';
    else if (callStatus === 'failed') eventType = 'failed';
    else if (callStatus === 'ringing') eventType = 'ringing';
    else if (callStatus === 'completed' || callStatus === 'hangup') eventType = 'completed';

    return {
      provider: this.name,
      eventType,
      providerCallId: (p.$call_id ?? p.$uuid ?? p.$ref_id ?? p.call_id ?? p.uuid ?? p.ref_id ?? '').toString(),
      from: (p.$caller_id_number ?? p.caller_id_number ?? '').toString(),
      to: (p.$customer_number_with_prefix ?? p.$customer_number ?? p.customer_number ?? '').toString(),
      durationSecs: this.int(p, ['$billsec', '$duration', '$outbound_sec', 'billsec', 'duration']),
      recordingUrl: (p.$recording_url ?? p.recording_url)?.toString(),
      rawPayload: payload,
    };
  }

  async hangup(refId: string): Promise<{ success: boolean; message: string }> {
    const jwt = await this.token();
    if (jwt === 'simulated') return { success: false, message: 'Simulated — no real call to hangup' };
    const res = await fetch(this.resolveUrl('/call/hangup'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref_id: refId }),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
    if (!res.ok) throw new Error(body.message ?? `Hangup failed: ${res.status}`);
    return { success: !!body.success, message: body.message ?? 'Hangup successful' };
  }

  async callOperation(params: { type: number; refId?: string; callId?: string; agentId?: string; intercom?: string }): Promise<{ success: boolean; message: string }> {
    const jwt = await this.token();
    if (jwt === 'simulated') return { success: false, message: 'Simulated' };
    const body: Record<string, unknown> = { type: params.type };
    if (params.refId) body.ref_id = params.refId;
    if (params.callId) body.call_id = params.callId;
    if (params.agentId) body.agent_id = params.agentId;
    if (params.intercom) body.intercom = params.intercom;
    const res = await fetch(this.resolveUrl('/call/options'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
    if (!res.ok) throw new Error(data.message ?? `Call operation failed: ${res.status}`);
    return { success: !!data.success, message: data.message ?? 'OK' };
  }

  async liveCalls(): Promise<unknown[]> {
    const jwt = await this.token();
    if (jwt === 'simulated') return [];
    const res = await fetch(this.resolveUrl('/live_calls'), { headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' } });
    if (!res.ok) return [];
    const body = (await res.json()) as unknown;
    if (Array.isArray(body)) return body;
    const obj = body as { data?: unknown[] };
    return obj.data ?? [];
  }

  /** Lists all Smartflow agents / DIDs that can be bound to CRM users. */
  async listAccounts(): Promise<TelephonyAccount[]> {
    const jwt = await this.token();

    // No real credentials → return what the env is currently routing through.
    if (jwt === 'simulated') {
      const fallback: TelephonyAccount[] = [];
      if (this.agentNumber) {
        fallback.push({
          id: this.agentNumber,
          name: `Agent ${this.agentNumber}`,
          number: this.agentNumber,
          type: 'MOBILE',
          status: 'active',
          raw: { source: 'env:TATA_AGENT_NUMBER' },
        });
      }
      if (this.callerId && this.callerId !== this.agentNumber) {
        fallback.push({
          id: this.callerId,
          name: `Caller ID ${this.callerId}`,
          number: this.callerId,
          type: 'DID',
          status: 'active',
          raw: { source: 'env:TATA_CALLER_ID' },
        });
      }
      return fallback;
    }

    const endpoints = [
      '/agents',
      '/agent/list',
      '/users',
      '/extensions',
      '/did/list',
      '/caller_ids',
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(this.resolveUrl(ep), {
          headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
        });
        if (!res.ok) continue;
        const body = (await res.json()) as unknown;
        const arr = this.extractAccountArray(body);
        if (arr && arr.length > 0) {
          return arr.map((r) => this.normalizeTataAccount(r));
        }
      } catch {
        // try next endpoint
      }
    }

    // Nothing listed via API — expose env fallback so assignment still works.
    this.logger.warn('TATA listAccounts: no endpoint returned data — falling back to env numbers');
    const fallback: TelephonyAccount[] = [];
    if (this.agentNumber) {
      fallback.push({
        id: this.agentNumber,
        name: `Agent ${this.agentNumber} (env)`,
        number: this.agentNumber,
        type: 'MOBILE',
        status: 'active',
        raw: { source: 'env' },
      });
    }
    if (this.callerId && this.callerId !== this.agentNumber) {
      fallback.push({
        id: this.callerId,
        name: `Caller ID ${this.callerId} (env)`,
        number: this.callerId,
        type: 'DID',
        status: 'active',
        raw: { source: 'env' },
      });
    }
    return fallback;
  }

  private extractAccountArray(body: unknown): Record<string, unknown>[] | null {
    if (Array.isArray(body)) return body as Record<string, unknown>[];
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      for (const key of ['data', 'agents', 'results', 'users', 'extensions', 'caller_ids', 'dids']) {
        const v = obj[key];
        if (Array.isArray(v)) return v as Record<string, unknown>[];
        // nested like { data: { agents: [...] } }
        if (v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).agents)) {
          return (v as Record<string, unknown>).agents as Record<string, unknown>[];
        }
      }
    }
    return null;
  }

  private normalizeTataAccount(raw: Record<string, unknown>): TelephonyAccount {
    const id = String(
      raw.agent_id ?? raw.id ?? raw.extension ?? raw.agent_number ?? raw.number ?? raw.did ?? Math.random().toString(36).slice(2, 8),
    );
    const name = String(raw.agent_name ?? raw.name ?? raw.display_name ?? raw.username ?? id);
    const number = String(raw.agent_number ?? raw.number ?? raw.phone ?? raw.did ?? raw.extension ?? id);
    // Short numeric extensions are typically web dialer/SIP, long numbers are mobile/DID
    const isExtension = /^\d{3,5}$/.test(number);
    const type: TelephonyAccount['type'] = isExtension ? 'WEB_DIALER' : 'MOBILE';
    const status = (raw.status ?? raw.state ?? 'active').toString();
    return { id, name, number, type, status, raw };
  }

  buildWebhookUrl(baseUrl: string): string {
    return `${baseUrl}${config.apiPrefix}/calls/webhook/tata`;
  }

  private int(p: Record<string, any>, keys: string[]): number | undefined {
    for (const k of keys) {
      const v = p[k];
      if (v !== undefined && v !== null && v !== '') {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n)) return n;
      }
    }
    return undefined;
  }
}