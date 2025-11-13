import { Module } from '@nestjs/common';
import { LocalInventoryService } from './inventory.service';
import { InventoryApiController } from './inventory.controller';

@Module({
  controllers: [InventoryApiController],
  exports: [LocalInventoryService],
  providers: [LocalInventoryService],
})
export class InventoryModule {}
