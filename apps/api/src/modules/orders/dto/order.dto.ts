import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemInput {
  @IsUUID()
  productId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items!: OrderItemInput[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCharges?: number;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  billingAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
    phone?: string;
  };

  @IsOptional()
  shippingAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
    phone?: string;
  };
}

export class UpdateOrderStatusDto {
  @IsEnum(['PENDING', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'RETURNED', 'CANCELLED', 'REFUNDED'])
  status!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class RecordPaymentDto {
  @IsUUID()
  @IsOptional()
  orderId?: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(['CASH', 'UPI', 'CARD', 'NET_BANKING', 'COD'])
  method!: 'CASH' | 'UPI' | 'CARD' | 'NET_BANKING' | 'COD';

  @IsOptional()
  @IsString()
  transactionId?: string;
}

export class CreateShipmentDto {
  @IsOptional()
  @IsString()
  courierName?: string;

  @IsOptional()
  @IsString()
  trackingId?: string;

  @IsOptional()
  shipmentAddress?: {
    line1: string;
    city: string;
    state: string;
    pincode: string;
  };
}

export class UpdateShipmentStatusDto {
  @IsEnum(['PENDING', 'PICKED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY', 'RETURNED'])
  status!: string;

  @IsOptional()
  @IsString()
  trackingId?: string;
}