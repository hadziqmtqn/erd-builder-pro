-- Supabase Schema for ERD Builder Pro

-- Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  uid UUID DEFAULT gen_random_uuid() UNIQUE,
  name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_public BOOLEAN DEFAULT FALSE,
  share_token TEXT,
  expiry_date TIMESTAMPTZ
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
  is_public BOOLEAN DEFAULT FALSE,
  share_token TEXT,
  expiry_date TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  _version INTEGER DEFAULT 0
);

-- Entities Table
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  diagram_id BIGINT REFERENCES diagrams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  x DOUBLE PRECISION DEFAULT 0,
  y DOUBLE PRECISION DEFAULT 0,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Columns Table
CREATE TABLE IF NOT EXISTS columns (
  id TEXT PRIMARY KEY,
  entity_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  is_pk BOOLEAN DEFAULT FALSE,
  is_nullable BOOLEAN DEFAULT TRUE,
  enum_values TEXT, -- comma separated
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relationships Table
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  diagram_id BIGINT REFERENCES diagrams(id) ON DELETE CASCADE,
  source_entity_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  source_column_id TEXT,
  target_column_id TEXT,
  source_handle TEXT,
  target_handle TEXT,
  type TEXT DEFAULT 'one-to-many',
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
  is_public BOOLEAN DEFAULT FALSE,
  share_token TEXT,
  expiry_date TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
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
  is_public BOOLEAN DEFAULT FALSE,
  share_token TEXT,
  expiry_date TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
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
  is_public BOOLEAN DEFAULT FALSE,
  share_token TEXT,
  expiry_date TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  _version INTEGER DEFAULT 0
);

-- Entity Changes Table (Audit Trail for Backup/Restore & Version Control)
CREATE TABLE IF NOT EXISTS entity_changes (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL, -- 'diagram', 'note', 'drawing', 'flowchart'
  entity_id TEXT NOT NULL, -- Changed from BIGINT to TEXT to support UUIDs/IDs from ERD entities
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
CREATE INDEX IF NOT EXISTS idx_entity_changes_entity_id ON entity_changes(entity_id);

-- Data Retention Policy: Keep 7 days of history, but always keep at least 5 versions per entity
-- Note: This requires pg_cron extension to be enabled in Supabase
-- SELECT cron.schedule('smart-cleanup-history', '0 2 * * *', $$
--   DELETE FROM entity_changes
--   WHERE created_at < NOW() - INTERVAL '7 days'
--   AND id NOT IN (
--     SELECT id FROM (
--       SELECT id, ROW_NUMBER() OVER (PARTITION BY entity_type, entity_id ORDER BY created_at DESC) as rank
--       FROM entity_changes
--     ) t
--     WHERE t.rank <= 5
--   );
-- $$);

-- Version Increment Triggers for Optimistic Locking
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW._version = COALESCE(OLD._version, 0) + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Audit Trail Function: Captures changes into entity_changes table
CREATE OR REPLACE FUNCTION log_entity_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_changes JSONB;
  v_version INTEGER;
BEGIN
  -- Attempt to get the user ID from the session or the record
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    BEGIN
      v_user_id := NEW.user_id;
    EXCEPTION WHEN OTHERS THEN
      v_user_id := NULL;
    END;
  END IF;

  -- For simplicity and easier rollback, we now store the FULL NEW STATE on every operation
  -- This allows us to "revert" simply by picking the snapshot at any given time.
  v_changes := to_jsonb(NEW);

  -- Safe version extraction (handles tables without _version column)
  v_version := COALESCE((to_jsonb(NEW)->>'_version')::INTEGER, 0);

  -- 🚀 SMART THROTTLING: Only create a new snapshot if the last one was > 5 minutes ago
  -- This prevents database bloat from frequent auto-saves while keeping meaningful history.
  IF TG_OP = 'UPDATE' THEN
    IF EXISTS (
      SELECT 1 FROM entity_changes 
      WHERE entity_type = TG_TABLE_NAME 
      AND entity_id = NEW.id::TEXT 
      AND created_at > NOW() - INTERVAL '5 minutes'
    ) THEN
      RETURN NEW; -- Skip logging, just perform the update on the main table
    END IF;
  END IF;

  INSERT INTO entity_changes (
    entity_type,
    entity_id,
    version,
    user_id,
    changes,
    change_type
  ) VALUES (
    TG_TABLE_NAME, 
    NEW.id::TEXT,
    v_version,
    v_user_id,
    v_changes,
    LOWER(TG_OP)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply Version & Audit Triggers to all main tables
-- 1. Diagrams
DROP TRIGGER IF EXISTS tr_diagrams_version ON diagrams;
CREATE TRIGGER tr_diagrams_version BEFORE UPDATE ON diagrams FOR EACH ROW EXECUTE FUNCTION increment_version();
-- NOTE: Audit for diagrams is handled via API to capture complex relationships (entities/columns/rels)
DROP TRIGGER IF EXISTS tr_diagrams_audit ON diagrams;

-- 2. Notes
DROP TRIGGER IF EXISTS tr_notes_version ON notes;
CREATE TRIGGER tr_notes_version BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION increment_version();
DROP TRIGGER IF EXISTS tr_notes_audit ON notes;
CREATE TRIGGER tr_notes_audit AFTER INSERT OR UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION log_entity_changes();

-- 3. Drawings
DROP TRIGGER IF EXISTS tr_drawings_version ON drawings;
CREATE TRIGGER tr_drawings_version BEFORE UPDATE ON drawings FOR EACH ROW EXECUTE FUNCTION increment_version();
DROP TRIGGER IF EXISTS tr_drawings_audit ON drawings;
-- 3. Drawings
DROP TRIGGER IF EXISTS tr_drawings_audit ON drawings;
CREATE TRIGGER tr_drawings_audit AFTER INSERT OR UPDATE ON drawings FOR EACH ROW EXECUTE FUNCTION log_entity_changes();

-- 4. Flowcharts
DROP TRIGGER IF EXISTS tr_flowcharts_audit ON flowcharts;
CREATE TRIGGER tr_flowcharts_audit AFTER INSERT OR UPDATE ON flowcharts FOR EACH ROW EXECUTE FUNCTION log_entity_changes();

-- 5. Entities (ERD Tables)
DROP TRIGGER IF EXISTS tr_entities_audit ON entities;
-- CREATE TRIGGER tr_entities_audit AFTER INSERT OR UPDATE ON entities FOR EACH ROW EXECUTE FUNCTION log_entity_changes();

-- 6. Columns (ERD Fields)
DROP TRIGGER IF EXISTS tr_columns_audit ON columns;
-- CREATE TRIGGER tr_columns_audit AFTER INSERT OR UPDATE ON columns FOR EACH ROW EXECUTE FUNCTION log_entity_changes();

-- 7. Relationships (ERD Edges)
DROP TRIGGER IF EXISTS tr_relationships_audit ON relationships;
-- CREATE TRIGGER tr_relationships_audit AFTER INSERT OR UPDATE ON relationships FOR EACH ROW EXECUTE FUNCTION log_entity_changes();

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

-- User Preferences Table
-- Container for per-user settings. The `backup_folder` field is only used in
-- local modes (desktop SQLite / local PostgreSQL) where backups are written to
-- a user-controlled local filesystem path. In Supabase mode, backups go through
-- a GitHub Action → R2, so this field is ignored — the application UI hides
-- the "Storage location" panel entirely in cloud mode.
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    backup_folder TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for all main tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagrams ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE flowcharts ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Projects Policies
CREATE POLICY "Users can view their own projects" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own projects" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own projects" ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own projects" ON projects FOR DELETE USING (auth.uid() = user_id);

-- Diagrams Policies
CREATE POLICY "Anyone can view public diagrams" ON diagrams FOR SELECT USING (is_public = true AND (expiry_date IS NULL OR expiry_date > NOW()));
CREATE POLICY "Users can view their own diagrams" ON diagrams FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own diagrams" ON diagrams FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own diagrams" ON diagrams FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own diagrams" ON diagrams FOR DELETE USING (auth.uid() = user_id);

-- Notes Policies
CREATE POLICY "Anyone can view public notes" ON notes FOR SELECT USING (is_public = true AND (expiry_date IS NULL OR expiry_date > NOW()));
CREATE POLICY "Users can view their own notes" ON notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own notes" ON notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own notes" ON notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notes" ON notes FOR DELETE USING (auth.uid() = user_id);

-- Drawings Policies
CREATE POLICY "Anyone can view public drawings" ON drawings FOR SELECT USING (is_public = true AND (expiry_date IS NULL OR expiry_date > NOW()));
CREATE POLICY "Users can view their own drawings" ON drawings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own drawings" ON drawings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own drawings" ON drawings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own drawings" ON drawings FOR DELETE USING (auth.uid() = user_id);

-- Flowcharts Policies
CREATE POLICY "Anyone can view public flowcharts" ON flowcharts FOR SELECT USING (is_public = true AND (expiry_date IS NULL OR expiry_date > NOW()));
CREATE POLICY "Users can view their own flowcharts" ON flowcharts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own flowcharts" ON flowcharts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own flowcharts" ON flowcharts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own flowcharts" ON flowcharts FOR DELETE USING (auth.uid() = user_id);

-- Backups Policies
CREATE POLICY "Users can view their own backups" ON backups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own backups" ON backups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can update backups" ON backups FOR UPDATE USING (true);

-- User Preferences Policies
CREATE POLICY "Users can view their own preferences" ON user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own preferences" ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own preferences" ON user_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own preferences" ON user_preferences FOR DELETE USING (auth.uid() = user_id);

-- Entity Changes Policies (Safety measures even if triggers are disabled)
ALTER TABLE entity_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert their own entity changes" ON entity_changes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own entity changes" ON entity_changes FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Entities Policies
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view entities of public diagrams" ON entities FOR SELECT USING (EXISTS (SELECT 1 FROM diagrams WHERE diagrams.id = entities.diagram_id AND diagrams.is_public = true AND (diagrams.expiry_date IS NULL OR diagrams.expiry_date > NOW())));
CREATE POLICY "Users can manage entities in their own diagrams" ON entities FOR ALL USING (EXISTS (SELECT 1 FROM diagrams WHERE diagrams.id = entities.diagram_id AND diagrams.user_id = auth.uid()));

-- Columns Policies
ALTER TABLE columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view columns of public diagrams" ON columns FOR SELECT USING (EXISTS (SELECT 1 FROM entities JOIN diagrams ON diagrams.id = entities.diagram_id WHERE entities.id = columns.entity_id AND diagrams.is_public = true AND (diagrams.expiry_date IS NULL OR diagrams.expiry_date > NOW())));
CREATE POLICY "Users can manage columns in their own diagrams" ON columns FOR ALL USING (EXISTS (SELECT 1 FROM entities JOIN diagrams ON diagrams.id = entities.diagram_id WHERE entities.id = columns.entity_id AND diagrams.user_id = auth.uid()));

-- Relationships Policies
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view relationships of public diagrams" ON relationships FOR SELECT USING (EXISTS (SELECT 1 FROM diagrams WHERE diagrams.id = relationships.diagram_id AND diagrams.is_public = true AND (diagrams.expiry_date IS NULL OR diagrams.expiry_date > NOW())));
CREATE POLICY "Users can manage relationships in their own diagrams" ON relationships FOR ALL USING (EXISTS (SELECT 1 FROM diagrams WHERE diagrams.id = relationships.diagram_id AND diagrams.user_id = auth.uid()));
