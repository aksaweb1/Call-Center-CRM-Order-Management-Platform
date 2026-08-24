import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorator';
import { JwtPayload } from '../interfaces/auth.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice(7);

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      if (payload.type !== 'access') {
        throw new UnauthorizedException('Invalid token type');
      }
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
      include: {
        role: { select: { id: true, key: true, name: true } },
        team: { select: { id: true, name: true, code: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('Account not found or inactive');
    }

    let permissions: string[] = [];
    const perms = await this.prisma.rolePermission.findMany({
      where: { roleId: user.roleId },
      select: { permission: { select: { key: true } } },
    });
    permissions = perms.map((r) => r.permission.key);

    // SUPER_ADMIN implicitly has all permissions
    if (user.role.key === 'SUPER_ADMIN') {
      const all = await this.prisma.permission.findMany({ select: { key: true } });
      permissions = all.map((p) => p.key);
    } else {
      // Per-user overrides on top of the role: granted:true grants a permission,
      // granted:false revokes one the role provides.
      const overrides = await this.prisma.permissionOverride.findMany({
        where: { userId: user.id },
        select: { granted: true, permission: { select: { key: true } } },
      });
      const granted = new Set(permissions);
      for (const o of overrides) {
        if (o.granted) granted.add(o.permission.key);
        else granted.delete(o.permission.key);
      }
      permissions = [...granted];
    }

    request.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roleId: user.roleId,
      role: user.role.key,
      teamId: user.teamId,
      permissions,
    };
    return true;
  }
}