import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

import type {
  Channel,
  ChannelModel,
  ConsumeMessage,
} from 'amqplib';

import { BankEvent } from '../../../common/events/bank-event.interface';

@Injectable()
export class RabbitMqService
  implements OnModuleDestroy
{
  private readonly logger =
    new Logger(RabbitMqService.name);

  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(
    private readonly configService: ConfigService,
  ) {}

  private async getChannel(): Promise<Channel> {
    if (this.channel) {
      return this.channel;
    }

    const url =
      this.configService.getOrThrow<string>(
        'RABBITMQ_URL',
      );

    this.connection = await amqp.connect(url);

    this.channel =
      await this.connection.createChannel();

    const exchange =
      this.configService.get<string>(
        'RABBITMQ_EXCHANGE',
        'bank.events',
      );

    const retryExchange =
      this.configService.get<string>(
        'RABBITMQ_RETRY_EXCHANGE',
        'bank.events.retry',
      );

    const deadLetterExchange =
      this.configService.get<string>(
        'RABBITMQ_DLX',
        'bank.events.dlx',
      );

    await this.channel.assertExchange(
      exchange,
      'topic',
      {
        durable: true,
      },
    );

    await this.channel.assertExchange(
      retryExchange,
      'topic',
      {
        durable: true,
      },
    );

    await this.channel.assertExchange(
      deadLetterExchange,
      'topic',
      {
        durable: true,
      },
    );

    const prefetch = Number(
      this.configService.get<string>(
        'RABBITMQ_PREFETCH',
        '10',
      ),
    );

    await this.channel.prefetch(prefetch);

    this.logger.log(
      `Connected to RabbitMQ exchange ${exchange}`,
    );

    return this.channel;
  }

  async publish<TPayload>(
    routingKey: string,
    event: BankEvent<TPayload>,
  ): Promise<void> {
    const channel = await this.getChannel();

    const exchange =
      this.configService.get<string>(
        'RABBITMQ_EXCHANGE',
        'bank.events',
      );

    const published = channel.publish(
      exchange,
      routingKey,
      Buffer.from(
        JSON.stringify(event),
      ),
      {
        persistent: true,
        contentType: 'application/json',
        messageId: event.eventId,
        correlationId: event.correlationId,
        timestamp: Date.now(),
      },
    );

    if (!published) {
      this.logger.warn(
        `RabbitMQ write buffer full for ${routingKey}`,
      );
    }

    this.logger.debug(
      `Published event ${routingKey} (${event.eventId})`,
    );
  }

  async subscribe(
    routingKeys: string[],
    handler: (
      message: ConsumeMessage,
    ) => Promise<void>,
  ): Promise<void> {
    const channel = await this.getChannel();

    const exchange =
      this.configService.get<string>(
        'RABBITMQ_EXCHANGE',
        'bank.events',
      );

    const retryExchange =
      this.configService.get<string>(
        'RABBITMQ_RETRY_EXCHANGE',
        'bank.events.retry',
      );

    const deadLetterExchange =
      this.configService.get<string>(
        'RABBITMQ_DLX',
        'bank.events.dlx',
      );

    const queue =
      this.configService.get<string>(
        'RABBITMQ_QUEUE',
        'transaction-service.events',
      );

    const retryQueue =
      this.configService.get<string>(
        'RABBITMQ_RETRY_QUEUE',
        'transaction-service.events.retry',
      );

    const deadLetterQueue =
      this.configService.get<string>(
        'RABBITMQ_DLQ',
        'transaction-service.events.dlq',
      );

    const retryDelay = Number(
      this.configService.get<string>(
        'RABBITMQ_RETRY_DELAY_MS',
        '5000',
      ),
    );

    await channel.assertQueue(
      queue,
      {
        durable: true,
      },
    );

    await channel.assertQueue(
      retryQueue,
      {
        durable: true,
        arguments: {
          'x-message-ttl': retryDelay,

          'x-dead-letter-exchange':
            exchange,
        },
      },
    );

    await channel.assertQueue(
      deadLetterQueue,
      {
        durable: true,
      },
    );

    for (const routingKey of routingKeys) {
      await channel.bindQueue(
        queue,
        exchange,
        routingKey,
      );

      await channel.bindQueue(
        retryQueue,
        retryExchange,
        routingKey,
      );

      await channel.bindQueue(
        deadLetterQueue,
        deadLetterExchange,
        routingKey,
      );

      this.logger.log(
        `${queue} bound to ${routingKey}`,
      );
    }

    await channel.consume(
      queue,
      async (message) => {
        if (!message) {
          return;
        }

        try {
          await handler(message);

          channel.ack(message);
        } catch (error) {
          await this.handleFailedMessage(
            channel,
            message,
            error,
          );
        }
      },
      {
        noAck: false,
      },
    );
  }

  private async handleFailedMessage(
    channel: Channel,
    message: ConsumeMessage,
    error: unknown,
  ): Promise<void> {
    const retryExchange =
      this.configService.get<string>(
        'RABBITMQ_RETRY_EXCHANGE',
        'bank.events.retry',
      );

    const deadLetterExchange =
      this.configService.get<string>(
        'RABBITMQ_DLX',
        'bank.events.dlx',
      );

    const maxRetries = Number(
      this.configService.get<string>(
        'RABBITMQ_MAX_RETRIES',
        '3',
      ),
    );

    const routingKey =
      message.fields.routingKey;

    const headers =
      message.properties.headers ?? {};

    const currentRetryCount = Number(
      headers['x-retry-count'] ?? 0,
    );

    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    if (currentRetryCount < maxRetries) {
      const nextRetryCount =
        currentRetryCount + 1;

      channel.publish(
        retryExchange,
        routingKey,
        message.content,
        {
          persistent: true,

          contentType:
            message.properties.contentType ??
            'application/json',

          messageId:
            message.properties.messageId,

          correlationId:
            message.properties.correlationId,

          timestamp:
            message.properties.timestamp ??
            Date.now(),

          headers: {
            ...headers,

            'x-retry-count':
              nextRetryCount,

            'x-original-routing-key':
              routingKey,

            'x-last-error':
              errorMessage,
          },
        },
      );

      channel.ack(message);

      this.logger.warn(
        `Event ${routingKey} failed. ` +
          `Scheduled retry ` +
          `${nextRetryCount}/${maxRetries}. ` +
          `Reason: ${errorMessage}`,
      );

      return;
    }

    channel.publish(
      deadLetterExchange,
      routingKey,
      message.content,
      {
        persistent: true,

        contentType:
          message.properties.contentType ??
          'application/json',

        messageId:
          message.properties.messageId,

        correlationId:
          message.properties.correlationId,

        timestamp:
          message.properties.timestamp ??
          Date.now(),

        headers: {
          ...headers,

          'x-retry-count':
            currentRetryCount,

          'x-original-routing-key':
            routingKey,

          'x-final-error':
            errorMessage,
        },
      },
    );

    channel.ack(message);

    this.logger.error(
      `Event ${routingKey} moved to DLQ ` +
        `after ${currentRetryCount} retries. ` +
        `Reason: ${errorMessage}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }

    if (this.connection) {
      await this.connection.close();
    }
  }
}
