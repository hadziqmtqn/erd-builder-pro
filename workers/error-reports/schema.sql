-- Desktop error reports (OPS-010): one row per UTC day and combination, nothing per user.
CREATE TABLE IF NOT EXISTS daily_reports (
  day TEXT NOT NULL,
  app_version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  event TEXT NOT NULL,
  step TEXT NOT NULL,
  -- Text so "no exit code" ('') is part of the primary key; SQLite treats NULLs as distinct.
  exit_code TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, app_version, os, arch, event, step, exit_code)
);
