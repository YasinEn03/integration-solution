import { Module, OnModuleInit } from '@nestjs/common';
import { WmsBus } from './wms.messaging';
import { OrdersStatusUpdater } from './wms.service';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'WMS_STATUS_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://guest:guest@127.0.0.1:5672'],
          queue: 'status_updates_queue',
          queueOptions: {
            durable: false,
          },
        },
      },
    ]),
  ],
  providers: [WmsBus, OrdersStatusUpdater],
  exports: [WmsBus, OrdersStatusUpdater],
})
export class WmsModule {}
