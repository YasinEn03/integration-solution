import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
type PaymentStatus = 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'DECLINED' | 'REFUNDED';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid') paymentId!: string;
  @Index() @Column() orderId!: string;
  @Column({ type: 'numeric' }) amount!: number;
  @Column({ default: 'EUR' }) currency!: string;
  @Column({ default: 'PENDING' }) status!: PaymentStatus;
  @Column({ type: 'numeric', default: 0 }) capturedAmount!: number;
  @Column({ type: 'numeric', default: 0 }) refundedAmount!: number;
  @Column({ nullable: true }) providerRef?: string;
  @Column({ type: 'jsonb', nullable: true }) method?: any;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt!: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) updatedAt!: Date;
}
