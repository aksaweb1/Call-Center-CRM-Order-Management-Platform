import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ROLES_KEY } from '../decorators/auth.decorator';
import { AuthUser } from '../interfaces/auth.interface';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if ((!requiredRoles || requiredRoles.length === 0) &&
        (!requiredPermissions || requiredPermissions.length === 0)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthUser = request.user;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    if (requiredRoles?.length && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Requires one of roles: ${requiredRoles.join(', ')}`,
      );
    }

    if (
      requiredPermissions?.length &&
      !requiredPermissions.every((p) => user.permissions?.includes(p))
    ) {
      throw new ForbiddenException(
        `Requires permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}