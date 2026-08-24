import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/database/prisma.service';
import { Permissions } from './permissions.constants';
import { RequirePermissions } from '../../common/decorators/auth.decorator';

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Full permission catalog grouped by module (for the admin manager UI). */
  @Get()
  @RequirePermissions(Permissions.PERMISSION_READ)
  async catalog() {
    const rows = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { key: 'asc' }],
    });
    const byModule = new Map<string, Array<{ key: string; name: string }>>();
    for (const r of rows) {
      const list = byModule.get(r.module) ?? [];
      list.push({ key: r.key, name: r.name });
      byModule.set(r.module, list);
    }
    return Array.from(byModule, ([module, permissions]) => ({ module, permissions }));
  }
}