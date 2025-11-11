import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { InventoryClient } from '../inventory/inventory.client';
import { WmsBus } from '../wms/wms.messaging';
import { v4 as uuid } from 'uuid';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private store = new Map<string, any>();

  constructor(private inv: InventoryClient, private wms: WmsBus) {}

  getStore() {
    return this.store;
  }

  async createOrder(dto: any) {
    const orderId = dto.orderId || `ORD-${Date.now()}`;
    const order = {
      ...dto,
      orderId,
      status: 'RECEIVED',
      timestamps: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    this.store.set(orderId, order);
    this.logger.log(`Order ${orderId} received`);

    let invRes;
    try {
      invRes = await this.inv.checkAndReserve(orderId, dto.items);
    } catch (err) {
      this.logger.error(`Inventory call failed: ${err?.message || err}`);
      order.status = 'FAILED';
      this.store.set(orderId, order);
      return order;
    }

    if (!invRes || invRes.status === 1) {
      order.status = 'OUT_OF_STOCK';
      this.store.set(orderId, order);
      this.logger.log(`Order ${orderId} out of stock`);
      return order;
    }
    if (invRes.status === 2) {
      order.status = 'FAILED';
      this.store.set(orderId, order);
      return order;
    }
    const reservationId = invRes.reservationId;
    order.status = 'RESERVED';
    order.reservationId = reservationId;
    this.store.set(orderId, order);

    const payUrl =
      process.env.PAYMENT_SERVICE_URL || 'http://payments:3001/api';
    let payRes: any;
    try {
      const resp = await axios.post(
        `${payUrl}/payments`,
        {
          orderId,
          amount: dto.totalAmount,
          currency: dto.currency || 'EUR',
          capture: dto.capture ?? true,
        },
        { timeout: 5000 },
      );
      payRes = resp.data;
    } catch (err) {
      this.logger.warn(
        `Payment call failed for ${orderId}: ${err?.message || err}`,
      );
      payRes = { status: 'DECLINED' };
    }

    if (!['CAPTURED', 'AUTHORIZED'].includes(String(payRes.status))) {
      this.logger.warn(
        `Payment failed for ${orderId}; releasing reservation ${reservationId}`,
      );
      try {
        await this.inv.releaseReservation(reservationId, orderId);
      } catch (err) {
        this.logger.error(
          `Release failed for ${reservationId}: ${err?.message || err}`,
        );
      }
      order.status = 'PAYMENT_DECLINED';
      this.store.set(orderId, order);

      const newOrderId = `${orderId}-R-${uuid().slice(0, 8)}`;
      const newOrderDto = { ...dto, orderId: newOrderId };
      const newOrder = await this.createOrder(newOrderDto);
      return { original: order, retry: newOrder };
    }

    order.payment = {
      paymentId: payRes.paymentId || `PAY-${Date.now()}`,
      status: payRes.status,
    };
    order.status = 'FULFILLMENT_QUEUED';
    order.timestamps.updatedAt = new Date().toISOString();
    this.store.set(orderId, order);

    await this.wms.publishFulfillmentCreated({
      orderId,
      reservationId,
      items: dto.items,
      shippingAddress: dto.shippingAddress,
      totalAmount: dto.totalAmount,
    });

    this.logger.log(`Order ${orderId} queued for fulfillment`);
    return order;
  }

  getOrder(orderId: string) {
    return this.store.get(orderId);
  }
}
