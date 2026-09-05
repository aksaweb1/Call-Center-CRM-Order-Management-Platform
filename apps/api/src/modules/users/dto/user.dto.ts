import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { CallDevice } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(4, 20)
  phone!: string;

  @IsString()
  @Length(1, 120)
  fullName!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsString()
  roleKey!: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsEnum(CallDevice)
  callDevice?: CallDevice;

  @IsOptional()
  @IsString()
  telephonyAccountId?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(4, 20)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(3, 120)
  fullName?: string;

  @IsOptional()
  @IsString()
  roleKey?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(CallDevice)
  callDevice?: CallDevice;

  @IsOptional()
  @IsString()
  telephonyAccountId?: string;

  @IsOptional()
  @IsString()
  @Length(8, 128)
  password?: string;
}

export class SetUserPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  granted!: string[];

  @IsArray()
  @IsString({ each: true })
  revoked!: string[];
}