-- Additive; do not fabricate trace identifiers for historical events.
ALTER TABLE processed_events ADD COLUMN IF NOT EXISTS trace_id varchar(32);
ALTER TABLE processed_events ADD COLUMN IF NOT EXISTS span_id varchar(16);
ALTER TABLE processed_events ADD COLUMN IF NOT EXISTS service_name varchar(100);
CREATE INDEX IF NOT EXISTS audit_correlation_idx ON processed_events(correlation_id,processed_at);
CREATE INDEX IF NOT EXISTS audit_trace_idx ON processed_events(trace_id,processed_at);
CREATE INDEX IF NOT EXISTS audit_filter_idx ON processed_events(service_name,severity,processed_at);
CREATE TABLE IF NOT EXISTS notification_outbox (
 id varchar(160) PRIMARY KEY,kind varchar(30) NOT NULL,body text NOT NULL,
 status varchar(20) NOT NULL,attempts integer NOT NULL,created_at timestamptz NOT NULL,
 next_attempt_at timestamptz NOT NULL,correlation_id varchar(128),traceparent varchar(55)
);
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx ON notification_outbox(status,next_attempt_at);
CREATE TABLE IF NOT EXISTS notification_customer_contacts (
 customer_id varchar(128) PRIMARY KEY,email varchar(255) NOT NULL,updated_at timestamptz NOT NULL
);
