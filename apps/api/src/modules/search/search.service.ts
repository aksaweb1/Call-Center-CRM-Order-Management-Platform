import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cross-entity keyword search with a strict character limit. */
  async search(q: string, params: { limit?: number }) {
    const term = (q ?? '').trim();
    const limit = Math.min(params.limit ?? 10, 25);
    if (!term) return { customers: [], leads: [], orders: [], products: [] };

    const contains = { contains: term, mode: 'insensitive' } as Prisma.StringFilter;
    const whereCustomer = {
      deletedAt: null,
      OR: [{ name: contains }, { email: contains }, { phone: contains }],
    };

    const [customers, leads, orders, products] = await Promise.all([
      this.prisma.customer.findMany({
        where: whereCustomer,
        take: limit,
        select: { id: true, name: true, phone: true, email: true },
      }),
      this.prisma.lead.findMany({
        where: {
          deletedAt: null,
          OR: [
            { title: contains },
            { customer: { name: contains } },
            { customer: { phone: contains } },
            { customer: { email: contains } },
          ],
        },
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      }),
      this.prisma.order.findMany({
        where: {
          deletedAt: null,
          OR: [
            { orderNumber: contains },
            { customer: { name: contains } },
            { customer: { phone: contains } },
          ],
        },
        take: limit,
        select: { id: true, orderNumber: true, total: true, status: true },
      }),
      this.prisma.product.findMany({
        where: { deletedAt: null, OR: [{ name: contains }, { sku: contains }] },
        take: limit,
        select: { id: true, name: true, sku: true, price: true },
      }),
    ]);

    return { customers, leads, orders, products };
  }
}