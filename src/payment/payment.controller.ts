import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { PaymentsService } from './payment.service';
import { PaymentCreateDto } from './dto/payment-create.dto';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Controller('payments')
@UseInterceptors(IdempotencyInterceptor)
export class PaymentsController {
  constructor(private svc: PaymentsService) {}

  @Post()
  create(@Body() dto: PaymentCreateDto) {
    return this.svc.create(dto);
  }

  @Get(':paymentId')
  get(@Param('paymentId') id: string) {
    return this.svc.get(id);
  }

  @Post(':paymentId/capture')
  capture(@Param('paymentId') id: string) {
    return this.svc.capture(id);
  }

  @Post(':paymentId/refund')
  refund(@Param('paymentId') id: string, @Body() body: { amount?: number }) {
    return this.svc.refund(id, body?.amount);
  }
}
