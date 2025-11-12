import { Module } from '@nestjs/common';
import { OmsModule } from './oms/oms.module';
import { WmsModule } from './wms/wms.module';
import { InventoryModule } from './inventory/inventory.module';
import { PaymentModule } from './payment/payment.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    InventoryModule,
    WmsModule,
    OmsModule,
    PaymentModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
