import { IsNumber, IsString, Min } from 'class-validator';

export enum OrderStatus {
  RECEIVED = 'RECEIVED',
  RESERVED = 'RESERVED',
  PAID = 'PAID',
  FULFILLMENT_REQUESTED = 'FULFILLMENT_REQUESTED',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
}

class ItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  price!: number;
}

export class OrderDto {
  id!: string;
  items!: ItemDto[] | ItemDto;
  status!: OrderStatus;
  reason?: string;
}
