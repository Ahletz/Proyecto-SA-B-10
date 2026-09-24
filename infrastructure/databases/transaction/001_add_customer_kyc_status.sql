-- Fase 2 - Transaction Service
-- Proyección local del estado KYC, alimentada por customer.kyc.status.changed.
-- La Saga solo continúa si el cliente que solicita la transferencia está VERIFIED.
--
-- Script idempotente. En local lo crea TypeORM (DB_SYNCHRONIZE=true);
-- este script es para entornos sin synchronize (Cloud SQL).

CREATE TABLE IF NOT EXISTS customer_kyc_status (
    customer_id VARCHAR(50) PRIMARY KEY,
    status      VARCHAR(20) NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL
);
