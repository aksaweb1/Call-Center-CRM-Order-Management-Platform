import { Injectable, Logger } from '@nestjs/common';
import { config } from '../../../config';
import {
  InitiateCallInput,
  CallResult,
  TelephonyProvider,
  WebhookCallContext,
  TelephonyProviders,
} from '../interfaces/telephony-provider.interface';

@Injectable()
export class KnowlarityProvider implements TelephonyProvider {
  readonly name: TelephonyProviders = 'KNOWLARITY';
  private readonly logger = new Logger(KnowlarityProvider.name);

  private get accountId(): string {
    return process.env.KNOWLARITY_ACCOUNT_ID ?? '';
  }
  private get apiKey(): string {
    return process.env.KNOWLARITY_API_KEY ?? '';
  }

  async initiateCall(input: InitiateCallInput): Promise<CallResult> {
    if (!this.accountId || !this.apiKey) {
      this.logger.warn('Knowlarity credentials missing — simulating call');
      return { provider: this.name, providerCallId: `know-sim-${Date.now()}`, status: 'initiated' };
    }
    // Knowlarity ATOM API (representative endpoint)
    const url = `https://api.knowlarity.com/basic/v1/account/${this.accountId}/agent/connect`;
    const form = new URLSearchParams({
      customer_number: input.to,
      agent_number: input.agentPhone ?? input.from ?? '',
      call_type: 'click_to_call',
      callback_url: input.callbackUrl ?? '',
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-ApiKey': this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) throw new Error(`Knowlarity call failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { call_id?: string };
    return { provider: this.name, providerCallId: body.call_id ?? `know-${Date.now()}`, status: 'initiated' };
  }

  async getCall(providerCallId: string) {
    if (!this.accountId || !this.apiKey) return { status: 'unknown' };
    const url = `https://api.knowlarity.com/basic/api/v1/account/${this.accountId}/call/${providerCallId}`;
    const res = await fetch(url, { headers: { 'Content-ApiKey': this.apiKey } });
    if (!res.ok) return { status: 'unknown' };
    const body = (await res.json()) as { call_status?: string; duration?: string };
    return { status: body.call_status ?? 'unknown', durationSecs: body.duration ? parseInt(body.duration, 10) : undefined };
  }

  parseWebhook(payload: Record<string, unknown>): WebhookCallContext {
    const p = payload as Record<string, any>;
    const status = (p.call_status ?? p.status ?? '').toString().toLowerCase();
    let eventType: WebhookCallContext['eventType'] = 'completed';
    if (status === 'ringing' || status === 'dialing') eventType = 'ringing';
    else if (status === 'connected' || status === 'in-progress' || status === 'ongoing') eventType = 'connected';
    else if (status === 'busy') eventType = 'busy';
    else if (status === 'failed') eventType = 'failed';
    else if (status === 'missed' || status === 'no-answer' || status === 'cancelled') eventType = 'missed';
    else if (status === 'completed' || status === 'complete') eventType = 'completed';

    return {
      provider: this.name,
      eventType,
      providerCallId: (p.call_id ?? p.callId ?? '').toString(),
      from: (p.from ?? '').toString(),
      to: (p.to ?? (p.customer_number ?? '')).toString(),
      durationSecs: p.duration ? parseInt(p.duration, 10) : undefined,
      recordingUrl: p.recording_url?.toString(),
      recordingDurationSecs: p.recording_duration ? parseInt(p.recording_duration, 10) : undefined,
      rawPayload: payload,
    };
  }

  buildWebhookUrl(baseUrl: string): string {
    return `${baseUrl}${config.apiPrefix}/calls/webhook/knowlarity`;
  }
}