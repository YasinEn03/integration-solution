import { Module } from '@nestjs/common';
import { OmsModule } from './oms/oms.module';
import { WmsModule } from './wms/wms.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [InventoryModule, WmsModule, OmsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
