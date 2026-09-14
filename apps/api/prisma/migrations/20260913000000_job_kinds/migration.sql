ALTER TABLE durable_jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'fixture';
CREATE INDEX durable_jobs_kind_claim ON durable_jobs(kind,status,available_at,lease_until);
