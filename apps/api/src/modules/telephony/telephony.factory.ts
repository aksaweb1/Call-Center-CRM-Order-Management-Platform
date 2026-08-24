import { Inject, Injectable } from '@nestjs/common';
import { config } from '../../config';
import { TelephonyProvider } from './interfaces/telephony-provider.interface';
import { ExotelProvider } from './providers/exotel.provider';
import { TwilioProvider } from './providers/twilio.provider';
import { KnowlarityProvider } from './providers/knowlarity.provider';
import { TataProvider } from './providers/tata.provider';

/**
 * Selects and exposes the active TelephonyProvider based on the
 * TELEPHONY_PROVIDER environment variable. All providers are registered in
 * the container; this factory returns the active one as the single,
 * business-facing entry point.
 */
@Injectable()
export class TelephonyFactory {
  constructor(
    @Inject(ExotelProvider) private readonly exotel: TelephonyProvider,
    @Inject(TwilioProvider) private readonly twilio: TelephonyProvider,
    @Inject(KnowlarityProvider) private readonly knowlarity: TelephonyProvider,
    @Inject(TataProvider) private readonly tata: TelephonyProvider,
  ) {}

  getProvider(): TelephonyProvider {
    switch (config.telephonyProvider) {
      case 'TWILIO':
        return this.twilio;
      case 'KNOWLARITY':
        return this.knowlarity;
      case 'TATA':
        return this.tata;
      case 'EXOTEL':
      default:
        return this.exotel;
    }
  }
}