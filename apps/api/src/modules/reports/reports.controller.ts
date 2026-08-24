import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { Permissions } from '../permissions/permissions.constants';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get(':type')
  @RequirePermissions(Permissions.REPORT_READ)
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  build(@Param('type') type: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.build(type as never, { from, to });
  }

  @Get(':type/export')
  @RequirePermissions(Permissions.REPORT_READ)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @Res() res: Response,
    @Param('type') type: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.reportsService.build(type as never, { from, to });
    const csv = toCsv(flattenReport(data));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${type}-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\r\n');
}

function flattenReport(data: Record<string, unknown>, prefix = ''): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          rows.push({ ...flattenScalarRow(item as Record<string, unknown>, key) });
        }
      }
    } else if (value && typeof value === 'object') {
      Object.assign(rows.length ? rows[0] : (rows[0] = {}), flattenScalarRow(value as Record<string, unknown>, key));
    }
  }
  return rows;
}

function flattenScalarRow(obj: Record<string, unknown>, section: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === 'object') continue;
    out[`${section}.${k}`] = v;
  }
  return out;
}
