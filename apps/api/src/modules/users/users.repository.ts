import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  createUser(dto: CreateUserDto, passwordHash: string) {
    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        fullName: dto.fullName,
        passwordHash,
        role: { connect: { key: dto.roleKey } },
        team: dto.teamId ? { connect: { id: dto.teamId } } : undefined,
        avatarUrl: dto.avatarUrl,
      },
    });
  }

  findAll(params: {
    page: number;
    limit: number;
    search?: string;
    roleKey?: string;
    teamId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { page, limit, search, roleKey, teamId, sortBy, sortOrder } = params;
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : {}),
      ...(roleKey ? { role: { key: roleKey } } : {}),
      ...(teamId ? { teamId } : {}),
    };

    const orderBy = this.parseSort(sortBy, sortOrder);
    return this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          role: { select: { id: true, key: true, name: true } },
          team: { select: { id: true, name: true, code: true } },
        },
      }),
    ]);
  }

  findById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        role: { select: { id: true, key: true, name: true } },
        team: { select: { id: true, name: true, code: true } },
      },
    });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  /** Includes password hash + role — used only by the auth service. */
  findByEmailPublic(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase(), deletedAt: null },
      include: { role: true },
    });
  }

  async updateUser(id: string, dto: UpdateUserDto, passwordHash?: string) {
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email ? { email: dto.email.toLowerCase() } : {}),
        ...(dto.phone ? { phone: dto.phone } : {}),
        ...(dto.fullName ? { fullName: dto.fullName } : {}),
        ...(dto.avatarUrl ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(passwordHash ? { passwordHash } : {}),
        ...(dto.roleKey ? { role: { connect: { key: dto.roleKey } } } : {}),
        ...(dto.teamId
          ? { team: { connect: { id: dto.teamId } } }
          : dto.teamId === null
            ? { team: { disconnect: true } }
            : {}),
      },
      include: { role: true, team: true },
    });
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('User not found');
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async findPermissionsForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { role: { users: { some: { id: userId } } } },
      select: { permission: { select: { key: true } } },
    });
    return rows.map((r) => r.permission.key);
  }

  findPermissionOverrides(userId: string) {
    return this.prisma.permissionOverride.findMany({
      where: { userId },
      select: {
        granted: true,
        permission: { select: { key: true } },
      },
    });
  }

  async replacePermissionOverrides(
    userId: string,
    granted: string[],
    revoked: string[],
  ): Promise<{ granted: string[]; revoked: string[] }> {
    const perms = await this.prisma.permission.findMany({
      where: { key: { in: [...granted, ...revoked] } },
      select: { id: true, key: true },
    });
    const byKey = new Map(perms.map((p) => [p.key, p.id]));

    const skip = [...granted, ...revoked].filter((k) => !byKey.has(k));
    if (skip.length) {
      throw new BadRequestException(`Unknown permission keys: ${skip.join(', ')}`);
    }

    await this.prisma.permissionOverride.deleteMany({ where: { userId } });

    const grantIds = granted.map((k) => byKey.get(k)!);
    const revokeIds = revoked.map((k) => byKey.get(k)!);

    await this.prisma.permissionOverride.createMany({
      data: [
        ...grantIds.map((permissionId) => ({ userId, permissionId, granted: true })),
        ...revokeIds.map((permissionId) => ({ userId, permissionId, granted: false })),
      ],
      skipDuplicates: true,
    });

    return { granted, revoked };
  }

  private parseSort(
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Prisma.UserOrderByWithRelationInput {
    const allowed: Record<string, Prisma.UserOrderByWithRelationInput> = {
      createdAt: { createdAt: sortOrder },
      fullName: { fullName: sortOrder },
      email: { email: sortOrder },
      updatedAt: { updatedAt: sortOrder },
    };
    return allowed[sortBy ?? 'createdAt'] ?? allowed.createdAt;
  }
}