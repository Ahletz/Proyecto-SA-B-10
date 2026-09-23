import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BankEvent } from '../../../common/events/bank-event.interface';
import { ProcessedEventOrmEntity } from './processed-event.orm-entity';

@Injectable()
export class EventIdempotencyService {
  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly repository: Repository<ProcessedEventOrmEntity>,
  ) {}

  async hasBeenProcessed(
    eventId: string,
  ): Promise<boolean> {
    const count = await this.repository.count({
      where: {
        eventId,
      },
    });

    return count > 0;
  }

  async markAsProcessed(
    event: BankEvent,
  ): Promise<void> {
    const processedEvent =
      new ProcessedEventOrmEntity();

    processedEvent.eventId =
      event.eventId;

    processedEvent.eventType =
      event.eventType;

    processedEvent.correlationId =
      event.correlationId;

    processedEvent.processedAt =
      new Date();

    await this.repository.save(
      processedEvent,
    );
  }
}
