import { Global, Module } from '@nestjs/common';
import { ExotelProvider } from './providers/exotel.provider';
import { TwilioProvider } from './providers/twilio.provider';
import { KnowlarityProvider } from './providers/knowlarity.provider';
import { TataProvider } from './providers/tata.provider';
import { TelephonyFactory } from './telephony.factory';

/**
 * Global telephony module. Registers all providers and exposes the active
 * provider through TelephonyFactory. Swapping providers = changing one env var.
 */
@Global()
@Module({
  providers: [ExotelProvider, TwilioProvider, KnowlarityProvider, TataProvider, TelephonyFactory],
  exports: [TelephonyFactory],
})
export class TelephonyModule {}