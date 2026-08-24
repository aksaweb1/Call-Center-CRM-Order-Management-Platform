import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/auth.decorator';
import { AuthUser } from '../../common/interfaces/auth.interface';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import { UsersService } from '../users/users.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Req() req: Request) {
    return this.authService.login({
      email: dto.email,
      password: dto.password,
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.usersService.create({
      email: dto.email,
      phone: dto.phone,
      fullName: dto.fullName,
      password: dto.password,
      roleKey: dto.roleKey ?? 'AGENT',
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto, @Ip() ip: string, @Req() req: Request) {
    return this.authService.refreshToken(
      dto.refreshToken,
      ip,
      req.headers['user-agent'],
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: AuthUser) {
    return this.authService.logout(user.id);
  }
}