import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { Permissions } from '../permissions/permissions.constants';
import { TelephonyFactory } from './telephony.factory';

@ApiTags('Telephony')
@Controller('telephony')
export class TelephonyController {
  constructor(private readonly factory: TelephonyFactory) {}

  /**
   * Lists all available call accounts from the active provider (TATA: Smartflow agents/DIDs).
   * SUPER_ADMIN/ADMIN call this from the Employees page to bind a CRM user to a real number.
   * If the provider is not configured, returns the env fallback (TATA_AGENT_NUMBER / TATA_CALLER_ID).
   */
  @Get('accounts')
  @RequirePermissions(Permissions.USER_READ)
  async listAccounts() {
    const provider = this.factory.getProvider();
    if (!provider.listAccounts) return [];
    try {
      const accounts = await provider.listAccounts();
      return accounts;
    } catch (e) {
      // Never 500 the admin UI — return empty so the dropdown still works for manual phone entry.
      return [];
    }
  }
}
