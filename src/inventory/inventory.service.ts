import { Injectable, Logger } from '@nestjs/common';

interface LocalReservation {
  id: string;
  items: { sku: string; qty: number }[];
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
