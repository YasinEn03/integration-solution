import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  HttpCode,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { OrderCreateDTO } from '../oms/dto/order-create.dto';

@Controller('payments')
@UseInterceptors(IdempotencyInterceptor)
export class PaymentsController {
  constructor(private readonly paymentSvc: PaymentService) {}

  @HttpCode(HttpStatus.CREATED)
  @Post()
  async authorize(@Body() body: OrderCreateDTO) {
    return this.paymentSvc.authorizePayment(body);
  }

  @Get(':paymentId')
  async getOne(@Param('paymentId') paymentId: string) {
    return { paymentId, status: 'Demo only' };
  }
}
