import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PermissionsModule } from '../permissions/permissions.module';
import { CreateUserDto, UpdateUserDto, SetUserPermissionsDto } from './dto/user.dto';
import { UsersRepository } from './users.repository';
import { PaginationMeta } from '../../common/interfaces/api-response.interface';
import { normalizeLimit, normalizePage } from '../../common/utils/pagination';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(dto: CreateUserDto) {
    const emailConflict = await this.repository.findByEmail(dto.email);
    if (emailConflict) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password);
    return this.repository.createUser(dto, passwordHash);
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    roleKey?: string;
    teamId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
const page = normalizePage(query.page);
    const limit = normalizeLimit(query.limit);
    const [total, items] = await this.repository.findAll({
      page,
      limit,
      search: query.search,
      roleKey: query.roleKey,
      teamId: query.teamId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    const totalPages = Math.ceil(total / limit);
    return { items, total, page, limit, totalPages };
  }

  async findById(id: string) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Returns the user (with password hash + role) for auth verification. */
  async findByEmailPublic(email: string) {
    return this.repository.findByEmailPublic(email);
  }

  async update(id: string, dto: UpdateUserDto) {
    let passwordHash: string | undefined;
    if ('password' in dto && (dto as any).password) {
      passwordHash = await argon2.hash((dto as any).password);
    }
    const user = await this.repository.updateUser(id, dto, passwordHash);
    // Deactivating an account must immediately kill its refresh sessions,
    // otherwise the user keeps minting access tokens until the token expires.
    if (dto.isActive === false) {
      await this.revokeRefreshTokens(id);
    }
    return user;
  }

  async remove(id: string): Promise<void> {
    const current = await this.repository.findById(id);
    if (!current) throw new NotFoundException('User not found');
    await this.revokeRefreshTokens(id);
    await this.repository.softDelete(id);
  }

  /** Kills all live refresh tokens for a user (all devices). */
  private async revokeRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getPermissions(userId: string): Promise<string[]> {
    const effective = await this.getEffectivePermissions(userId);
    return effective.effective;
  }

  /** Effective permissions after applying the user's per-user overrides. */
  async getEffectivePermissions(userId: string): Promise<{
    role: string;
    rolePermissions: string[];
    granted: string[];
    revoked: string[];
    effective: string[];
  }> {
    const user = await this.repository.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const rolePermissions = await this.repository.findPermissionsForUser(userId);
    const overrides = await this.repository.findPermissionOverrides(userId);
    const granted = overrides.filter((o) => o.granted).map((o) => o.permission.key);
    const revoked = overrides.filter((o) => !o.granted).map((o) => o.permission.key);

    if (user.role.key === 'SUPER_ADMIN') {
      const all = await this.prisma.permission.findMany({ select: { key: true } });
      return {
        role: user.role.key,
        rolePermissions: all.map((p) => p.key),
        granted,
        revoked,
        effective: all.map((p) => p.key),
      };
    }

    const set = new Set(rolePermissions);
    for (const k of granted) set.add(k);
    for (const k of revoked) set.delete(k);
    return {
      role: user.role.key,
      rolePermissions,
      granted,
      revoked,
      effective: [...set],
    };
  }

  /** Super-admin only: grant/revoke permissions for any user. */
  async setUserPermissions(
    targetUserId: string,
    dto: SetUserPermissionsDto,
    actingUser: { id: string; role: string },
  ) {
    if (actingUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN can manage user permissions');
    }
    const target = await this.repository.findById(targetUserId);
    if (!target) throw new NotFoundException('User not found');
    if (target.deletedAt) throw new NotFoundException('User not found');

    const result = await this.repository.replacePermissionOverrides(
      targetUserId,
      dto.granted,
      dto.revoked,
    );
    void result;
    return this.getEffectivePermissions(targetUserId);
  }
}