-- NewsReach job scheduling schema

CREATE TABLE machines (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'AVAILABLE'
              CHECK (status IN ('AVAILABLE', 'UNAVAILABLE'))
);

CREATE TABLE jobs (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  operation_type  TEXT NOT NULL,
  duration        INTEGER NOT NULL CHECK (duration >= 1),
  release_time    INTEGER NOT NULL CHECK (release_time >= 0),
  -- impossible windows (deadline < release + duration) are accepted on purpose:
  -- the scheduler excludes such jobs with a reason
  deadline        INTEGER NOT NULL CHECK (deadline >= 0),
  priority        INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 10),
  input_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE job_eligible_machines (
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  machine_id  TEXT NOT NULL REFERENCES machines(id),
  PRIMARY KEY (job_id, machine_id)
);

CREATE TABLE job_dependencies (
  job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  depends_on_id   TEXT NOT NULL REFERENCES jobs(id),
  PRIMARY KEY (job_id, depends_on_id),
  CONSTRAINT job_dependencies_no_self CHECK (job_id <> depends_on_id)
);

CREATE TABLE schedules (
  id                 BIGSERIAL PRIMARY KEY,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_priority     INTEGER NOT NULL,
  scheduled_count    INTEGER NOT NULL,
  makespan           INTEGER NOT NULL,
  input_fingerprint  TEXT NOT NULL,
  input_snapshot     JSONB NOT NULL,
  solver_stats       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE schedule_assignments (
  schedule_id  BIGINT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  job_id       TEXT NOT NULL,
  machine_id   TEXT NOT NULL,
  start_slot   INTEGER NOT NULL CHECK (start_slot >= 0),
  end_slot     INTEGER NOT NULL,
  PRIMARY KEY (schedule_id, job_id),
  CONSTRAINT assignment_interval CHECK (end_slot > start_slot)
);

CREATE TABLE schedule_exclusions (
  schedule_id  BIGINT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  job_id       TEXT NOT NULL,
  reason_code  TEXT NOT NULL,
  reason_text  TEXT NOT NULL,
  PRIMARY KEY (schedule_id, job_id)
);

CREATE TABLE job_executions (
  id            BIGSERIAL PRIMARY KEY,
  schedule_id   BIGINT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  job_id        TEXT NOT NULL,
  status        TEXT NOT NULL
                CHECK (status IN ('SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'BLOCKED')),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  duration_ms   INTEGER,
  output        JSONB,
  error         TEXT,
  UNIQUE (schedule_id, job_id)
);

CREATE TABLE execution_logs (
  id            BIGSERIAL PRIMARY KEY,
  execution_id  BIGINT NOT NULL REFERENCES job_executions(id) ON DELETE CASCADE,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  level         TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR')),
  message       TEXT NOT NULL
);

CREATE INDEX idx_job_executions_schedule ON job_executions(schedule_id);
CREATE INDEX idx_execution_logs_execution ON execution_logs(execution_id, id);
