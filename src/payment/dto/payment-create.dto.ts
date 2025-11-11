import { IsNumber, Min } from 'class-validator';

export class PaymentCreateDto {
  @IsNumber()
  orderId!: number;

  @IsNumber()
  @Min(1)
  amount!: number;
}
