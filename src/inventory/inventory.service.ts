import { Injectable, Logger } from '@nestjs/common';
import { WmsBus } from '../wms/wms.messaging';   // ← Pfad ggf. anpassen

interface LocalReservation {
  id: string;
  items: { sku: string; qty: number }[];
}

@Injectable()
export class LocalInventoryService {
  private readonly logger = new Logger(LocalInventoryService.name);

  private stock = new Map<string, number>([
    ['SKU-1903', 20],
    ['SKU-1905', 15],
    ['SKU-1967', 8],
  ]);

  private reservations = new Map<string, LocalReservation>();

  constructor(private readonly wmsBus: WmsBus) {}   // ← Logger!

  reserve(items: { sku: string; qty: number }[]): string | null {
    for (const it of items) {
      if ((this.stock.get(it.sku) ?? 0) < it.qty) {

        this.logger.warn(`Nicht genug Bestand für ${it.sku}`);

        this.wmsBus.log('inventory', 'warn', 'Nicht genug Bestand', {
          sku: it.sku,
          requested: it.qty,
          available: this.stock.get(it.sku) ?? 0,
        });

        return null;
      }
    }

    const resId = `res-${Date.now()}`;

    items.forEach((it) => {
      this.stock.set(it.sku, (this.stock.get(it.sku) ?? 0) - it.qty);
    });

    this.reservations.set(resId, { id: resId, items });

    this.logger.log(`Reservierung erfolgreich: ${resId}`);
    this.wmsBus.log('inventory', 'info', 'Reservierung erfolgreich', {
      reservationId: resId,
      items,
    });

    return resId;
  }

  commit(reservationId: string): boolean {
    const res = this.reservations.get(reservationId);

    if (!res) {
      this.logger.warn(`Commit fehlgeschlagen: ${reservationId} nicht gefunden`);

      this.wmsBus.log('inventory', 'warn', 'Commit fehlgeschlagen', {
        reservationId,
      });

      return false;
    }

    this.reservations.delete(reservationId);

    this.logger.log(`Reservation ${reservationId} committed`);
    this.wmsBus.log('inventory', 'info', 'Reservation committed', {
      reservationId,
    });

    return true;
  }

  release(reservationId: string): boolean {
    const res = this.reservations.get(reservationId);

    if (!res) {
      this.logger.warn(`Release fehlgeschlagen: ${reservationId} nicht gefunden`);

      this.wmsBus.log('inventory', 'warn', 'Release fehlgeschlagen', {
        reservationId,
      });

      return false;
    }

    res.items.forEach((it) => {
      this.stock.set(it.sku, (this.stock.get(it.sku) ?? 0) + it.qty);
    });

    this.reservations.delete(reservationId);

    this.logger.log(`Reservation ${reservationId} freigegeben`);
    this.wmsBus.log('inventory', 'info', 'Reservation freigegeben', {
      reservationId,
      items: res.items,
    });

    return true;
  }

  getStock(sku: string): number {
    const qty = this.stock.get(sku) ?? 0;

    this.wmsBus.log('inventory', 'info', 'Stock abgefragt', {
      sku,
      qty,
    });

    return qty;
  }
}
