import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OmsService } from './orders.service';
import { Transport, ClientsModule } from '@nestjs/microservices';
import { WmsModule } from 'src/wms/wms.module';
import { InventoryModule } from 'src/inventory/inventory.module';
import { PaymentModule } from 'src/payment/payment.module';

@Module({
  imports: [
    WmsModule,
    InventoryModule, // <-- InventoryModule importiert
    PaymentModule,
    ClientsModule.register([
      {
        name: 'WMS_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.AMQP_URL || 'amqp://guest:guest@127.0.0.1:5672'],
          queue: 'wms_queue',
          queueOptions: { durable: false },
        },
      },
      {
        name: 'LOG_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.AMQP_URL || 'amqp://guest:guest@127.0.0.1:5672'],
          queue: 'log_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OmsService],
})
export class OmsModule {}
