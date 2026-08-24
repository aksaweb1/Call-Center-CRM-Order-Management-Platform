import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

export type ReportType = 'sales' | 'calls' | 'fulfillment' | 'inventory' | 'leads';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(type: ReportType, params: { from?: string; to?: string }) {
    const from = params.from ? new Date(params.from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const to = params.to ? new Date(params.to) : new Date();
    const where = { placedAt: { gte: from, lte: to }, deletedAt: null };

    switch (type) {
      case 'sales':
        return this.salesReport(from, to, where);
      case 'calls':
        return this.callsReport(from, to);
      case 'fulfillment':
        return this.fulfillmentReport(from, to, where);
      case 'inventory':
        return this.inventoryReport();
      case 'leads':
        return this.leadsReport(from, to);
      default:
        throw new NotFoundException(`Unknown report type: ${type}`);
    }
  }

  private async salesReport(from: Date, to: Date, where: unknown) {
    const [daily, byStatus, byPayment, summary] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['placedAt'],
        where: where as never,
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: where as never,
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.order.groupBy({
        by: ['paymentStatus'],
        where: where as never,
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: where as never,
        _sum: { total: true, discount: true, shippingCharges: true, gstTotal: true },
        _count: { _all: true },
        _avg: { total: true },
      }),
    ]);

    const days: Record<string, { orders: number; revenue: number }> = {};
    for (const d of daily) {
      const key = (d.placedAt as Date).toISOString().slice(0, 10);
      const rev = Number(d._sum.total ?? 0);
      days[key] = {
        orders: (days[key]?.orders ?? 0) + d._count._all,
        revenue: (days[key]?.revenue ?? 0) + rev,
      };
    }

    const sum = summary._sum as {
      total?: unknown;
      discount?: unknown;
      shippingCharges?: unknown;
      gstTotal?: unknown;
    };
    const count = summary._count as { _all?: number };
    return {
      summary: {
        revenue: Number(sum?.total ?? 0),
        orders: count?._all ?? 0,
        averageOrderValue: count?._all ? Number(sum?.total ?? 0) / count._all : 0,
        discounts: Number(sum?.discount ?? 0),
        shipping: Number(sum?.shippingCharges ?? 0),
        tax: Number(sum?.gstTotal ?? 0),
      },
      byStatus,
      byPayment,
      daily: Object.entries(days)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
      range: { from: from.toISOString(), to: to.toISOString() },
    };
  }

  private async callsReport(from: Date, to: Date) {
    const [calls, byOutcome, byDirection, agentStats] = await Promise.all([
      this.prisma.call.aggregate({
        where: { startedAt: { gte: from, lte: to }, deletedAt: null },
        _count: { _all: true },
        _sum: { durationSecs: true },
        _avg: { durationSecs: true },
      }),
      this.prisma.call.groupBy({
        by: ['outcome'],
        where: { startedAt: { gte: from, lte: to }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.call.groupBy({
        by: ['direction'],
        where: { startedAt: { gte: from, lte: to }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.call.groupBy({
        by: ['agentId'],
        where: { startedAt: { gte: from, lte: to }, deletedAt: null, agentId: { not: null } },
        _count: { _all: true },
        _sum: { durationSecs: true },
      }),
    ]);

    return {
      summary: {
        total: calls._count._all,
        totalMinutes: Math.round((calls._sum.durationSecs ?? 0) / 60),
        avgSeconds: Math.round(calls._avg.durationSecs ?? 0),
      },
      byOutcome,
      byDirection,
      agentStats,
      range: { from: from.toISOString(), to: to.toISOString() },
    };
  }

  private async fulfillmentReport(from: Date, to: Date, where: unknown) {
    const [byStatus, byCourier, shipped] = await Promise.all([
      this.prisma.orderShipment.groupBy({
        by: ['status'],
        where: { createdAt: { gte: from, lte: to }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.orderShipment.groupBy({
        by: ['courierName'],
        where: { createdAt: { gte: from, lte: to }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.orderItem.aggregate({
        where: { order: where as never },
        _sum: { quantity: true },
      }),
    ]);

    return {
      byStatus,
      byCourier,
      itemsShipped: shipped._sum?.quantity ?? 0,
      range: { from: from.toISOString(), to: to.toISOString() },
    };
  }

  private async inventoryReport() {
    const [lowStock, byCategory, summary] = await Promise.all([
      this.prisma.product.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, sku: true, stock: true, lowStockAt: true },
      }),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: { deletedAt: null },
        _sum: { stock: true },
        _count: { _all: true },
      }),
      this.prisma.product.aggregate({
        where: { deletedAt: null },
        _sum: { stock: true },
        _count: { _all: true },
        _avg: { stock: true },
      }),
    ]);

    const lowStockFiltered = lowStock
      .filter((p) => p.stock <= p.lowStockAt)
      .map(({ lowStockAt, ...p }) => ({ ...p, lowStockAt }));

    return {
      summary: {
        products: summary._count._all,
        totalUnits: summary._sum.stock ?? 0,
        avgPerProduct: Math.round(summary._avg.stock ?? 0),
      },
      lowStock: lowStockFiltered,
      byCategory,
    };
  }

  private async leadsReport(from: Date, to: Date) {
    const [byStatus, bySource, byAgent, summary] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['status'],
        where: { createdAt: { gte: from, lte: to }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['sourceId'],
        where: { createdAt: { gte: from, lte: to }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['agentId'],
        where: { createdAt: { gte: from, lte: to }, deletedAt: null, agentId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.lead.aggregate({
        where: { createdAt: { gte: from, lte: to }, deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    return {
      summary: { total: summary._count._all },
      byStatus,
      bySource,
      byAgent,
      range: { from: from.toISOString(), to: to.toISOString() },
    };
  }
}
