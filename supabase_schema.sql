-- Supabase Schema for ERD Builder Pro

-- Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  uid UUID DEFAULT gen_random_uuid() UNIQUE,
  name TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Diagrams Table (ERD Files)
CREATE TABLE IF NOT EXISTS diagrams (
  id BIGSERIAL PRIMARY KEY,
  uid UUID DEFAULT gen_random_uuid() UNIQUE,
  name TEXT NOT NULL,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  viewport_x FLOAT DEFAULT 0,
  viewport_y FLOAT DEFAULT 0,
  viewport_zoom FLOAT DEFAULT 1.0
);

-- Entities Table
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY, -- Using UUID or custom ID from frontend
  file_id BIGINT REFERENCES diagrams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Columns Table
CREATE TABLE IF NOT EXISTS columns (
  id TEXT PRIMARY KEY, -- Using UUID or custom ID from frontend
  entity_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  is_pk BOOLEAN DEFAULT FALSE,
  is_nullable BOOLEAN DEFAULT TRUE,
  enum_values TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relationships Table
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY, -- Using UUID or custom ID from frontend
  file_id BIGINT REFERENCES diagrams(id) ON DELETE CASCADE,
  source_entity_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  source_column_id TEXT,
  target_column_id TEXT,
  type TEXT DEFAULT 'one-to-many',
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notes Table
CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  uid UUID DEFAULT gen_random_uuid() UNIQUE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drawings Table
CREATE TABLE IF NOT EXISTS drawings (
  id BIGSERIAL PRIMARY KEY,
  uid UUID DEFAULT gen_random_uuid() UNIQUE,
  title TEXT NOT NULL,
  data TEXT DEFAULT '[]',
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flowcharts Table
CREATE TABLE IF NOT EXISTS flowcharts (
  id BIGSERIAL PRIMARY KEY,
  uid UUID DEFAULT gen_random_uuid() UNIQUE,
  title TEXT NOT NULL,
  data TEXT DEFAULT '{"nodes":[], "edges":[]}',
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Optional, but recommended)
-- For now, we assume the app uses the service role key which bypasses RLS.
-- If you want to use public keys, you'll need to add policies.
