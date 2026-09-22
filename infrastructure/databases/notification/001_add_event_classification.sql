-- Fase 2 - Notification & Audit Service
-- Agrega información de clasificación al historial.
--
-- Los campos permanecen nullable para conservar
-- compatibilidad con eventos históricos de Fase 1.

ALTER TABLE processed_events
    ADD COLUMN IF NOT EXISTS severity VARCHAR(20);

ALTER TABLE processed_events
    ADD COLUMN IF NOT EXISTS origin VARCHAR(100);

ALTER TABLE processed_events
    ADD COLUMN IF NOT EXISTS classification_message TEXT;
