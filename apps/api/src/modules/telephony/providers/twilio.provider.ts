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
export class TwilioProvider implements TelephonyProvider {
  readonly name: TelephonyProviders = 'TWILIO';
  private readonly logger = new Logger(TwilioProvider.name);

  private get accountSid(): string {
    return process.env.TWILIO_ACCOUNT_SID ?? '';
  }
  private get authToken(): string {
    return process.env.TWILIO_AUTH_TOKEN ?? '';
  }

  async initiateCall(input: InitiateCallInput): Promise<CallResult> {
    if (!this.accountSid || !this.authToken) {
      this.logger.warn('Twilio credentials missing — simulating call');
      return { provider: this.name, providerCallId: `twilio-sim-${Date.now()}`, status: 'initiated' };
    }
    const from = input.from ?? (process.env.TWILIO_PHONE_NUMBER ?? '');
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls.json`;
    const form = new URLSearchParams({
      From: from,
      To: input.to,
      StatusCallback: input.callbackUrl ?? '',
      StatusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'].join(' '),
      Record: 'true',
    });
    const basic = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) throw new Error(`Twilio call failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { sid?: string };
    return { provider: this.name, providerCallId: body.sid ?? '', status: 'initiated' };
  }

  async getCall(providerCallId: string) {
    if (!this.accountSid || !this.authToken) return { status: 'unknown' };
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls/${providerCallId}.json`;
    const basic = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const res = await fetch(url, { headers: { Authorization: `Basic ${basic}` } });
    if (!res.ok) return { status: 'unknown' };
    const body = (await res.json()) as { status?: string; duration?: string };
    return {
      status: body.status ?? 'unknown',
      durationSecs: body.duration ? parseInt(body.duration, 10) : undefined,
    };
  }

  parseWebhook(payload: Record<string, unknown>): WebhookCallContext {
    const p = payload as Record<string, any>;
    const status = (p.CallStatus ?? p.status ?? '').toString().toLowerCase();
    let eventType: WebhookCallContext['eventType'] = 'completed';
    if (status === 'ringing') eventType = 'ringing';
    else if (status === 'in-progress') eventType = 'connected';
    else if (status === 'busy') eventType = 'busy';
    else if (status === 'failed' || status === 'canceled') eventType = 'failed';
    else if (status === 'no-answer') eventType = 'missed';
    else if (status === 'completed') eventType = 'completed';

    return {
      provider: this.name,
      eventType,
      providerCallId: (p.CallSid ?? p.callSid ?? '').toString(),
      from: (p.From ?? p.from ?? '').toString(),
      to: (p.To ?? p.to ?? '').toString(),
      durationSecs: p.CallDuration ? parseInt(p.CallDuration, 10) : undefined,
      recordingUrl: p.RecordingUrl?.toString(),
      recordingDurationSecs: p.RecordingDuration ? parseInt(p.RecordingDuration, 10) : undefined,
      rawPayload: payload,
    };
  }

  buildWebhookUrl(baseUrl: string): string {
    return `${baseUrl}${config.apiPrefix}/calls/webhook/twilio`;
  }
}