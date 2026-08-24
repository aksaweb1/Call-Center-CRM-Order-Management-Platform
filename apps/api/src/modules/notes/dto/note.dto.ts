import { IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @Length(1, 2000)
  body!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  body?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}