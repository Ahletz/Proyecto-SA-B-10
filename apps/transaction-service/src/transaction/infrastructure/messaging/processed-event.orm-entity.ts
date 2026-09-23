import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'processed_events' })
export class ProcessedEventOrmEntity {
  @PrimaryColumn({
    name: 'event_id',
    type: 'uuid',
  })
  eventId: string;

  @Column({
    name: 'event_type',
    type: 'varchar',
    length: 150,
  })
  eventType: string;

  @Column({
    name: 'correlation_id',
    type: 'uuid',
  })
  correlationId: string;

  @Column({
    name: 'processed_at',
    type: 'timestamptz',
  })
  processedAt: Date;
}
