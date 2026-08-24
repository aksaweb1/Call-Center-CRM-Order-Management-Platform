import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AssignmentStrategy } from '../../common/enums/types.enum';

export interface AssignmentCandidate {
  agentId: string | string[];
  weighted?: boolean;
}

/**
 * Implements configurable lead-assignment strategies. Each strategy returns
 * the recommended agent for a given lead. Strategies are independent of the
 * call/order flow and can be swapped via settings.
 */
@Injectable()
export class AssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(
    strategy: AssignmentStrategy,
    leadId: string,
    teamId?: string,
  ): Promise<string | null> {
    switch (strategy) {
      case 'ROUND_ROBIN':
        return this.roundRobin(teamId);
      case 'LEAST_BUSY':
        return this.leastBusy(teamId);
      case 'SKILL_BASED':
        return this.leastBusy(teamId);
      case 'LANGUAGE_BASED':
        return this.leastBusy(teamId);
      case 'LOCATION_BASED':
        return this.locationBased(teamId);
      case 'VIP_QUEUE':
        return this.vipQueue(teamId);
      case 'MANUAL':
      default:
        return null;
    }
  }

  private async availableAgents(teamId?: string) {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        role: { key: 'AGENT' },
        ...(teamId ? { teamId } : {}),
      },
      select: { id: true },
    });
  }

  private async roundRobin(teamId?: string): Promise<string | null> {
    // Simple least-loaded rotation: prefer the agent with the fewest open leads.
    const agents = await this.availableAgents(teamId);
    if (agents.length === 0) return null;

    const counts = await this.prisma.lead.groupBy({
      by: ['agentId'],
      where: {
        agentId: { in: agents.map((a) => a.id) },
        status: { in: ['NEW', 'ASSIGNED', 'CALLING'] },
        deletedAt: null,
      },
      _count: { _all: true },
    });

    const countsMap = new Map(counts.map((c) => [c.agentId ?? '', c._count._all]));
    agents.sort((a, b) => (countsMap.get(a.id) ?? 0) - (countsMap.get(b.id) ?? 0));
    return agents[0].id;
  }

  private async leastBusy(teamId?: string): Promise<string | null> {
    return this.roundRobin(teamId);
  }

  private async locationBased(teamId?: string): Promise<string | null> {
    return this.roundRobin(teamId);
  }

  private async vipQueue(teamId?: string): Promise<string | null> {
    // VIP leads go to the most experienced agent — approximated by assignment count.
    const agents = await this.availableAgents(teamId);
    if (agents.length === 0) return null;
    const counts = await this.prisma.lead.groupBy({
      by: ['agentId'],
      where: { agentId: { in: agents.map((a) => a.id) } },
      _count: { _all: true },
    });
    const countsMap = new Map(counts.map((c) => [c.agentId ?? '', c._count._all]));
    agents.sort((a, b) => (countsMap.get(b.id) ?? 0) - (countsMap.get(a.id) ?? 0));
    return agents[0].id;
  }
}