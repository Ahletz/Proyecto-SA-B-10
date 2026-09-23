-- Fase 2: reglas de tipo de cuenta
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS min_balance NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(18,2);
ALTER TABLE transfer_reservations ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0;
