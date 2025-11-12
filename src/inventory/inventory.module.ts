import { Module } from '@nestjs/common';
import {
  InventoryGrpcClient,
  LocalInventoryService,
  InventoryApiController,
} from './inventory.client';

@Module({
  providers: [
    LocalInventoryService,
    {
      provide: 'INVENTORY_GRPC_CLIENT', // <-- Token für DI
      useClass: InventoryGrpcClient,
    },
  ],
  controllers: [InventoryApiController],
  exports: ['INVENTORY_GRPC_CLIENT'], // <-- damit OmsModule es importieren kann
})
export class InventoryModule {}
