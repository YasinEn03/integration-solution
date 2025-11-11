import { Module } from '@nestjs/common';
import { InventoryClient } from './inventory.client.js';

@Module({
  providers: [InventoryClient],
  exports: [InventoryClient],
})
export class InventoryModule {}
