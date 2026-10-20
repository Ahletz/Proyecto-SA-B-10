import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { BankEvent } from '../common/bank-event';
import { runWithCorrelationId } from '../common/correlation';
import { withConsumerSpan, withProducerSpan } from '../common/telemetry';

@Injectable()
export class RabbitService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitService.name);
  private conn: ChannelModel | null = null;
  private channel: Channel | null = null;
  private shuttingDown = false;
  constructor(private readonly c: ConfigService) {}

  private async ch() {
    if (this.channel) return this.channel;
    this.conn = await amqp.connect(this.c.getOrThrow<string>('RABBITMQ_URL'));
    this.channel = await this.conn.createChannel();
    this.exitOnUnexpectedClose(this.conn, this.channel);
    for (const e of ['bank.events', 'bank.events.retry', 'bank.events.dlx']) await this.channel.assertExchange(e, 'topic', { durable: true });
    return this.channel;
  }

  async publish<T>(e: BankEvent<T>) {
    const ch = await this.ch();
    // El span "publish <eventType>" mete el traceparent en los headers del mensaje.
    withProducerSpan(e.eventType, e.correlationId, (headers) => {
      ch.publish('bank.events', e.eventType, Buffer.from(JSON.stringify(e)), {
        persistent: true, contentType: 'application/json', messageId: e.eventId, correlationId: e.correlationId, headers,
      });
    });
  }

  async subscribe(handler: (m: ConsumeMessage) => Promise<void>, extraKeys: string[] = []) {
    const ch = await this.ch();
    const q = this.c.get('RABBITMQ_QUEUE', 'payment-service.events'); const rq = `${q}.retry`; const dq = `${q}.dlq`;
    const delay = Number(this.c.get('RABBITMQ_RETRY_DELAY_MS', 3000));
    await ch.assertQueue(q, { durable: true });
    await ch.assertQueue(rq, { durable: true, arguments: { 'x-message-ttl': delay, 'x-dead-letter-exchange': 'bank.events' } });
    await ch.assertQueue(dq, { durable: true });
    for (const key of ['account.funds.reserved', ...extraKeys]) {
      for (const [qq, ex] of [[q, 'bank.events'], [rq, 'bank.events.retry'], [dq, 'bank.events.dlx']] as const) await ch.bindQueue(qq, ex, key);
    }
    await ch.consume(q, async (m) => {
      if (!m) return;
      // Todo el procesamiento (y sus logs) corre con el correlationId del mensaje y dentro
      // del span "process <routingKey>", hijo del span de publicación de quien lo envió.
      await runWithCorrelationId(m.properties.correlationId, async () => {
        try { await withConsumerSpan(m, () => handler(m)); ch.ack(m); }
        catch (e) { this.retryOrDlq(ch, m, e); }
      });
    }, { noAck: false });
  }

  private retryOrDlq(ch: Channel, m: ConsumeMessage, e: unknown) {
    const h = m.properties.headers ?? {}; const n = Number(h['x-retry-count'] ?? 0);
    const max = Number(this.c.get('RABBITMQ_MAX_RETRIES', 3));
    const ex = n < max ? 'bank.events.retry' : 'bank.events.dlx';
    // Se conserva traceparent: el reintento sigue siendo parte de la misma traza.
    ch.publish(ex, m.fields.routingKey, m.content, {
      persistent: true, contentType: 'application/json', messageId: m.properties.messageId, correlationId: m.properties.correlationId,
      headers: { ...h, 'x-retry-count': n + (n < max ? 1 : 0), 'x-last-error': e instanceof Error ? e.message : String(e) },
    });
    ch.ack(m);
    this.logger[n < max ? 'warn' : 'error'](n < max ? `retry ${n + 1}/${max}` : 'moved to DLQ');
  }

  // Sin reconexión propia: si RabbitMQ cierra la conexión o el canal (p. ej. reinicio del broker), el servicio
  // quedaría vivo sin consumir ni publicar. Se termina el proceso para que Kubernetes/Docker lo levante de nuevo.
  private exitOnUnexpectedClose(conn: ChannelModel, channel: Channel) {
    const exit = (source: string) => (error?: unknown) => {
      if (this.shuttingDown) return;
      this.logger.error(`RabbitMQ ${source} closed${error ? `: ${String(error)}` : ''}. Exiting so the service restarts with a new connection`);
      process.exit(1);
    };
    conn.on('error', (error: unknown) => this.logger.error(`RabbitMQ connection error: ${String(error)}`));
    conn.on('close', exit('connection'));
    channel.on('close', exit('channel'));
  }

  async onModuleDestroy() { this.shuttingDown = true; if (this.channel) await this.channel.close(); if (this.conn) await this.conn.close(); }
}
