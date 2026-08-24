import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';

export interface PersistTokenPayload {
  token: string;
  jti: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  ttlSeconds: number;
}

/**
 * Stores refresh-token hashes (never the raw token) so they can be
 * validated, rotated, and revoked.
 */
@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async persist(payload: PersistTokenPayload): Promise<void> {
    const expiresAt = new Date(Date.now() + payload.ttlSeconds * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId: payload.userId,
        tokenHash: this.hash(payload.jti),
        expiresAt,
        ipAddress: payload.ipAddress,
        userAgent: payload.userAgent,
      },
    });
  }

  /** Rotate: mark the token used, return true if still valid & not revoked. */
  async consumeForJti(jti: string): Promise<boolean> {
    const record = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash: this.hash(jti),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!record) return false;
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return true;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}