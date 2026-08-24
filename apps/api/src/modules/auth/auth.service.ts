import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';

export interface LoginInput {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {}

  async login(input: LoginInput) {
    const user = await this.usersService.findByEmailPublic(input.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = await this.tokenService.createTokenPair(
      user.id,
      input.ipAddress,
      input.userAgent,
    );

    const permissions = await this.usersService.getPermissions(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role.key,
        teamId: user.teamId,
        permissions,
      },
    };
  }

  async refreshToken(refreshToken: string, ipAddress?: string, userAgent?: string) {
    return this.tokenService.refresh(refreshToken, ipAddress, userAgent);
  }

  async logout(userId: string): Promise<void> {
    await this.tokenService.revokeForUser(userId);
  }
}