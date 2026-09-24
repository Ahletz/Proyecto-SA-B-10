import { EventEmitter } from 'events';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const broker = vi.hoisted(() => ({ connection: null as any, channel: null as any }));
vi.mock('amqplib', () => ({ connect: vi.fn(async () => broker.connection) }));

import { RabbitService } from './rabbit.service';

const config = { getOrThrow: () => 'amqp://test', get: (_key: string, fallback?: unknown) => fallback } as unknown as ConfigService;

function fakeBroker() {
  const channel = Object.assign(new EventEmitter(), {
    assertExchange: vi.fn(), prefetch: vi.fn(), publish: vi.fn(() => true), close: vi.fn(async () => undefined),
  });
  const connection = Object.assign(new EventEmitter(), {
    createChannel: vi.fn(async () => channel), close: vi.fn(async () => undefined),
  });
  broker.connection = connection;
  broker.channel = channel;
}

describe('RabbitService - caída de la conexión con RabbitMQ', () => {
  let exit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fakeBroker();
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => vi.restoreAllMocks());

  it('termina el proceso si el broker cierra la conexión', async () => {
    const service = new RabbitService(config);
    await service.publish({ eventId: 'e1', eventType: 'x.y', version: 1, timestamp: '', correlationId: 'c1', payload: {} });

    broker.connection.emit('error', new Error('CONNECTION_FORCED'));
    broker.connection.emit('close', new Error('CONNECTION_FORCED'));

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('termina el proceso si se cierra el canal', async () => {
    const service = new RabbitService(config);
    await service.publish({ eventId: 'e1', eventType: 'x.y', version: 1, timestamp: '', correlationId: 'c1', payload: {} });

    broker.channel.emit('close');

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('no termina el proceso en un apagado normal', async () => {
    const service = new RabbitService(config);
    await service.publish({ eventId: 'e1', eventType: 'x.y', version: 1, timestamp: '', correlationId: 'c1', payload: {} });

    await service.onModuleDestroy();
    broker.channel.emit('close');
    broker.connection.emit('close');

    expect(exit).not.toHaveBeenCalled();
  });
});
