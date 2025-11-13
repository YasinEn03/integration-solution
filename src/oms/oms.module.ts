import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OmsService } from './orders.service';
import { Transport, ClientsModule } from '@nestjs/microservices';
import { WmsModule } from 'src/wms/wms.module';
import { PaymentModule } from 'src/payment/payment.module';

@Module({
  imports: [
    WmsModule,
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
  providers: [
    OmsService,
    {
      provide: 'INVENTORY_SERVICE_URL',
      useValue: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3002',
    },
    {
      provide: 'PAYMENT_SERVICE_URL',
      useValue: 'http://localhost:3001/payments',
    },
  ],
})
export class OmsModule {}
