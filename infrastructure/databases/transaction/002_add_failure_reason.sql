-- Fase 2 - Transaction Service
-- Motivo del fallo o de la compensación de la Saga (KYC_NOT_VERIFIED,
-- INSUFFICIENT_FUNDS, PAYMENT_TIMEOUT, ...), visible en el historial.
--
-- Script idempotente. En local lo crea TypeORM (DB_SYNCHRONIZE=true).

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(60);
