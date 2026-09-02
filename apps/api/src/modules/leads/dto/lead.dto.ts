import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { LeadStatus } from '@prisma/client';

export enum CreateLeadStatus {
  NEW = 'NEW',
  ASSIGNED = 'ASSIGNED',
  CALLING = 'CALLING',
}

export class CreateLeadDto {
  @IsOptional()
  @IsString()
  customerName?: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  alternatePhone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  sourceCode?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsString()
  @Length(1, 300)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  agentId?: string;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsString()
  sourceCode?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  agentId?: string;
}

export class AssignLeadDto {
  @IsUUID()
  agentId!: string;
}

export class AssignManyLeadsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  leadIds!: string[];

  @IsUUID()
  agentId!: string;
}

export class BulkLeadStatusDto {
  @IsArray()
  @IsUUID('4', { each: true })
  leadIds!: string[];

  @IsEnum(LeadStatus)
  status!: LeadStatus;
}

export class BulkImportLeadDto {
  @IsArray()
  items!: Array<{
    customerName: string;
    phone: string;
    email?: string;
    sourceCode?: string;
    priority?: string;
    tags?: string[];
  }>;
}