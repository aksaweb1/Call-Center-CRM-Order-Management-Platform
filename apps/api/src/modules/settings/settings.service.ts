import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const settings = await this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
    return settings.map(({ key, value, description }) => ({ key, value, description }));
  }

  async findOne(key: string) {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting not found: ${key}`);
    return { key: setting.key, value: setting.value, description: setting.description };
  }

  async set(key: string, value: unknown, updatedById: string | undefined) {
    const existing = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (existing?.isSecret && value === undefined) {
      throw new ForbiddenException('Secret settings must be provided a value.');
    }
    const data = {
      value: value as never,
      ...(updatedById ? { updatedById } : {}),
    };
    return this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: value as never, ...(updatedById ? { updatedById } : {}) },
      update: data,
    });
  }

  async bulkSet(entries: Array<{ key: string; value: unknown }>, updatedById?: string) {
    const results = [];
    for (const e of entries) {
      results.push(await this.set(e.key, e.value, updatedById));
    }
    return results;
  }

  async remove(key: string) {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting not found: ${key}`);
    if (setting.isSecret) throw new ForbiddenException('Cannot delete secret settings.');
    await this.prisma.systemSetting.delete({ where: { key } });
    return { ok: true };
  }
}