/**
 * Abstract telephony contract. Every provider (Exotel, Twilio, Knowlarity)
 * implements this interface. Business logic depends only on this contract,
 * so providers are fully replaceable without touching application/domain code.
 */
export interface InitiateCallInput {
  to: string;          // customer phone
  from?: string;       // agent phone / caller ID
  agentPhone?: string; // outbound agent number to ring first
  callbackUrl?: string;
}

export interface CallResult {
  provider: TelephonyProviders;
  providerCallId: string;
  status: 'initiated';
}

export interface WebhookCallEvent {
  provider: TelephonyProviders;
  eventType:
    | 'initiated'
    | 'ringing'
    | 'connected'
    | 'completed'
    | 'busy'
    | 'failed'
    | 'missed'
    | 'recording_ready';
  providerCallId: string;
  from: string;
  to: string;
  durationSecs?: number;
  recordingUrl?: string;
  recordingDurationSecs?: number;
  rawPayload: unknown;
}

export interface WebhookCallContext extends WebhookCallEvent {
  rawPayload: unknown;
}

export type TelephonyProviders = 'EXOTEL' | 'TWILIO' | 'KNOWLARITY' | 'TATA';

export interface TelephonyAccount {
  id: string;
  name: string;
  number: string;
  type: 'MOBILE' | 'WEB_DIALER' | 'DID' | 'AGENT';
  status?: string;
  raw?: unknown;
}

export interface TelephonyProvider {
  readonly name: TelephonyProviders;

  /** Initiate an outbound or click-to-call request. */
  initiateCall(input: InitiateCallInput): Promise<CallResult>;

  /** Fetch fresh status of a call from the provider. */
  getCall(providerCallId: string): Promise<{ status: string; durationSecs?: number; recordingUrl?: string }>;

  /** Hangup an active call by ref_id or call_id. */
  hangup?(refId: string): Promise<{ success: boolean; message: string }>;

  /** Perform live operations: Monitor/Whisper/Barge/Transfer */
  callOperation?(params: { type: number; refId?: string; callId?: string; agentId?: string; intercom?: string }): Promise<{ success: boolean; message: string }>;

  /** Fetch currently live calls */
  liveCalls?(): Promise<unknown[]>;

  /** List available telephony accounts / agents that can be assigned to CRM users (TATA: Smartflow agents/DIDs) */
  listAccounts?(): Promise<TelephonyAccount[]>;

  /** Normalize an incoming webhook payload into a domain event. */
  parseWebhook(payload: Record<string, unknown>): WebhookCallContext;

  /** Render the app-server URL the provider should call on events. */
  buildWebhookUrl(baseUrl: string): string;
}