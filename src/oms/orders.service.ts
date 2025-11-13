import { Injectable, HttpException, HttpStatus, Inject } from '@nestjs/common';
import axios from 'axios';
import { v4 as uuid } from 'uuid';
import { WmsBus } from '../wms/wms.messaging';
import { ClientProxy } from '@nestjs/microservices';

export enum OrderState {
  RECEIVED = 'RECEIVED',
  RESERVED = 'RESERVED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAID = 'PAID',
  FULFILLMENT_REQUESTED = 'FULFILLMENT_REQUESTED',
  CANCELLED = 'CANCELLED',
}

export interface OrderItem {
  productId: number;
  quantity: number;
  pricePerUnit?: number;
}

export interface OrderRecord {
  id: string;
  items: OrderItem[];
  state: OrderState;
  reservationId?: string;
  paymentId?: string;
  customer: { firstName: string; lastName: string };
  timestamps: { created: string; updated: string };
}

@Injectable()
export class OmsService {
  private orders = new Map<string, OrderRecord>();

  constructor(
    @Inject('WMS_CLIENT') private readonly wms: ClientProxy,
    private readonly wmsBus: WmsBus,    // ← Logger!
    @Inject('INVENTORY_SERVICE_URL') private readonly inventoryUrl: string,
    @Inject('PAYMENT_SERVICE_URL') private readonly paymentUrl: string,
  ) {}

  private mapToSku(items: OrderItem[]): { sku: string; qty: number }[] {
    return items.map((i) => ({ sku: `SKU-${i.productId}`, qty: i.quantity }));
  }

  async createOrder(body: {
    items: OrderItem[];
    firstName: string;
    lastName: string;
  }): Promise<OrderRecord> {
    const orderId = uuid();
    const order: OrderRecord = {
      id: orderId,
      items: body.items,
      state: OrderState.RECEIVED,
      customer: { firstName: body.firstName, lastName: body.lastName },
      timestamps: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    };
    this.orders.set(orderId, order);

    await this.wmsBus.log('oms', 'info', `Order ${orderId} empfangen`, { orderId });

    // ---------------------------
    // 1️⃣ Inventory reservieren
    // ---------------------------
    const itemsForInventory = this.mapToSku(body.items);
    let reservationId: string;

    try {
      const res = await axios.post<{
        ok: boolean;
        reservationId?: string;
        reason?: string;
      }>(`${this.inventoryUrl}/inventory/reserve`, {
        orderId,
        items: itemsForInventory,
      });

      if (!res.data.ok || !res.data.reservationId) {
        order.state = OrderState.CANCELLED;
        this.orders.set(orderId, order);

        await this.wmsBus.log(
          'oms',
          'warn',
          `Order ${orderId} abgelehnt: ${res.data.reason || 'OUT_OF_STOCK'}`,
          { orderId }
        );

        throw new HttpException('Inventory Reservation failed', HttpStatus.CONFLICT);
      }

      reservationId = res.data.reservationId;
      order.reservationId = reservationId;
      order.state = OrderState.RESERVED;
      this.orders.set(orderId, order);

      await this.wmsBus.log(
        'oms',
        'info',
        `Order ${orderId} reserviert (reservationId=${reservationId})`,
        { orderId, reservationId }
      );

    } catch (err) {
      await this.wmsBus.log(
        'oms',
        'error',
        `Inventory-Service nicht erreichbar für Order ${orderId}`,
        { orderId }
      );

      throw new HttpException('Inventory Service unreachable', HttpStatus.BAD_GATEWAY);
    }

    // ---------------------------
    // 2️⃣ Payment autorisieren
    // ---------------------------
    try {
      const total = order.items.reduce(
        (sum, i) => sum + (i.pricePerUnit || 0) * i.quantity,
        0,
      );

      const payRes = await axios.post<{ success: boolean; reason?: string }>(
        `${this.paymentUrl}`,
        {
          orderId,
          items: order.items,
          firstName: body.firstName,
          lastName: body.lastName,
          amount: total,
        },
      );

      if (!payRes.data.success) {
        await axios.post(`${this.inventoryUrl}/inventory/release`, {
          reservationId,
        });

        order.state = OrderState.PAYMENT_FAILED;
        this.orders.set(orderId, order);

        await this.wmsBus.log(
          'oms',
          'warn',
          `Payment fehlgeschlagen für Order ${orderId}: ${payRes.data.reason}`,
          { orderId }
        );

        throw new HttpException('Payment failed', HttpStatus.PAYMENT_REQUIRED);
      }

      order.paymentId = uuid();
      order.state = OrderState.PAID;
      order.timestamps.updated = new Date().toISOString();
      this.orders.set(orderId, order);

      await this.wmsBus.log('oms', 'info', `Payment erfolgreich für Order ${orderId}`, {
        orderId,
      });

    } catch (err) {
      await axios.post(`${this.inventoryUrl}/inventory/release`, { reservationId });

      order.state = OrderState.CANCELLED;
      this.orders.set(orderId, order);

      await this.wmsBus.log(
        'oms',
        'error',
        `Payment-Service nicht erreichbar für Order ${orderId}`,
        { orderId }
      );

      throw new HttpException('Payment Service unreachable', HttpStatus.BAD_GATEWAY);
    }

    // ---------------------------
    // 3️⃣ WMS benachrichtigen
    // ---------------------------
    this.wms.emit('order_received', {
      orderId,
      items: order.items,
      customer: body,
      reservationId,
    });

    order.state = OrderState.FULFILLMENT_REQUESTED;
    this.orders.set(orderId, order);

    await this.wmsBus.log('oms', 'info', `Order ${orderId} an WMS gesendet`, {
      orderId,
      reservationId,
    });

    return order;
  }

  getOrder(id: string): OrderRecord {
    const order = this.orders.get(id);

    if (!order) {
      this.wmsBus.log('oms', 'warn', `Order ${id} nicht gefunden`, { id });
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }

    return order;
  }

  getAllOrders(): Map<string, OrderRecord> {
    return this.orders;
  }
}
