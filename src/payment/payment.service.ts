// apps/payment/payment.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { ItemDto, OrderCreateDTO } from '../oms/dto/order-create.dto';

export interface PaymentResult {
  orderId: number;
  success: boolean;
  totalAmount: number;
  accountBalance: number;
  reason?: string;
  lineItems: Array<{
    productId: number;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
}

@Injectable()
export class PaymentService {
  private catalog = { 101: 7, 102: 60, 103: 9.77 };
  private accounts = {
    'amed diyarbakir': 200,
    'mock mock': 4.2,
    'nicht existierend': 200,
  };

  authorizePayment(order: OrderCreateDTO): PaymentResult {
    const key = `${order.firstName.toLowerCase()} ${order.lastName.toLowerCase()}`;
    const balance = this.accounts[key];
    if (balance === undefined)
      throw new BadRequestException('Unknown customer');

    const lineItems = order.items.map((item) => {
      const unitPrice = this.catalog[item.productId];
      if (!unitPrice)
        throw new BadRequestException(`Unknown product ${item.productId}`);
      return {
        ...item,
        unitPrice,
        lineTotal: +(unitPrice * item.quantity).toFixed(2),
      };
    });

    const totalAmount = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
    return {
      orderId: order.orderId,
      success: balance >= totalAmount,
      totalAmount,
      accountBalance: balance,
      reason: balance >= totalAmount ? undefined : 'INSUFFICIENT_FUNDS',
      lineItems,
    };
  }
}
