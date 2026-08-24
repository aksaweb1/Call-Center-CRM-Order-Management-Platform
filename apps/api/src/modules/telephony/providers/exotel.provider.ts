import { Injectable, Logger } from '@nestjs/common';
import { config } from '../../../config';
import {
  InitiateCallInput,
  CallResult,
  TelephonyProvider,
  WebhookCallContext,
  TelephonyProviders,
} from '../interfaces/telephony-provider.interface';

/**
 * Exotel provider. Uses Exotel's REST API for click-to-call and webhooks.
 * Docs: https://developer.exotel.com/api/
 */
@Injectable()
export class ExotelProvider implements TelephonyProvider {
  readonly name: TelephonyProviders = 'EXOTEL';
  private readonly logger = new Logger(ExotelProvider.name);

  private get accountSid(): string {
    return process.env.EXOTEL_ACCOUNT_SID ?? '';
  }
  private get apiKey(): string {
    return process.env.EXOTEL_API_KEY ?? '';
  }
  private get apiToken(): string {
    return process.env.EXOTEL_API_TOKEN ?? '';
  }
  private get subdomain(): string {
    return process.env.EXOTEL_SUBDOMAIN ?? 'api.exotel.com';
  }

  async initiateCall(input: InitiateCallInput): Promise<CallResult> {
    const from = input.from ?? this.subdomain;
    const url = `https://${this.subdomain}/v1/Accounts/${this.accountSid}/Calls/connect`;

    // In tests/dev without credentials, simulate a successful initiation.
    if (!this.apiKey || !this.apiToken) {
      this.logger.warn('Exotel credentials missing — simulating call initiation');
      return {
        provider: this.name,
        providerCallId: `sim-${Date.now()}`,
        status: 'initiated',
      };
    }

    const form = new URLSearchParams({
      From: from,
      To: input.to,
      CallerId: input.from ?? from,
      Url: input.callbackUrl ?? '',
      CallType: 'trans',
    });

    const basic = Buffer.from(`${this.apiKey}:${this.apiToken}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) {
      throw new Error(`Exotel call initiation failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { Calls?: { Sid?: string } };
    return {
      provider: this.name,
      providerCallId: body.Calls?.Sid ?? `exotel-${Date.now()}`,
      status: 'initiated',
    };
  }

  async getCall(providerCallId: string) {
    if (!this.apiKey || !this.apiToken) {
      return { status: 'unknown' };
    }
    const url = `https://${this.subdomain}/v1/Accounts/${this.accountSid}/Calls/${providerCallId}.json`;
    const basic = Buffer.from(`${this.apiKey}:${this.apiToken}`).toString('base64');
    const res = await fetch(url, { headers: { Authorization: `Basic ${basic}` } });
    if (!res.ok) return { status: 'unknown' };
    const body = (await res.json()) as { Call?: { Status?: string; Duration?: string } };
    return {
      status: body.Call?.Status ?? 'unknown',
      durationSecs: body.Call?.Duration ? parseInt(body.Call.Duration, 10) : undefined,
    };
  }

  parseWebhook(payload: Record<string, unknown>): WebhookCallContext {
    const p = payload as Record<string, any>;
    const status = (p.Status ?? p.status ?? '').toString().toLowerCase();
    let eventType: WebhookCallContext['eventType'] = 'completed';

    if (status === 'ringing' || status === 'in-progress') eventType = 'ringing';
    else if (status === 'in-progress' || status === 'answered' || status === 'connected') eventType = 'connected';
    else if (status === 'busy') eventType = 'busy';
    else if (status === 'failed') eventType = 'failed';
    else if (status === 'no-answer' || status === 'missed' || status === 'cancelled') eventType = 'missed';
    else if (status === 'completed') eventType = 'completed';

    return {
      provider: this.name,
      eventType,
      providerCallId: (p.CallSid ?? p.Sid ?? p.callId ?? '').toString(),
      from: (p.From ?? p.from ?? '').toString(),
      to: (p.To ?? p.to ?? '').toString(),
      durationSecs: p.Duration ? parseInt(p.Duration, 10) : undefined,
      recordingUrl: p.RecordingUrl?.toString(),
      rawPayload: payload,
    };
  }

  buildWebhookUrl(baseUrl: string): string {
    return `${baseUrl}${config.apiPrefix}/calls/webhook/exotel`;
  }
}