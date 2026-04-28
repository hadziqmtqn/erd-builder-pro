-- Supabase Schema for ERD Builder Pro

-- Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  uid UUID DEFAULT gen_random_uuid() UNIQUE,
  name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Diagrams Table (ERD Files)
CREATE TABLE IF NOT EXISTS diagrams (
  id BIGSERIAL PRIMARY KEY,
  uid UUID DEFAULT gen_random_uuid() UNIQUE,
  name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  viewport_x FLOAT DEFAULT 0,
  viewport_y FLOAT DEFAULT 0,
  viewport_zoom FLOAT DEFAULT 1.0,
  _version INTEGER DEFAULT 0
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
  sort_order INTEGER DEFAULT 0,
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
  source_handle TEXT,
  target_handle TEXT,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notes Table
CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  uid UUID DEFAULT gen_random_uuid() UNIQUE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  _version INTEGER DEFAULT 0
);

-- Drawings Table
CREATE TABLE IF NOT EXISTS drawings (
  id BIGSERIAL PRIMARY KEY,
  uid UUID DEFAULT gen_random_uuid() UNIQUE,
  title TEXT NOT NULL,
  data TEXT DEFAULT '[]',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  _version INTEGER DEFAULT 0
);

-- Flowcharts Table
CREATE TABLE IF NOT EXISTS flowcharts (
  id BIGSERIAL PRIMARY KEY,
  uid UUID DEFAULT gen_random_uuid() UNIQUE,
  title TEXT NOT NULL,
  data TEXT DEFAULT '{"nodes":[], "edges":[]}',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  _version INTEGER DEFAULT 0
);

-- Entity Changes Table (Audit Trail for Backup/Restore & Version Control)
CREATE TABLE IF NOT EXISTS entity_changes (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL, -- 'diagram', 'note', 'drawing', 'flowchart'
  entity_id BIGINT NOT NULL,
  version INTEGER NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changes JSONB NOT NULL, -- {field: old_value, field: new_value, ...}
  change_type TEXT DEFAULT 'update', -- 'create', 'update', 'delete'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for entity_changes table
CREATE INDEX IF NOT EXISTS idx_entity_changes_lookup ON entity_changes(entity_type, entity_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_entity_changes_user ON entity_changes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_changes_retention ON entity_changes(created_at DESC);

-- Data Retention Policy: Keep 7 days of history
-- Note: This requires pg_cron extension to be enabled in Supabase
-- SELECT cron.schedule('delete-old-entity-changes', '0 2 * * *', 'DELETE FROM entity_changes WHERE created_at < NOW() - INTERVAL ''7 days''');

-- Version Increment Triggers for Optimistic Locking
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW._version = OLD._version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Diagram version trigger
DROP TRIGGER IF EXISTS increment_diagram_version_trigger ON diagrams;
CREATE TRIGGER increment_diagram_version_trigger
BEFORE UPDATE ON diagrams
FOR EACH ROW
EXECUTE FUNCTION increment_version();

-- Notes version trigger
DROP TRIGGER IF EXISTS increment_notes_version_trigger ON notes;
CREATE TRIGGER increment_notes_version_trigger
BEFORE UPDATE ON notes
FOR EACH ROW
EXECUTE FUNCTION increment_version();

-- Drawings version trigger
DROP TRIGGER IF EXISTS increment_drawings_version_trigger ON drawings;
CREATE TRIGGER increment_drawings_version_trigger
BEFORE UPDATE ON drawings
FOR EACH ROW
EXECUTE FUNCTION increment_version();

-- Flowcharts version trigger
DROP TRIGGER IF EXISTS increment_flowcharts_version_trigger ON flowcharts;
CREATE TRIGGER increment_flowcharts_version_trigger
BEFORE UPDATE ON flowcharts
FOR EACH ROW
EXECUTE FUNCTION increment_version();

-- Performance Indexes for Version Columns
CREATE INDEX IF NOT EXISTS idx_diagrams_version ON diagrams(_version);
CREATE INDEX IF NOT EXISTS idx_diagrams_updated_at ON diagrams(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_version ON notes(_version);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawings_version ON drawings(_version);
CREATE INDEX IF NOT EXISTS idx_drawings_updated_at ON drawings(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_flowcharts_version ON flowcharts(_version);
CREATE INDEX IF NOT EXISTS idx_flowcharts_updated_at ON flowcharts(updated_at DESC);

-- Backups Table
CREATE TABLE IF NOT EXISTS backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    file_path TEXT,
    file_size BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for all main tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagrams ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE flowcharts ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

-- Projects Policies
CREATE POLICY "Users can view their own projects" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own projects" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own projects" ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own projects" ON projects FOR DELETE USING (auth.uid() = user_id);

-- Diagrams Policies
CREATE POLICY "Users can view their own diagrams" ON diagrams FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own diagrams" ON diagrams FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own diagrams" ON diagrams FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own diagrams" ON diagrams FOR DELETE USING (auth.uid() = user_id);

-- Notes Policies
CREATE POLICY "Users can view their own notes" ON notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own notes" ON notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own notes" ON notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notes" ON notes FOR DELETE USING (auth.uid() = user_id);

-- Drawings Policies
CREATE POLICY "Users can view their own drawings" ON drawings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own drawings" ON drawings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own drawings" ON drawings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own drawings" ON drawings FOR DELETE USING (auth.uid() = user_id);

-- Flowcharts Policies
CREATE POLICY "Users can view their own flowcharts" ON flowcharts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own flowcharts" ON flowcharts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own flowcharts" ON flowcharts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own flowcharts" ON flowcharts FOR DELETE USING (auth.uid() = user_id);

-- Backups Policies
CREATE POLICY "Users can view their own backups" ON backups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own backups" ON backups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can update backups" ON backups FOR UPDATE USING (true);
