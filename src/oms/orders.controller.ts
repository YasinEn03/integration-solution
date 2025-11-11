import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InventoryClient } from '../inventory/inventory.client';
import { WmsBus } from '../wms/wms.messaging';
import axios from 'axios';

type PaymentStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'DECLINED'
  | 'REFUNDED';

interface PaymentDTO {
  paymentId?: string;
  status: PaymentStatus;
}

@Controller('orders')
export class OrdersController {
  private store = new Map<string, any>();
  constructor(private inv: InventoryClient, private wms: WmsBus) {}

  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(@Body() dto: any) {
    const order = {
      ...dto,
      status: 'RECEIVED',
      timestamps: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    this.store.set(dto.orderId, order);

    const invRes = await this.inv.checkAndReserve(
      dto.orderId,
      dto.items.map((i: any) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
    );
    if (invRes.status === 1) {
      order.status = 'OUT_OF_STOCK';
      return order;
    }
    if (invRes.status === 2) {
      order.status = 'FAILED';
      return order;
    }
    const reservationId = invRes.reservationId;

    const payUrl =
      process.env.PAYMENT_SERVICE_URL || 'http://localhost:3001/api';
    let pay: PaymentDTO;
    try {
      const resp = await axios.post<PaymentDTO>(`${payUrl}/payments`, {
        orderId: dto.orderId,
        amount: dto.totalAmount,
        currency: 'EUR',
        capture: true,
      });
      pay = resp.data;
    } catch {
      pay = { status: 'DECLINED' };
    }

    if (pay.status !== 'CAPTURED' && pay.status !== 'AUTHORIZED') {
      order.status = 'PAYMENT_DECLINED';
      return order;
    }

    order.status = 'FULFILLMENT_QUEUED';
    order.payment = {
      paymentId: pay.paymentId ?? null,
      status: pay.status,
    };

    await this.wms.publishFulfillmentCreated({
      orderId: dto.orderId,
      reservationId,
      items: dto.items,
      shippingAddress: dto.shippingAddress,
      totalAmount: dto.totalAmount,
    });

    order.timestamps.updatedAt = new Date().toISOString();
    this.store.set(dto.orderId, order);
    return order;
  }

  @Get(':orderId')
  getOne(@Param('orderId') id: string) {
    return this.store.get(id) ?? { message: 'not found' };
  }

  attachStore(map: Map<string, any>) {
    this.store = map;
  }
}
