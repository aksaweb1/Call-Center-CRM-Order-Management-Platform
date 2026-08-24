import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateFollowUpDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsString()
  scheduledFor!: string; // ISO datetime

  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reminders?: string[];
}

export class UpdateFollowUpDto {
  @IsOptional()
  @IsString()
  scheduledFor?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDone?: boolean;
}