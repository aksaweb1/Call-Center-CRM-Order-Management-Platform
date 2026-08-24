import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Agent-facing KPIs scoped to the current agent. */
  async agentDashboard(agentId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const [
      leadsToday,
      callsToday,
      callAgg,
      pendingFollowUps,
      pendingOrders,
      salesAgg,
      ordersToday,
      convertedToday,
    ] = await Promise.all([
      this.prisma.lead.count({
        where: { agentId, createdAt: { gte: startOfDay, lt: endOfDay }, deletedAt: null },
      }),
      this.prisma.call.count({
        where: { agentId, startedAt: { gte: startOfDay, lt: endOfDay }, deletedAt: null },
      }),
      this.prisma.call.aggregate({
        where: {
          agentId,
          deletedAt: null,
          startedAt: { gte: startOfDay, lt: endOfDay },
          durationSecs: { not: null },
        },
        _avg: { durationSecs: true },
        _count: { _all: true },
      }),
      this.prisma.followUp.count({
        where: { agentId, isDone: false, deletedAt: null, scheduledFor: { lt: endOfDay } },
      }),
      this.prisma.order.count({
        where: { agentId, deletedAt: null, status: { in: ['PENDING', 'CONFIRMED', 'PACKED'] } },
      }),
      this.prisma.order.aggregate({
        where: {
          agentId,
          deletedAt: null,
          paymentStatus: 'PAID',
          placedAt: { gte: startOfDay, lt: endOfDay },
        },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.order.count({
        where: { agentId, deletedAt: null, placedAt: { gte: startOfDay, lt: endOfDay } },
      }),
      this.prisma.lead.count({
        where: {
          agentId,
          status: 'CONVERTED',
          updatedAt: { gte: startOfDay, lt: endOfDay },
          deletedAt: null,
        },
      }),
    ]);

    const conversionPercent = leadsToday > 0 ? (convertedToday / leadsToday) * 100 : 0;

    return {
      leadsToday,
      callsToday,
      averageCallSecs: Math.round(callAgg._avg.durationSecs ?? 0),
      totalCalls: callAgg._count._all,
      pendingFollowUps,
      pendingOrders,
      salesToday: salesAgg._sum.total ?? 0,
      paidOrdersToday: salesAgg._count._all,
      ordersToday,
      conversionPercent: Math.round(conversionPercent * 100) / 100,
    };
  }

  /** Manager-level team performance + revenue overview. TEAM_LEADER is scoped to own team. */
  async managerDashboard(params: { from?: Date; to?: Date; teamId?: string | null; role?: string }) {
    const to = params.to ?? new Date();
    const from = params.from ?? new Date(new Date().setDate(to.getDate() - 30));
    const isTeamLeader = params.role === 'TEAM_LEADER' && params.teamId;
    const teamFilter = isTeamLeader ? { agent: { teamId: params.teamId! } } : {};

    const [revenueAgg, orderAgg, pendingFollowUps, leadFunnel, ordersByStatus, agentRanking, callStats] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: { paymentStatus: 'PAID', placedAt: { gte: from, lte: to }, deletedAt: null, ...(isTeamLeader ? ({ agent: { teamId: params.teamId! } } as any) : {}) },
          _sum: { total: true },
        }),
        this.prisma.order.aggregate({
          where: { placedAt: { gte: from, lte: to }, deletedAt: null, ...(isTeamLeader ? ({ agent: { teamId: params.teamId! } } as any) : {}) },
          _count: { _all: true },
        }),
        this.prisma.followUp.count({
          where: { isDone: false, deletedAt: null, scheduledFor: { gte: from, lte: to }, ...teamFilter } as any,
        }),
        this.prisma.lead.groupBy({
          by: ['status'],
          where: { createdAt: { gte: from, lte: to }, deletedAt: null, ...(isTeamLeader ? ({ OR: [{ agent: { teamId: params.teamId! } }, { teamId: params.teamId! }] } as any) : {}) },
          _count: { _all: true },
        }),
        this.prisma.order.groupBy({
          by: ['status'],
          where: { placedAt: { gte: from, lte: to }, deletedAt: null, ...(isTeamLeader ? ({ agent: { teamId: params.teamId! } } as any) : {}) },
          _count: { _all: true },
        }),
        this.prisma.order.groupBy({
          by: ['agentId'],
          where: {
            placedAt: { gte: from, lte: to },
            deletedAt: null,
            agentId: { not: null },
            ...(isTeamLeader ? ({ agent: { teamId: params.teamId! } } as any) : {}),
          },
          _sum: { total: true },
          _count: { _all: true },
          orderBy: { _sum: { total: 'desc' } },
          take: 10,
        }),
        this.prisma.call.aggregate({
          where: { startedAt: { gte: from, lte: to }, deletedAt: null, ...(isTeamLeader ? ({ agent: { teamId: params.teamId! } } as any) : {}) },
          _avg: { durationSecs: true },
          _count: { _all: true },
        }),
      ]);

    const agentIds = agentRanking.map((r) => r.agentId).filter(Boolean) as string[];
    const agents = agentIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const agentMap = new Map(agents.map((a) => [a.id, a.fullName]));

    const ranking = agentRanking.map((r) => ({
      agentId: r.agentId,
      agentName: agentMap.get(r.agentId ?? '') ?? 'Unknown',
      orders: r._count._all,
      revenue: r._sum.total ?? 0,
    }));

    return {
      revenue: revenueAgg._sum.total ?? 0,
      totalOrders: orderAgg._count._all,
      pendingFollowUps,
      leadFunnel,
      ordersByStatus,
      agentRanking: ranking,
      callStats: {
        total: callStats._count._all,
        avgDurationSecs: Math.round(callStats._avg.durationSecs ?? 0),
      },
    };
  }

  /** Executive/CEO dashboard: growth, top products, sources, lifetime value. */
  async ceoDashboard(params: { from?: Date; to?: Date }) {
    const to = params.to ?? new Date();
    const from = params.from ?? new Date(new Date().setDate(to.getDate() - 90));

    const [revenueAgg, totalOrders, topProducts, leadBySourceRaw, monthlyRevenueRaw, cancelledCount] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: { paymentStatus: 'PAID', placedAt: { gte: from, lte: to }, deletedAt: null },
          _sum: { total: true },
        }),
        this.prisma.order.count({
          where: { placedAt: { gte: from, lte: to }, deletedAt: null },
        }),
        this.prisma.orderItem.groupBy({
          by: ['productId'],
          where: { order: { placedAt: { gte: from, lte: to }, deletedAt: null } },
          _sum: { quantity: true, lineTotal: true },
          orderBy: { _sum: { lineTotal: 'desc' } },
          take: 10,
        }),
        this.prisma.lead.groupBy({
          by: ['sourceId'],
          where: { createdAt: { gte: from, lte: to }, deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.order.findMany({
          where: { paymentStatus: 'PAID', placedAt: { gte: from, lte: to }, deletedAt: null },
          select: { placedAt: true, total: true },
          orderBy: { placedAt: 'asc' },
        }),
        this.prisma.order.count({
          where: { status: 'CANCELLED', placedAt: { gte: from, lte: to }, deletedAt: null },
        }),
      ]);

    const monthlyMap = new Map<string, number>();
    for (const o of monthlyRevenueRaw) {
      const key = `${o.placedAt.getFullYear()}-${String(o.placedAt.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + Number(o.total));
    }
    const monthlyRevenue = [...monthlyMap.entries()]
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const leadBySourceRawTop = leadBySourceRaw
      .slice()
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 10);

    const sourceIds = leadBySourceRawTop.map((s) => s.sourceId).filter(Boolean) as string[];
    const sources = sourceIds.length
      ? await this.prisma.leadSource.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, name: true },
        })
      : [];
    const sourceMap = new Map(sources.map((s) => [s.id, s.name]));

    const leadBySource = leadBySourceRawTop.map((s) => ({
      sourceId: s.sourceId,
      sourceName: sourceMap.get(s.sourceId ?? '') ?? 'Direct',
      count: s._count._all,
    }));

    const productIds = topProducts.map((p) => p.productId).filter(Boolean);
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds as string[] } },
          select: { id: true, name: true, sku: true },
        })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    return {
      revenue: revenueAgg._sum.total ?? 0,
      totalOrders,
      cancellationRate: totalOrders > 0 ? (cancelledCount / totalOrders) * 100 : 0,
      topProducts: topProducts.map((p) => ({
        id: p.productId,
        name: productMap.get(p.productId ?? '')?.name ?? 'Unknown',
        sku: productMap.get(p.productId ?? '')?.sku,
        quantity: p._sum.quantity ?? 0,
        lineTotal: p._sum.lineTotal ?? 0,
      })),
      leadBySource,
      monthlyRevenue,
    };
  }

  async callAnalytics(params: { from?: Date; to?: Date; teamId?: string | null; role?: string }) {
    const to = params.to ?? new Date();
    const from = params.from ?? new Date(new Date().setDate(to.getDate() - 30));
    const isTeamLeader = params.role === 'TEAM_LEADER' && params.teamId;
    const teamFilter = isTeamLeader ? { agent: { teamId: params.teamId! } } : {};
    const [total, answered, byStatus, avgAgg] = await Promise.all([
      this.prisma.call.count({ where: { startedAt: { gte: from, lte: to }, deletedAt: null, ...teamFilter } as never }),
      this.prisma.call.count({ where: { startedAt: { gte: from, lte: to }, deletedAt: null, status: 'COMPLETED', ...teamFilter } as never }),
      this.prisma.call.groupBy({ by: ['status'], where: { startedAt: { gte: from, lte: to }, deletedAt: null, ...teamFilter } as never, _count: { _all: true } }),
      this.prisma.call.aggregate({ where: { startedAt: { gte: from, lte: to }, deletedAt: null, status: 'COMPLETED', durationSecs: { not: null }, ...teamFilter } as never, _avg: { durationSecs: true }, _sum: { durationSecs: true } }),
    ]);
    // Try to enrich with Tata CDR charges if available (best-effort)
    let charges = 0;
    try {
      const token = process.env.TATA_TOKEN;
      if (token) {
        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        const url = `https://api-smartflo.tatateleservices.com/v1/call/records?from_date=${encodeURIComponent(fmt(from))}&to_date=${encodeURIComponent(fmt(to))}&limit=100`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
        if (res.ok) {
          const body = (await res.json()) as { results?: Array<{ charges?: number }> };
          charges = body.results?.reduce((s, r) => s + (r.charges ?? 0), 0) ?? 0;
        }
      }
    } catch {}
    return {
      total,
      answered,
      answeredRate: total ? Math.round((answered / total) * 10000) / 100 : 0,
      byStatus,
      avgTalkSecs: Math.round(avgAgg._avg.durationSecs ?? 0),
      totalTalkSecs: avgAgg._sum.durationSecs ?? 0,
      charges,
    };
  }
}
