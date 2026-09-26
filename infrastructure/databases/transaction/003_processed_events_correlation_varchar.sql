-- Fase 2 - Transaction Service
-- El correlationId de eventos ajenos (p. ej. customer.kyc.status.changed)
-- puede venir del header X-Correlation-Id y no siempre es un UUID. Con la
-- columna uuid el evento se procesaba pero no se podía marcar y acababa en
-- la DLQ tras los reintentos.
--
-- Con DB_SYNCHRONIZE=true TypeORM borra y recrea la columna (por eso es
-- nullable: los registros viejos quedan sin correlation_id, que solo sirve
-- para diagnóstico). Este script hace el cambio conservando los datos.

ALTER TABLE processed_events
    ALTER COLUMN correlation_id TYPE VARCHAR(100),
    ALTER COLUMN correlation_id DROP NOT NULL;
