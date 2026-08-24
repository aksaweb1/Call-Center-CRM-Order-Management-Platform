import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

const customerInclude = {
  _count: { select: { leads: true, orders: true, calls: true, followUps: true } },
} satisfies Prisma.CustomerInclude;

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCustomerDto, createdById: string) {
    return this.prisma.customer.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        alternatePhone: dto.alternatePhone,
        email: dto.email,
        gst: dto.gst,
        company: dto.company,
        dob: dto.dob ? new Date(dto.dob) : undefined,
        customerType: dto.customerType ?? 'INDIVIDUAL',
        tags: dto.tags ?? [],
        latitude: dto.latitude,
        longitude: dto.longitude,
        createdById,
      },
      include: customerInclude,
    });
  }

  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    tag?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { page, limit, search, tag, sortBy, sortOrder } = params;
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { alternatePhone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
              { company: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        include: customerInclude,
        orderBy: this.parseSort(sortBy, sortOrder),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { total, items };
  }

  findById(id: string) {
    return this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: { ...customerInclude, addresses: { where: { deletedAt: null } } },
    });
  }

/** Find existing customers by normalized phone (and optionally email). */
  findByDuplicates(phone: string, email?: string) {
    const normalized = phone.replace(/\s+/g, '');
    return this.prisma.customer.findFirst({
      where: {
        OR: [
          { phone: normalized },
          { alternatePhone: normalized },
          ...(email ? [{ email }] : []),
        ],
      },
    });
  }

  update(id: string, dto: UpdateCustomerDto) {
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.alternatePhone !== undefined ? { alternatePhone: dto.alternatePhone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.gst !== undefined ? { gst: dto.gst } : {}),
        ...(dto.company !== undefined ? { company: dto.company } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.state !== undefined ? { state: dto.state } : {}),
        ...(dto.country !== undefined ? { country: dto.country } : {}),
        ...(dto.pincode !== undefined ? { pincode: dto.pincode } : {}),
        ...(dto.dob !== undefined ? { dob: dto.dob ? new Date(dto.dob) : null } : {}),
        ...(dto.customerType !== undefined ? { customerType: dto.customerType } : {}),
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      },
      include: customerInclude,
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private parseSort(
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Prisma.CustomerOrderByWithRelationInput {
    const allowed: Record<string, Prisma.CustomerOrderByWithRelationInput> = {
      createdAt: { createdAt: sortOrder },
      name: { name: sortOrder },
      updatedAt: { updatedAt: sortOrder },
    };
    return allowed[sortBy ?? 'createdAt'] ?? allowed.createdAt;
  }
}