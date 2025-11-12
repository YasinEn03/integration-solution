import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { Controller, Post, Body } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { join } from 'path';

interface GRPCInventoryClient {
  ReserveStock(data: {
    orderId: string;
    items: { productId: string; quantity: number }[];
  }): {
    toPromise(): Promise<{
      code: number;
      reservationId?: string;
      message?: string;
    }>;
  };

  ReleaseStock(data: { reservationId: string; orderId?: string }): {
    toPromise(): Promise<{ released: boolean; message?: string }>;
  };
}

interface LocalReservation {
  id: string;
  items: { sku: string; qty: number }[];
}

@Injectable()
export class InventoryGrpcClient implements OnModuleInit {
  private svc!: GRPCInventoryClient;

  constructor(
    @Inject('INVENTORY_GRPC_CLIENT') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.svc = this.client.getService<GRPCInventoryClient>('InventoryService');
  }

  async reserveViaGrpc(
    orderId: string,
    items: { productId: string; quantity: number }[],
  ) {
    return this.svc.ReserveStock({ orderId, items }).toPromise();
  }

  async releaseViaGrpc(reservationId: string, orderId?: string) {
    return this.svc.ReleaseStock({ reservationId, orderId }).toPromise();
  }
}

@Injectable()
export class LocalInventoryService {
  private readonly logger = new Logger(LocalInventoryService.name);

  private stock = new Map<string, number>([
    ['SKU-123', 20],
    ['SKU-456', 15],
    ['SKU-789', 8],
  ]);

  private reservations = new Map<string, LocalReservation>();

  reserve(items: { sku: string; qty: number }[]): string | null {
    for (const it of items) {
      if ((this.stock.get(it.sku) ?? 0) < it.qty) {
        this.logger.warn(`Nicht genug Bestand für ${it.sku}`);
        return null;
      }
    }
    const resId = `res-${Date.now()}`;
    items.forEach((it) =>
      this.stock.set(it.sku, (this.stock.get(it.sku) ?? 0) - it.qty),
    );
    this.reservations.set(resId, { id: resId, items });
    this.logger.log(`Reservierung erfolgreich: ${resId}`);
    return resId;
  }

  commit(reservationId: string): boolean {
    const res = this.reservations.get(reservationId);
    if (!res) {
      this.logger.warn(
        `Commit fehlgeschlagen: ${reservationId} nicht gefunden`,
      );
      return false;
    }
    this.reservations.delete(reservationId);
    this.logger.log(`Reservation ${reservationId} committed`);
    return true;
  }

  release(reservationId: string): boolean {
    const res = this.reservations.get(reservationId);
    if (!res) {
      this.logger.warn(
        `Release fehlgeschlagen: ${reservationId} nicht gefunden`,
      );
      return false;
    }
    res.items.forEach((it) =>
      this.stock.set(it.sku, (this.stock.get(it.sku) ?? 0) + it.qty),
    );
    this.reservations.delete(reservationId);
    this.logger.log(`Reservation ${reservationId} freigegeben`);
    return true;
  }

  getStock(sku: string): number {
    return this.stock.get(sku) ?? 0;
  }
}

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
