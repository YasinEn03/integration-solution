import { IdempotencyInterceptor } from 'src/common/idempotency.interceptor';
import { PaymentsController } from './payment.controller';
import { PaymentService } from './payment.service';
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    CacheModule.register({
      ttl: 1800,
      max: 100,
    }),
  ],
  controllers: [PaymentsController],
  exports: [PaymentService, IdempotencyInterceptor],
  providers: [PaymentService, IdempotencyInterceptor],
})
export class PaymentModule {}
