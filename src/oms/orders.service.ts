import { Injectable, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import axios from 'axios';
import { v4 as uuid } from 'uuid';

export enum OrderState {
  RECEIVED = 'RECEIVED',
  RESERVED = 'RESERVED',
  CANCELLED = 'CANCELLED',
  PAID = 'PAID',
  FULFILLMENT_REQUESTED = 'FULFILLMENT_REQUESTED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
}

export interface Item {
  productId: number;
  quantity: number;
  unitPrice?: number;
}

export interface Order {
  id: string;
  items: Item[];
  state: OrderState;
  reservationId?: string;
  paymentId?: string;
  paymentStatus?: string;
  customer?: { firstName: string; lastName: string };
  timestamps: { created: string; updated: string };
}

export interface InventoryGrpcClient {
  reserveViaGrpc(
    orderId: string,
    items: { productId: number; quantity: number }[],
  ): Promise<{ code: number; reservationId?: string }>;
  releaseViaGrpc(
    reservationId: string,
    orderId?: string,
  ): Promise<{ released: boolean }>;
}

@Injectable()
export class OmsService {
  private orders = new Map<string, Order>();

  constructor(
    @Inject('WMS_CLIENT') private readonly wmsClient: ClientProxy,
    @Inject('LOG_CLIENT') private readonly logClient: ClientProxy,
    @Inject('INVENTORY_GRPC_CLIENT')
    private readonly inventoryClient: InventoryGrpcClient,
  ) {}

  private log(level: 'info' | 'warn' | 'error', msg: string) {
    this.logClient.emit('log_message', {
      service: 'OMS',
      level,
      message: msg,
      timestamp: new Date().toISOString(),
    });
  }

  async createOrder(body: {
    items: Item[];
    firstName: string;
    lastName: string;
  }): Promise<Order> {
    const orderId = uuid();
    const order: Order = {
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
    this.log('info', `Order ${orderId} empfangen.`);

    // --- Inventory via gRPC reservieren ---
    let reservationId: string;
    try {
      const grpcRes = await this.inventoryClient.reserveViaGrpc(
        orderId,
        body.items,
      );
      if (grpcRes.code !== 0 || !grpcRes.reservationId) {
        order.state = OrderState.CANCELLED;
        this.orders.set(orderId, order);
        this.log('warn', `Order ${orderId} abgelehnt: Out of stock`);
        throw new HttpException(
          'Inventory Reservation failed',
          HttpStatus.CONFLICT,
        );
      }
      reservationId = grpcRes.reservationId;
      order.reservationId = reservationId;
      order.state = OrderState.RESERVED;
      this.orders.set(orderId, order);
      this.log(
        'info',
        `Order ${orderId} reserviert (ReservationId=${reservationId})`,
      );
    } catch (err) {
      this.log('error', `Inventory Service unreachable für Order ${orderId}`);
      throw new HttpException(
        'Inventory Service unreachable',
        HttpStatus.BAD_GATEWAY,
      );
    }

    // --- Payment via HTTP prüfen ---
    try {
      const totalAmount = order.items.reduce(
        (acc, i) => acc + (i.unitPrice || 0) * i.quantity,
        0,
      );
      const payRes = await axios.post<{ success: boolean; reason?: string }>(
        `${
          process.env.PAYMENT_SERVICE_URL ||
          'http://localhost:3000/api/payments'
        }/authorize`,
        {
          orderId,
          items: order.items,
          firstName: body.firstName,
          lastName: body.lastName,
          amount: totalAmount,
        },
      );

      if (!payRes.data.success) {
        await this.inventoryClient.releaseViaGrpc(reservationId, orderId);
        order.state = OrderState.PAYMENT_FAILED;
        this.orders.set(orderId, order);
        this.log(
          'warn',
          `Payment fehlgeschlagen für Order ${orderId}: ${payRes.data.reason}`,
        );
        throw new HttpException('Payment failed', HttpStatus.PAYMENT_REQUIRED);
      }

      order.paymentId = uuid();
      order.paymentStatus = 'AUTHORIZED';
      order.state = OrderState.PAID;
      order.timestamps.updated = new Date().toISOString();
      this.orders.set(orderId, order);
      this.log('info', `Payment erfolgreich für Order ${orderId}`);
    } catch (err) {
      await this.inventoryClient.releaseViaGrpc(reservationId, orderId);
      order.state = OrderState.CANCELLED;
      this.orders.set(orderId, order);
      this.log('error', `Payment Service unreachable für Order ${orderId}`);
      throw new HttpException(
        'Payment Service unreachable',
        HttpStatus.BAD_GATEWAY,
      );
    }

    // --- WMS benachrichtigen ---
    this.wmsClient.emit('order_received', {
      orderId,
      items: order.items,
      customer: body,
      reservationId,
    });
    order.state = OrderState.FULFILLMENT_REQUESTED;
    this.orders.set(orderId, order);
    this.log('info', `Order ${orderId} an WMS gesendet`);

    return order;
  }

  getOrder(id: string): Order {
    const order = this.orders.get(id);
    if (!order) {
      this.log('warn', `Order ${id} nicht gefunden`);
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }
    return order;
  }

  getAllOrders(): Map<string, Order> {
    return this.orders;
  }
}
