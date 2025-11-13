import { Controller, Post, Body, Logger } from '@nestjs/common';
import { LocalInventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryApiController {
  private readonly logger = new Logger(InventoryApiController.name);

  constructor(private readonly inventory: LocalInventoryService) {}

  @Post('reserve')
  async reserve(
    @Body() body: { orderId: number; items: { sku: string; qty: number }[] },
  ) {
    this.logger.log(`Reservierung für Order ${body.orderId}`);
    const resId = this.inventory.reserve(body.items);
    return resId
      ? { ok: true, reservationId: resId }
      : { ok: false, reason: 'OUT_OF_STOCK' };
  }

  @Post('commit')
  async commit(@Body() body: { reservationId: string }) {
    this.logger.log(`Commit Reservation ${body.reservationId}`);
    const ok = this.inventory.commit(body.reservationId);
    return { ok };
  }

  @Post('release')
  async release(@Body() body: { reservationId: string }) {
    this.logger.warn(`Release Reservation ${body.reservationId}`);
    const ok = this.inventory.release(body.reservationId);
    return { ok };
  }
}
