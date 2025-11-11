import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import amqp from 'amqplib';

interface OrderPayload {
  orderId: string;
  items: any[];
}

@Injectable()
export class WmsBus implements OnModuleInit {
  private conn!: amqp.Connection;
  private pub!: amqp.Channel;
  private sub!: amqp.Channel;
  private channel: amqp.Channel;
  private readonly exchange = 'wms';

  constructor(
    @Inject('WMS_STATUS_CLIENT') private readonly statusClient: ClientProxy,
    @Inject('LOG_CLIENT') private readonly logClient: ClientProxy,
  ) {}

  async onModuleInit() {
    try {
      await this.statusClient.connect();
      await this.logClient.connect();
      console.log('WMS Clients verbunden');
    } catch (error) {
      console.error('FEHLER: WMS Clients konnten sich nicht verbinden', error);
    }
  }
  async publishFulfillmentCreated(payload: any) {
    if (!this.channel) throw new Error('RabbitMQ channel not ready');
    const msg = {
      ...payload,
      occurredAt: new Date().toISOString(),
    };
    this.channel.publish(
      this.exchange,
      'fulfillment.created',
      Buffer.from(JSON.stringify(msg)),
      {
        contentType: 'application/json',
        persistent: true,
      },
    );
    console.log('[WMS-Bus] Published fulfillment.created for', payload.orderId);
  }

  async consumeStatus(
    queueName: string,
    onMessage: (msg: any) => Promise<void>,
  ) {
    await this.sub.consume(
      queueName,
      async (msg) => {
        if (!msg) return;
        try {
          const data = JSON.parse(msg.content.toString());
          await onMessage(data);
          this.sub.ack(msg);
        } catch (err) {
          this.sub.nack(msg, false, false);
        }
      },
      { noAck: false },
    );
  }

  async close() {
    await this.pub?.close();
    await this.sub?.close();
    await this.conn?.close();
  }
}
