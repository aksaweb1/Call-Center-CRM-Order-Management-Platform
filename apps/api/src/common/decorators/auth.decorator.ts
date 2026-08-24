import { SetMetadata } from '@nestjs/common';
import { RoleType } from '../enums/types.enum';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';
export const IS_PUBLIC_KEY = 'isPublic';

/** Restrict endpoint to a set of roles (OR semantics). */
export const Roles = (...roles: RoleType[]) => SetMetadata(ROLES_KEY, roles);

/** Require all listed permissions on an endpoint (AND semantics). */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Mark an endpoint as publicly accessible (skips JWT guard). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);