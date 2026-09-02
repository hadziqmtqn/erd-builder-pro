-- ==========================================
-- SUPABASE SCHEMA — ERD Builder Pro
-- ==========================================
-- Requires: auth.users (Supabase built-in)
-- Run on Supabase SQL Editor or migration.
-- ==========================================

-- ========================
-- 1. MAIN APP TABLES
-- ========================

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
  _version INTEGER DEFAULT 0,
  source_type TEXT DEFAULT 'blank',
  source_connection_id INTEGER,
  data TEXT,
  dbml_source TEXT
);

-- Entities Table
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  diagram_id BIGINT REFERENCES diagrams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  x DOUBLE PRECISION DEFAULT 0,
  y DOUBLE PRECISION DEFAULT 0,
  color TEXT DEFAULT '#6366f1',
  comment TEXT,
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
  is_unique BOOLEAN DEFAULT FALSE,
  default_value TEXT,
  enum_values TEXT, -- comma separated
  comment TEXT,
  max_length INTEGER,
  numeric_precision INTEGER,
  numeric_scale INTEGER,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  on_delete TEXT,
  on_update TEXT,
  constraint_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table Constraints and Indexes Metadata
CREATE TABLE IF NOT EXISTS table_constraints (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT,
  column_ids TEXT,
  expression TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS table_indexes (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  column_ids TEXT NOT NULL,
  is_unique BOOLEAN DEFAULT FALSE,
  algorithm TEXT,
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

-- Entity Changes Table (Audit Trail)
CREATE TABLE IF NOT EXISTS entity_changes (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL, -- 'diagrams', 'notes', 'drawings', 'flowcharts'
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changes JSONB NOT NULL, -- normalized document snapshot
  change_type TEXT DEFAULT 'update', -- 'create', 'update', 'delete', 'pre_restore', 'restore'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- 2. AI INTEGRATION TABLES
-- ========================

-- AI Providers Table
CREATE TABLE IF NOT EXISTS ai_providers (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL, -- 'OpenAI', 'Google Gemini', etc.
    code TEXT NOT NULL UNIQUE, -- 'openai', 'gemini', 'openai_compatible'
    base_url TEXT DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Models Table
CREATE TABLE IF NOT EXISTS ai_models (
    id BIGSERIAL PRIMARY KEY,
    provider_id BIGINT REFERENCES ai_providers(id) ON DELETE RESTRICT,
    model_identifier TEXT NOT NULL, -- 'gpt-4o', 'gemini-1.5-pro'
    display_name TEXT NOT NULL,
    context_window INTEGER DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backups Table
CREATE TABLE IF NOT EXISTS backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    file_path TEXT,
    file_size BIGINT,
    destinations TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Preferences Table
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    backup_folder TEXT,
    auto_backup_enabled BOOLEAN DEFAULT FALSE,
    auto_backup_interval INTEGER DEFAULT 3600,
    auto_backup_retention INTEGER DEFAULT 10,
    storage_config TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User AI Configurations Table
CREATE TABLE IF NOT EXISTS user_ai_configs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    provider_id BIGINT REFERENCES ai_providers(id) ON DELETE CASCADE,
    selected_model_id BIGINT REFERENCES ai_models(id) ON DELETE RESTRICT,
    api_key TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider_id)
);

-- AI Chat Sessions Table
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
    id BIGSERIAL PRIMARY KEY,
    uid UUID DEFAULT gen_random_uuid() UNIQUE,
    user_id UUID,
    project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
    entity_type TEXT DEFAULT NULL,
    entity_uid TEXT DEFAULT NULL,
    title TEXT DEFAULT 'New Conversation',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Chat Messages Table
CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT REFERENCES ai_chat_sessions(id) ON DELETE CASCADE NOT NULL,
    role TEXT CHECK (role IN ('system', 'user', 'assistant')) NOT NULL,
    content TEXT NOT NULL,
    selection_text TEXT DEFAULT NULL,
    client_message_id VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_chat_messages ADD COLUMN IF NOT EXISTS client_message_id VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS ai_chat_messages_session_id_client_message_id_key
ON ai_chat_messages(session_id, client_message_id);

-- System Prompts Table
CREATE TABLE IF NOT EXISTS ai_system_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'custom', -- 'system', 'context', 'format', 'custom'
    is_default BOOLEAN DEFAULT false,
    is_built_in BOOLEAN DEFAULT false,
    user_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Rules Table
CREATE TABLE IF NOT EXISTS user_ai_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    view_type TEXT NOT NULL CHECK (view_type IN ('erd', 'notes', 'flowchart')),
    content TEXT NOT NULL DEFAULT '',
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, view_type)
);

-- ========================
-- 3. INDEXES
-- ========================

CREATE INDEX IF NOT EXISTS idx_entity_changes_lookup ON entity_changes(entity_type, entity_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_entity_changes_user ON entity_changes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_changes_retention ON entity_changes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_changes_entity_id ON entity_changes(entity_id);

CREATE INDEX IF NOT EXISTS idx_diagrams_project_deleted ON diagrams(project_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_notes_project_deleted ON notes(project_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_drawings_project_deleted ON drawings(project_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_flowcharts_project_deleted ON flowcharts(project_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_diagrams_version ON diagrams(_version);
CREATE INDEX IF NOT EXISTS idx_diagrams_updated_at ON diagrams(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_version ON notes(_version);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawings_version ON drawings(_version);
CREATE INDEX IF NOT EXISTS idx_drawings_updated_at ON drawings(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_flowcharts_version ON flowcharts(_version);
CREATE INDEX IF NOT EXISTS idx_flowcharts_updated_at ON flowcharts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_table_constraints_entity ON table_constraints(entity_id);
CREATE INDEX IF NOT EXISTS idx_table_indexes_entity ON table_indexes(entity_id);

-- ========================
-- 4. ROW LEVEL SECURITY
-- ========================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagrams ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_indexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE flowcharts ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- AI tables
ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ai_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_system_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ai_rules ENABLE ROW LEVEL SECURITY;

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

-- Entity Changes Policies
CREATE POLICY "Users can insert their own entity changes" ON entity_changes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own entity changes" ON entity_changes FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Entities Policies
CREATE POLICY "Anyone can view entities of public diagrams" ON entities FOR SELECT USING (EXISTS (SELECT 1 FROM diagrams WHERE diagrams.id = entities.diagram_id AND diagrams.is_public = true AND (diagrams.expiry_date IS NULL OR diagrams.expiry_date > NOW())));
CREATE POLICY "Users can manage entities in their own diagrams" ON entities FOR ALL USING (EXISTS (SELECT 1 FROM diagrams WHERE diagrams.id = entities.diagram_id AND diagrams.user_id = auth.uid()));

-- Columns Policies
CREATE POLICY "Anyone can view columns of public diagrams" ON columns FOR SELECT USING (EXISTS (SELECT 1 FROM entities JOIN diagrams ON diagrams.id = entities.diagram_id WHERE entities.id = columns.entity_id AND diagrams.is_public = true AND (diagrams.expiry_date IS NULL OR diagrams.expiry_date > NOW())));
CREATE POLICY "Users can manage columns in their own diagrams" ON columns FOR ALL USING (EXISTS (SELECT 1 FROM entities JOIN diagrams ON diagrams.id = entities.diagram_id WHERE entities.id = columns.entity_id AND diagrams.user_id = auth.uid()));

-- Relationships Policies
CREATE POLICY "Anyone can view relationships of public diagrams" ON relationships FOR SELECT USING (EXISTS (SELECT 1 FROM diagrams WHERE diagrams.id = relationships.diagram_id AND diagrams.is_public = true AND (diagrams.expiry_date IS NULL OR diagrams.expiry_date > NOW())));
CREATE POLICY "Users can manage relationships in their own diagrams" ON relationships FOR ALL USING (EXISTS (SELECT 1 FROM diagrams WHERE diagrams.id = relationships.diagram_id AND diagrams.user_id = auth.uid()));

-- Table Constraints Policies
CREATE POLICY "Anyone can view constraints of public diagrams" ON table_constraints FOR SELECT USING (EXISTS (SELECT 1 FROM entities JOIN diagrams ON diagrams.id = entities.diagram_id WHERE entities.id = table_constraints.entity_id AND diagrams.is_public = true AND (diagrams.expiry_date IS NULL OR diagrams.expiry_date > NOW())));
CREATE POLICY "Users can manage constraints in their own diagrams" ON table_constraints FOR ALL USING (EXISTS (SELECT 1 FROM entities JOIN diagrams ON diagrams.id = entities.diagram_id WHERE entities.id = table_constraints.entity_id AND diagrams.user_id = auth.uid()));

-- Table Index Policies
CREATE POLICY "Anyone can view indexes of public diagrams" ON table_indexes FOR SELECT USING (EXISTS (SELECT 1 FROM entities JOIN diagrams ON diagrams.id = entities.diagram_id WHERE entities.id = table_indexes.entity_id AND diagrams.is_public = true AND (diagrams.expiry_date IS NULL OR diagrams.expiry_date > NOW())));
CREATE POLICY "Users can manage indexes in their own diagrams" ON table_indexes FOR ALL USING (EXISTS (SELECT 1 FROM entities JOIN diagrams ON diagrams.id = entities.diagram_id WHERE entities.id = table_indexes.entity_id AND diagrams.user_id = auth.uid()));

-- AI Providers Policies (Publicly readable)
CREATE POLICY "Users can view active providers"
ON ai_providers
FOR SELECT
TO public
USING (is_active = true);

-- AI Models Policies (Publicly readable)
CREATE POLICY "Users can view active models"
ON ai_models
FOR SELECT
TO public
USING (is_active = true);

CREATE POLICY "Users can manage models catalog"
ON ai_models
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- User AI Configs Policies
CREATE POLICY "Users can manage their own AI configs"
ON user_ai_configs
FOR ALL
TO public
USING (auth.uid() = user_id);

-- AI Chat Sessions Policies
DROP POLICY IF EXISTS "policy_ai_chat_sessions_all" ON ai_chat_sessions;
CREATE POLICY "allow_all_sessions_access"
ON ai_chat_sessions FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- AI Chat Messages Policies
DROP POLICY IF EXISTS "policy_ai_chat_messages_all" ON ai_chat_messages;
CREATE POLICY "allow_all_messages_access"
ON ai_chat_messages FOR ALL
TO public
USING (
    EXISTS (SELECT 1 FROM ai_chat_sessions WHERE ai_chat_sessions.id = ai_chat_messages.session_id)
)
WITH CHECK (
    EXISTS (SELECT 1 FROM ai_chat_sessions WHERE ai_chat_sessions.id = ai_chat_messages.session_id)
);

-- AI System Prompts Policies
CREATE POLICY "Allow application access for ai_system_prompts"
ON ai_system_prompts
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- AI Rules Policies
CREATE POLICY "Users can manage own AI rules"
ON user_ai_rules
FOR ALL
TO public
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ========================
-- 5. TRIGGERS
-- ========================

-- Version increment for optimistic locking
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW._version = COALESCE(OLD._version, 0) + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Audit trail: captures full row snapshot
CREATE OR REPLACE FUNCTION log_entity_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_changes JSONB;
  v_version INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    BEGIN
      v_user_id := NEW.user_id;
    EXCEPTION WHEN OTHERS THEN
      v_user_id := NULL;
    END;
  END IF;

  v_changes := to_jsonb(NEW) - ARRAY['share_token', 'user_id'];
  v_version := COALESCE((to_jsonb(NEW)->>'_version')::INTEGER, 0);

  -- Throttle: skip if last snapshot < 5 min ago
  IF TG_OP = 'UPDATE' THEN
    IF EXISTS (
      SELECT 1 FROM entity_changes
      WHERE entity_type = TG_TABLE_NAME
      AND entity_id = NEW.id::TEXT
      AND created_at > NOW() - INTERVAL '5 minutes'
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO entity_changes (entity_type, entity_id, version, user_id, changes, change_type)
  VALUES (TG_TABLE_NAME, NEW.id::TEXT, v_version, v_user_id, v_changes, LOWER(TG_OP));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply version + audit triggers per table
-- Diagrams
DROP TRIGGER IF EXISTS tr_diagrams_version ON diagrams;
CREATE TRIGGER tr_diagrams_version BEFORE UPDATE ON diagrams FOR EACH ROW EXECUTE FUNCTION increment_version();

-- Notes
DROP TRIGGER IF EXISTS tr_notes_version ON notes;
CREATE TRIGGER tr_notes_version BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION increment_version();
DROP TRIGGER IF EXISTS tr_notes_audit ON notes;
CREATE TRIGGER tr_notes_audit AFTER INSERT OR UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION log_entity_changes();

-- Drawings
DROP TRIGGER IF EXISTS tr_drawings_version ON drawings;
CREATE TRIGGER tr_drawings_version BEFORE UPDATE ON drawings FOR EACH ROW EXECUTE FUNCTION increment_version();
DROP TRIGGER IF EXISTS tr_drawings_audit ON drawings;
CREATE TRIGGER tr_drawings_audit AFTER INSERT OR UPDATE ON drawings FOR EACH ROW EXECUTE FUNCTION log_entity_changes();

-- Flowcharts
DROP TRIGGER IF EXISTS tr_flowcharts_version ON flowcharts;
CREATE TRIGGER tr_flowcharts_version BEFORE UPDATE ON flowcharts FOR EACH ROW EXECUTE FUNCTION increment_version();
DROP TRIGGER IF EXISTS tr_flowcharts_audit ON flowcharts;
CREATE TRIGGER tr_flowcharts_audit AFTER INSERT OR UPDATE ON flowcharts FOR EACH ROW EXECUTE FUNCTION log_entity_changes();

-- AI: ensure only one default prompt per user
CREATE OR REPLACE FUNCTION handle_single_default_prompt()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE ai_system_prompts
        SET is_default = false
        WHERE id != NEW.id AND user_id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS single_default_prompt_trigger ON ai_system_prompts;
CREATE TRIGGER single_default_prompt_trigger
BEFORE INSERT OR UPDATE ON ai_system_prompts
FOR EACH ROW EXECUTE FUNCTION handle_single_default_prompt();

-- Auto-update updated_at on AI rules
CREATE OR REPLACE FUNCTION update_ai_rules_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_rules_updated_at_trigger ON user_ai_rules;
CREATE TRIGGER ai_rules_updated_at_trigger
BEFORE UPDATE ON user_ai_rules
FOR EACH ROW EXECUTE FUNCTION update_ai_rules_timestamp();

-- ========================
-- 6. SEED DATA
-- ========================

-- Seed AI Providers
INSERT INTO ai_providers (name, code, base_url) VALUES
('OpenAI', 'openai', 'https://api.openai.com/v1'),
('Google Gemini', 'gemini', 'https://generativelanguage.googleapis.com/v1beta'),
('OpenAI Compatible', 'openai_compatible', 'https://ai.paas.id')
ON CONFLICT (code) DO NOTHING;

-- Seed AI Models
INSERT INTO ai_models (provider_id, model_identifier, display_name)
SELECT id, 'gpt-4o', 'GPT-4o (Smartest)' FROM ai_providers WHERE code = 'openai'
UNION ALL
SELECT id, 'gpt-4o-mini', 'GPT-4o Mini (Fast)' FROM ai_providers WHERE code = 'openai'
UNION ALL
SELECT id, 'gemini-1.5-pro', 'Gemini 1.5 Pro' FROM ai_providers WHERE code = 'gemini'
UNION ALL
SELECT id, 'gemini-1.5-flash', 'Gemini 1.5 Flash' FROM ai_providers WHERE code = 'gemini'
ON CONFLICT DO NOTHING;

-- Seed AI Rules for existing users (auto-seeded server-side also)
INSERT INTO user_ai_rules (user_id, view_type, content, is_enabled)
SELECT
    id,
    unnest(ARRAY['erd', 'notes', 'flowchart']),
    unnest(ARRAY[
        '- Setiap tabel harus memiliki kolom created_at dan updated_at dengan tipe TIMESTAMP.\n- Gunakan snake_case untuk semua penamaan tabel dan kolom.\n- Untuk skema ERD, output schema harus menggunakan DBML dalam code block ```dbml kecuali user eksplisit meminta SQL.\n- Setiap tabel harus memiliki primary key bernama id dengan tipe BIGINT atau UUID.\n- Gunakan Ref DBML untuk foreign key dan nama kolom relasi berakhiran _id.\n- Gunakan Enum DBML hanya jika value benar-benar terbatas dan reusable.\n- Tambahkan kolom deleted_at untuk soft delete pada tabel master.',
        '- Gunakan bahasa Indonesia untuk isi catatan.\n- Struktur: gunakan heading, bullet points, dan code block.\n- Setiap catatan harus memiliki summary di awal.\n- Gunakan bahasa formal dan hindari slang.',
        '- Gunakan label singkat dan jelas (maks 3 kata per simbol).\n- Setiap diagram harus memiliki minimal satu Start dan satu End node.\n- Beri nama yang deskriptif pada setiap cabang (decision label).'
    ]),
    true
FROM auth.users
ON CONFLICT (user_id, view_type) DO NOTHING;
