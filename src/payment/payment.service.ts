import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './payment.entity';
import { PaymentCreateDto } from './dto/payment-create.dto';

@Injectable()
export class PaymentsService {
  constructor(@InjectRepository(Payment) private repo: Repository<Payment>) {}

  async create(dto: PaymentCreateDto) {
    const p = this.repo.create({
      ...dto,
      status: 'PENDING',
      updatedAt: new Date(),
    });
    await this.repo.save(p);
    p.status = dto.capture ?? true ? 'CAPTURED' : 'AUTHORIZED';
    p.capturedAmount = dto.capture ?? true ? dto.amount : 0;
    return this.repo.save(p);
  }
  async get(id: string) {
    const p = await this.repo.findOne({ where: { paymentId: id } });
    if (!p) throw new NotFoundException('Payment not found');
    return p;
  }
  async capture(id: string) {
    const p = await this.get(id);
    if (!['AUTHORIZED'].includes(p.status))
      throw new ConflictException('Wrong status');
    p.status = 'CAPTURED';
    p.capturedAmount = p.amount;
    return this.repo.save(p);
  }
  async refund(id: string, amount?: number) {
    const p = await this.get(id);
    if (!['CAPTURED'].includes(p.status))
      throw new ConflictException('Refund only after capture');
    p.refundedAmount = amount ?? p.capturedAmount;
    p.status = 'REFUNDED';
    return this.repo.save(p);
  }
}
