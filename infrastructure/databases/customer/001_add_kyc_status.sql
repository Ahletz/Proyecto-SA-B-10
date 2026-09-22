-- Fase 2 - Customer Service
-- Agrega el estado KYC a clientes existentes.
--
-- Script idempotente: puede ejecutarse más de una vez sin duplicar la columna.

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20);

UPDATE customers
SET kyc_status = 'PENDING'
WHERE kyc_status IS NULL;

ALTER TABLE customers
    ALTER COLUMN kyc_status SET DEFAULT 'PENDING';

ALTER TABLE customers
    ALTER COLUMN kyc_status SET NOT NULL;
