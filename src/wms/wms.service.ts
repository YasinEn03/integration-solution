import { Injectable } from '@nestjs/common';

@Injectable()
export class OrdersStatusUpdater {
  private store = new Map<string, any>();

  attachStore(store: Map<string, any>) {
    this.store = store;
  }

  async apply(evt: any) {
    const o = this.store.get(evt.orderId);
    if (!o) return;
    const map: Record<string, string> = {
      ITEMS_PICKED: 'PICKED',
      ORDER_PACKED: 'PACKED',
      ORDER_SHIPPED: 'SHIPPED',
    };
    o.status = map[evt.eventType] ?? o.status;
    o.timestamps = {
      ...(o.timestamps || {}),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(evt.orderId, o);
  }
}
