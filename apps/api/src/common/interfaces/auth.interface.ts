import { RoleType } from '../enums/types.enum';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
  role: RoleType;
  teamId: string | null;
  permissions: string[];
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: RoleType;
  type: 'access' | 'refresh';
}

export interface JwtRefreshPayload extends JwtPayload {
  jti: string;
}