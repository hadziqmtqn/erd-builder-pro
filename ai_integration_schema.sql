-- ==========================================
-- AI INTEGRATION SCHEMA FOR SUPABASE
-- ==========================================

-- 1. AI Providers Table
CREATE TABLE IF NOT EXISTS ai_providers (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL, -- 'OpenAI', 'Google Gemini', etc.
    code TEXT NOT NULL UNIQUE, -- 'openai', 'gemini', 'openai_compatible'
    base_url TEXT DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. AI Models Table
CREATE TABLE IF NOT EXISTS ai_models (
    id BIGSERIAL PRIMARY KEY,
    provider_id BIGINT REFERENCES ai_providers(id) ON DELETE CASCADE,
    model_identifier TEXT NOT NULL, -- 'gpt-4o', 'gemini-1.5-pro'
    display_name TEXT NOT NULL,
    context_window INTEGER DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. User AI Configurations Table
CREATE TABLE IF NOT EXISTS user_ai_configs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    provider_id BIGINT REFERENCES ai_providers(id) ON DELETE CASCADE,
    selected_model_id BIGINT REFERENCES ai_models(id) ON DELETE SET NULL,
    api_key TEXT NOT NULL, -- Recommended: Store encrypted
    is_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider_id)
);

-- 4. AI Chat Sessions Table
-- project_id (FK to projects) is the single source of truth for cross-feature AI context.
-- Instead of storing cached file references in JSONB, we dynamically query
-- all notes/diagrams/flowcharts/drawings WHERE project_id = session.project_id
-- at sendMessage() time. This ensures context is always fresh.
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
    id BIGSERIAL PRIMARY KEY,
    uid UUID DEFAULT gen_random_uuid() UNIQUE,
    user_id UUID, -- Removed FK to auth.users to support Custom Auth IDs and Guest sessions
    project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL, -- FK to projects — query siblings via this
    entity_type TEXT DEFAULT NULL, -- 'note', 'diagram', 'flowchart', 'drawing'
    entity_uid TEXT DEFAULT NULL,  -- UUID of the active note/diagram/flowchart/drawing
    title TEXT DEFAULT 'New Conversation',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. AI Chat Messages Table
CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT REFERENCES ai_chat_sessions(id) ON DELETE CASCADE NOT NULL,
    role TEXT CHECK (role IN ('system', 'user', 'assistant')) NOT NULL,
    content TEXT NOT NULL,
    selection_text TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. System Prompts Table (NEW)
CREATE TABLE IF NOT EXISTS ai_system_prompts (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'custom', -- 'system', 'context', 'format', 'custom'
    is_default BOOLEAN DEFAULT false,
    is_built_in BOOLEAN DEFAULT false,
    user_id VARCHAR(255), -- Support custom auth IDs
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- SECURITY: ROW LEVEL SECURITY (RLS)
-- ==========================================

-- Enable RLS
ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ai_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_system_prompts ENABLE ROW LEVEL SECURITY;

-- Policies for ai_providers & ai_models (Publicly readable by authenticated users)
CREATE POLICY "Users can view active providers" 
ON ai_providers
FOR SELECT 
TO public 
USING (is_active = true);

CREATE POLICY "Users can view active models" 
ON ai_models
FOR SELECT 
TO public 
USING (is_active = true);

-- Allow users to manage the catalog (Optional: change to admin only if needed)
CREATE POLICY "Users can manage models catalog" 
ON ai_models
FOR ALL 
TO public 
USING (true)
WITH CHECK (true);

-- Policies for user_ai_configs
CREATE POLICY "Users can manage their own AI configs" 
ON user_ai_configs
FOR ALL 
TO public
USING (auth.uid() = user_id);

-- Policies for ai_chat_sessions (Public Access for Custom Auth)
DROP POLICY IF EXISTS "policy_ai_chat_sessions_all" ON ai_chat_sessions;
CREATE POLICY "allow_all_sessions_access" 
ON ai_chat_sessions FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- Policies for ai_chat_messages (Public Access for Custom Auth)
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

-- Policies for ai_system_prompts (NEW - Optimized for Custom Auth)
CREATE POLICY "Allow application access for ai_system_prompts" 
ON ai_system_prompts
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- ==========================================
-- TRIGGERS
-- ==========================================

-- Trigger to manage 'is_default' (Only one active prompt per user)
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

-- ==========================================
-- INITIAL DATA: SEEDING
-- ==========================================

-- Seed Providers
INSERT INTO ai_providers (name, code, base_url) VALUES 
('OpenAI', 'openai', 'https://api.openai.com/v1'),
('Google Gemini', 'gemini', NULL),
('OpenAI Compatible', 'openai_compatible', 'https://ai.sumopod.com/v1')
ON CONFLICT (code) DO NOTHING;

-- Seed Models
-- Note: Using subqueries to ensure correct provider_id mapping
INSERT INTO ai_models (provider_id, model_identifier, display_name)
SELECT id, 'gpt-4o', 'GPT-4o (Smartest)' FROM ai_providers WHERE code = 'openai'
UNION ALL
SELECT id, 'gpt-4o-mini', 'GPT-4o Mini (Fast)' FROM ai_providers WHERE code = 'openai'
UNION ALL
SELECT id, 'gemini-1.5-pro', 'Gemini 1.5 Pro' FROM ai_providers WHERE code = 'gemini'
UNION ALL
SELECT id, 'gemini-1.5-flash', 'Gemini 1.5 Flash' FROM ai_providers WHERE code = 'gemini'
ON CONFLICT DO NOTHING;
