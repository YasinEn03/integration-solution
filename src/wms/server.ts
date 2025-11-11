import { NestFactory } from '@nestjs/core';
import { WmsModule } from './wms.module';
import { Transport, RmqOptions } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<RmqOptions>(WmsModule, {
    transport: Transport.RMQ,
    options: {
      urls: ['amqp://guest:guest@127.0.0.1:5672'],
      queue: 'wms_queue',
      queueOptions: {
        durable: false,
      },
    },
  });
  await app.listen();
}
bootstrap();
