import { Module } from '@nestjs/common';
import { LocalInventoryService } from './inventory.service';
import { InventoryApiController } from './inventory.controller';
import { WmsModule } from 'src/wms/wms.module';

@Module({
  imports: [WmsModule], 
  controllers: [InventoryApiController],
  exports: [LocalInventoryService],
  providers: [LocalInventoryService],
})
export class InventoryModule {}
