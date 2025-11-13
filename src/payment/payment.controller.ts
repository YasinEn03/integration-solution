import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Controller('payments')
@UseInterceptors(IdempotencyInterceptor)
export class PaymentsController {
  constructor(private readonly paymentSvc: PaymentService) {}

  @HttpCode(HttpStatus.CREATED)
  @Post()
  async authorize(@Body() body: any) {
    try {
      const result = this.paymentSvc.authorizePayment(body);
      return result;
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException(err.message || 'Payment failed');
    }
  }

  @Get(':paymentId')
  async getOne(@Param('paymentId') paymentId: string) {
    return { paymentId, status: 'Demo only' };
  }
}
