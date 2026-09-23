import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { BankEvent } from '../common/bank-event';

@Injectable()
export class RabbitService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  constructor(private readonly config: ConfigService) {}

  private async ch(): Promise<Channel> {
    if (this.channel) return this.channel;
    this.connection = await amqp.connect(this.config.getOrThrow<string>('RABBITMQ_URL'));
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange('bank.events', 'topic', { durable: true });
    await this.channel.assertExchange('bank.events.retry', 'topic', { durable: true });
    await this.channel.assertExchange('bank.events.dlx', 'topic', { durable: true });
    await this.channel.prefetch(Number(this.config.get('RABBITMQ_PREFETCH', 10)));
    return this.channel;
  }

  async publish<T>(event: BankEvent<T>): Promise<void> {
    const ch = await this.ch();
    ch.publish('bank.events', event.eventType, Buffer.from(JSON.stringify(event)), {
      persistent: true, contentType: 'application/json', messageId: event.eventId,
      correlationId: event.correlationId, timestamp: Date.now(),
    });
  }

  async subscribe(keys: string[], handler: (m: ConsumeMessage) => Promise<void>): Promise<void> {
    const ch = await this.ch();
    const q = this.config.get('RABBITMQ_QUEUE', 'account-service.events');
    const rq = `${q}.retry`; const dq = `${q}.dlq`;
    const delay = Number(this.config.get('RABBITMQ_RETRY_DELAY_MS', 3000));
    await ch.assertQueue(q, { durable: true });
    await ch.assertQueue(rq, { durable: true, arguments: { 'x-message-ttl': delay, 'x-dead-letter-exchange': 'bank.events' } });
    await ch.assertQueue(dq, { durable: true });
    for (const k of keys) {
      await ch.bindQueue(q, 'bank.events', k);
      await ch.bindQueue(rq, 'bank.events.retry', k);
      await ch.bindQueue(dq, 'bank.events.dlx', k);
    }
    await ch.consume(q, async (m) => {
      if (!m) return;
      try { await handler(m); ch.ack(m); }
      catch (e) { this.retryOrDlq(ch, m, e); }
    }, { noAck: false });
    this.logger.log(`${q} subscribed to ${keys.join(', ')}`);
  }

  private retryOrDlq(ch: Channel, m: ConsumeMessage, error: unknown) {
    const headers = m.properties.headers ?? {};
    const count = Number(headers['x-retry-count'] ?? 0);
    const max = Number(this.config.get('RABBITMQ_MAX_RETRIES', 3));
    const ex = count < max ? 'bank.events.retry' : 'bank.events.dlx';
    ch.publish(ex, m.fields.routingKey, m.content, {
      persistent: true, contentType: m.properties.contentType ?? 'application/json',
      messageId: m.properties.messageId, correlationId: m.properties.correlationId,
      headers: { ...headers, 'x-retry-count': count + (count < max ? 1 : 0), 'x-last-error': error instanceof Error ? error.message : String(error) },
    });
    ch.ack(m);
    this.logger[count < max ? 'warn' : 'error'](`${m.fields.routingKey}: ${count < max ? `retry ${count + 1}/${max}` : 'DLQ'}`);
  }

  async onModuleDestroy() { if (this.channel) await this.channel.close(); if (this.connection) await this.connection.close(); }
}
