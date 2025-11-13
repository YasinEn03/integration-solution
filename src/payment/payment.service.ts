import { Injectable, BadRequestException, Logger, Inject } from '@nestjs/common';
import { WmsBus } from '../wms/wms.messaging';   // ← Pfad anpassen

export interface PaymentResult {
  orderId: string;
  success: boolean;
  totalAmount: number;
  accountBalance: number;
  reason?: string;
  lineItems: Array<{
    productId: string;
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

  constructor(private readonly wmsBus: WmsBus) {}

  authorizePayment(order: any): PaymentResult {
    const customerKey = `${order.firstName.toLowerCase()} ${order.lastName.toLowerCase()}`;
    const balance = this.accounts[customerKey];

    // Lokale Log-Ausgabe
    this.logger.log(`Authorizing payment for order ${order.orderId}`);

    // RabbitMQ Log
    this.wmsBus.log('payment', 'info', 'Authorizing payment', {
      orderId: order.orderId,
      customerKey,
    });

    if (balance === undefined) {
      this.logger.warn(`Unknown customer: ${customerKey}`);

      this.wmsBus.log('payment', 'warn', 'Unknown customer', {
        customerKey,
        orderId: order.orderId,
      });

      throw new BadRequestException(`Unknown customer: ${customerKey}`);
    }

    const lineItems = order.items.map((item) => {
      const sku = `SKU-${item.productId}`;
      const unitPrice = this.catalog[sku];

      if (unitPrice === undefined) {
        this.logger.warn(`Unknown product: ${sku}`);

        this.wmsBus.log('payment', 'warn', 'Unknown product', {
          sku,
          orderId: order.orderId,
        });

        throw new BadRequestException(`Unknown product: ${sku}`);
      }

      const lineTotal = +(unitPrice * item.quantity).toFixed(2);

      return {
        productId: sku,
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

      this.wmsBus.log('payment', 'warn', 'Insufficient funds', {
        customerKey,
        balance,
        totalAmount,
        orderId: order.orderId,
      });

      throw new BadRequestException('INSUFFICIENT_FUNDS');
    }

    this.wmsBus.log('payment', 'info', 'Payment authorized', {
      orderId: order.orderId,
      totalAmount,
    });

    return {
      orderId: order.orderId,
      success,
      totalAmount,
      accountBalance: balance,
      lineItems,
    };
  }
}
