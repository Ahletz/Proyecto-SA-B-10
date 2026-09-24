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

  /**
   * ON CONFLICT DO NOTHING: si dos entregas del mismo evento se procesan
   * a la vez (prefetch > 1), la segunda no falla ni pisa a la primera.
   */
  async markAsProcessed(
    event: BankEvent,
  ): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .into(ProcessedEventOrmEntity)
      .values({
        eventId: event.eventId,
        eventType: event.eventType,
        correlationId: event.correlationId,
        processedAt: new Date(),
      })
      .orIgnore()
      .execute();
  }
}
