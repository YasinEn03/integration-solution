import { NestFactory } from '@nestjs/core';
import { PaymentModule } from './payment.module';
import {
  ValidationPipe,
  Injectable,
  NestMiddleware,
  RequestMethod,
} from '@nestjs/common';
import * as express from 'express';
import { v4 as uuid } from 'uuid';
import { ProblemDetailsFilter } from '../common/problem-details.filter';

@Injectable()
class CorrelationIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    req.correlationId = req.headers['x-correlation-id'] || uuid();
    res.setHeader('X-Correlation-Id', req.correlationId);
    next();
  }
}

async function bootstrapPayment() {
  const app = await NestFactory.create(PaymentModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const PAYMENT_PORT = parseInt(process.env.PAYMENT_PORT || '3001', 10);
  await app.listen(PAYMENT_PORT);
  console.log(
    `✅ Payment HTTP API running on http://localhost:${PAYMENT_PORT}`,
  );
}

bootstrapPayment().catch((err) => {
  console.error('Payment bootstrap failed:', err?.stack || err);
  process.exit(1);
});
