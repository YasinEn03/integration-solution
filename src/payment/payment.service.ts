import { Injectable, BadRequestException, Logger } from '@nestjs/common';

export interface PaymentResult {
  orderId: string;
  success: boolean;
  totalAmount: number;
  accountBalance: number;
  reason?: string;
  lineItems: Array<{
    productId: string; // jetzt SKU-Form
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  private catalog = { 'SKU-123': 7, 'SKU-456': 60, 'SKU-789': 9.77 };
  private accounts = {
    'amed diyarbakir': 200,
    'mock mock': 4.2,
    'test test': 100,
  };

  authorizePayment(order: any): PaymentResult {
    const customerKey = `${order.firstName.toLowerCase()} ${order.lastName.toLowerCase()}`;
    const balance = this.accounts[customerKey];

    this.logger.log(`Authorizing payment for order ${order.orderId}`);

    if (balance === undefined) {
      this.logger.warn(`Unknown customer: ${customerKey}`);
      throw new BadRequestException(`Unknown customer: ${customerKey}`);
    }

    const lineItems = order.items.map((item) => {
      const sku = `SKU-${item.productId}`;
      const unitPrice = this.catalog[sku];
      if (unitPrice === undefined) {
        this.logger.warn(`Unknown product: ${sku}`);
        throw new BadRequestException(`Unknown product: ${sku}`);
      }

      const lineTotal = +(unitPrice * item.quantity).toFixed(2);
      return {
        productId: sku, // jetzt SKU
        unitPrice,
        quantity: item.quantity,
        lineTotal,
      };
    });

    const totalAmount = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
    const success = balance >= totalAmount;

    if (!success) {
      this.logger.warn(
        `Insufficient funds for customer ${customerKey}: balance ${balance}, total ${totalAmount}`,
      );
      throw new BadRequestException('INSUFFICIENT_FUNDS');
    }

    return {
      orderId: order.orderId,
      success,
      totalAmount,
      accountBalance: balance,
      lineItems,
    };
  }
}
