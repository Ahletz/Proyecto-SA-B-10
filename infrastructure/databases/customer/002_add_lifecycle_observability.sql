-- Additive migration; historical customers acquire a lifecycle context on the next transition.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lifecycle_correlation_id varchar(128);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lifecycle_traceparent varchar(55);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS kyc_verified_at timestamptz;
