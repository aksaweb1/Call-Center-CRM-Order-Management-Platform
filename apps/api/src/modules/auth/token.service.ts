import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { RoleType } from '../../common/enums/types.enum';
import { UsersService } from '../users/users.service';
import { JwtRefreshPayload } from '../../common/interfaces/auth.interface';
import { RefreshTokenService } from './refresh-token.service';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: RoleType | string;
    permissions: string[];
  };
}

interface CreateTokensParams {
  userId: string;
  email: string;
  role: RoleType | string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async createTokenPair(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.usersService.findById(userId);

    const accessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.key as RoleType,
      type: 'access' as const,
    };

    const jti = uuidv4();
    const refreshPayload: JwtRefreshPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.key as RoleType,
      type: 'refresh',
      jti,
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_TTL ?? '15m',
      issuer: process.env.JWT_ISSUER ?? 'callcenter-crm',
    });

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_TTL ?? '14d',
      issuer: process.env.JWT_ISSUER ?? 'callcenter-crm',
    });

    await this.refreshTokenService.persist({
      token: refreshToken,
      jti,
      userId: user.id,
      ipAddress,
      userAgent,
      ttlSeconds: this.parseTtlSeconds(process.env.JWT_REFRESH_TTL ?? '14d'),
    });

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string, ipAddress?: string, userAgent?: string): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: JwtRefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtRefreshPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const stored = await this.refreshTokenService.consumeForJti(payload.jti);
    if (!stored) {
      throw new UnauthorizedException('Refresh token revoked or expired');
    }

    // Re-check account state on every rotation: a deactivated or deleted
    // user must not be able to mint new access tokens from a live refresh
    // token.
    let user;
    try {
      user = await this.usersService.findById(payload.sub);
    } catch {
      await this.revokeForUser(payload.sub);
      throw new UnauthorizedException('Account no longer exists');
    }
    if (!user.isActive) {
      await this.revokeForUser(user.id);
      throw new UnauthorizedException('Account is disabled');
    }

    return this.createTokenPair(payload.sub, ipAddress, userAgent);
  }

  async revokeForUser(userId: string): Promise<void> {
    await this.refreshTokenService.revokeAllForUser(userId);
  }

  private parseTtlSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 14 * 24 * 3600;
    const n = parseInt(match[1], 10);
    switch (match[2]) {
      case 's': return n;
      case 'm': return n * 60;
      case 'h': return n * 3600;
      case 'd': return n * 86400;
      default: return 14 * 24 * 3600;
    }
  }
}