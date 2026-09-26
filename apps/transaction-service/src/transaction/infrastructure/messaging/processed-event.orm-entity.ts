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

  // varchar: el correlationId de eventos ajenos puede no ser UUID.
  // nullable para que DB_SYNCHRONIZE pueda migrar la columna uuid vieja
  // en tablas con datos (se usa solo para diagnóstico).
  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  correlationId: string | null;

  @Column({
    name: 'processed_at',
    type: 'timestamptz',
  })
  processedAt: Date;
}
