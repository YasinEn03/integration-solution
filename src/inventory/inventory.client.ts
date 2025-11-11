import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client, Transport } from '@nestjs/microservices';
import type { ClientGrpc } from '@nestjs/microservices';
import { join } from 'path';

interface InventoryServiceClient {
  CheckAndReserve(data: {
    orderId: string;
    items: { productId: string; quantity: number }[];
  }): {
    toPromise(): Promise<{
      status: number;
      reservationId?: string;
      message?: string;
    }>;
  };

  ReleaseReservation(data: { reservationId: string; orderId?: string }): {
    toPromise(): Promise<{ released: boolean; message?: string }>;
  };
}

@Injectable()
export class InventoryClient implements OnModuleInit {
  private static readonly DEFAULT_PROTO = join(
    process.cwd(),
    'proto',
    'inventory.proto',
  );
  private static readonly PROTO_PATH =
    process.env.INVENTORY_PROTO_PATH || InventoryClient.DEFAULT_PROTO;

  @Client({
    transport: Transport.GRPC,
    options: {
      url: process.env.INVENTORY_GRPC_URL || 'inventory:50051',
      package: 'inventory',
      protoPath: InventoryClient.PROTO_PATH,
    },
  })
  private client!: ClientGrpc;

  private svc!: InventoryServiceClient;

  onModuleInit() {
    if (!this.client || typeof (this.client as any).getService !== 'function') {
      throw new Error(
        'gRPC client not initialized correctly. Ensure proto file exists and @grpc packages are installed.',
      );
    }
    this.svc =
      this.client.getService<InventoryServiceClient>('InventoryService');
  }

  async checkAndReserve(
    orderId: string,
    items: { productId: string; quantity: number }[],
  ) {
    return this.svc.CheckAndReserve({ orderId, items }).toPromise();
  }

  async releaseReservation(reservationId: string, orderId?: string) {
    return this.svc.ReleaseReservation({ reservationId, orderId }).toPromise();
  }
}
