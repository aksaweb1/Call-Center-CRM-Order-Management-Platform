import { CallOutcome } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, IsInt, Min } from 'class-validator';

export class InitiateCallDto {
  @IsUUID()
  leadId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  from?: string;
}

export class UpdateCallDto {
  @IsOptional()
  @IsEnum(CallOutcome)
  outcome?: CallOutcome;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSecs?: number;
}