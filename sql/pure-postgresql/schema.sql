-- -------------------------------------------------------------
-- TablePlus 6.0.0(550)
--
-- https://tableplus.com/
--
-- Database: erdbuilderpro
-- Generation Time: 2026-06-16 07:09:40.8790
-- -------------------------------------------------------------


-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS ai_chat_messages_id_seq;

-- Table Definition
CREATE TABLE "public"."ai_chat_messages" (
    "id" int4 NOT NULL DEFAULT nextval('ai_chat_messages_id_seq'::regclass),
    "session_id" int4 NOT NULL,
    "role" text NOT NULL,
    "content" text NOT NULL,
    "selection_text" text,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS ai_chat_sessions_id_seq;

-- Table Definition
CREATE TABLE "public"."ai_chat_sessions" (
    "id" int4 NOT NULL DEFAULT nextval('ai_chat_sessions_id_seq'::regclass),
    "uid" text,
    "user_id" text,
    "project_id" int4,
    "title" text DEFAULT 'New Conversation'::text,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "entity_uid" text,
    "entity_type" text,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS ai_models_id_seq;

-- Table Definition
CREATE TABLE "public"."ai_models" (
    "id" int4 NOT NULL DEFAULT nextval('ai_models_id_seq'::regclass),
    "provider_id" int4,
    "model_identifier" text NOT NULL,
    "display_name" text NOT NULL,
    "context_window" int4,
    "is_active" bool DEFAULT true,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS ai_providers_id_seq;

-- Table Definition
CREATE TABLE "public"."ai_providers" (
    "id" int4 NOT NULL DEFAULT nextval('ai_providers_id_seq'::regclass),
    "name" text NOT NULL,
    "code" text NOT NULL,
    "base_url" text,
    "is_active" bool DEFAULT true,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Table Definition
CREATE TABLE "public"."ai_system_prompts" (
    "id" text NOT NULL,
    "name" text NOT NULL,
    "content" text NOT NULL,
    "category" text NOT NULL DEFAULT 'custom'::text,
    "is_default" bool DEFAULT false,
    "is_built_in" bool DEFAULT false,
    "user_id" text,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Table Definition
CREATE TABLE "public"."backups" (
    "id" text NOT NULL,
    "user_id" text,
    "name" text NOT NULL,
    "status" text NOT NULL DEFAULT 'pending'::text,
    "file_path" text,
    "file_size" int4,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Table Definition
CREATE TABLE "public"."columns" (
    "id" text NOT NULL,
    "entity_id" text,
    "name" text NOT NULL,
    "type" text NOT NULL,
    "is_pk" bool DEFAULT false,
    "is_nullable" bool DEFAULT true,
    "is_unique" bool DEFAULT false,
    "default_value" text,
    "enum_values" text,
    "sort_order" int4 DEFAULT 0,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- NOTE: db_accounts and db_catalogs omitted — desktop-only (SQLite), not used in pure PostgreSQL.

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS diagrams_id_seq;

-- Table Definition
CREATE TABLE "public"."diagrams" (
    "id" int4 NOT NULL DEFAULT nextval('diagrams_id_seq'::regclass),
    "uid" text,
    "name" text NOT NULL,
    "user_id" text,
    "project_id" int4,
    "is_deleted" bool DEFAULT false,
    "deleted_at" timestamp(3),
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "viewport_x" float8 DEFAULT 0,
    "viewport_y" float8 DEFAULT 0,
    "viewport_zoom" float8 DEFAULT 1.0,
    "_version" int4 DEFAULT 0,
    "is_public" bool DEFAULT false,
    "share_token" text,
    "expiry_date" timestamp(3),
    "published_at" timestamp(3),
    "source_connection_id" int4,
    "source_type" text DEFAULT 'blank'::text,
    "data" text,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS drawings_id_seq;

-- Table Definition
CREATE TABLE "public"."drawings" (
    "id" int4 NOT NULL DEFAULT nextval('drawings_id_seq'::regclass),
    "uid" text,
    "title" text NOT NULL,
    "data" text DEFAULT '[]'::text,
    "user_id" text,
    "project_id" int4,
    "is_deleted" bool DEFAULT false,
    "deleted_at" timestamp(3),
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "_version" int4 DEFAULT 0,
    "is_public" bool DEFAULT false,
    "share_token" text,
    "expiry_date" timestamp(3),
    "published_at" timestamp(3),
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Table Definition
CREATE TABLE "public"."entities" (
    "id" text NOT NULL,
    "diagram_id" int4,
    "name" text NOT NULL,
    "x" float8 NOT NULL,
    "y" float8 NOT NULL,
    "color" text DEFAULT '#6366f1'::text,
    "comment" text,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS entity_changes_id_seq;

-- Table Definition
CREATE TABLE "public"."entity_changes" (
    "id" int4 NOT NULL DEFAULT nextval('entity_changes_id_seq'::regclass),
    "entity_type" text NOT NULL,
    "entity_id" text NOT NULL,
    "version" int4 NOT NULL,
    "user_id" text,
    "changes" text DEFAULT '{}'::text,
    "change_type" text DEFAULT 'update'::text,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS flowcharts_id_seq;

-- Table Definition
CREATE TABLE "public"."flowcharts" (
    "id" int4 NOT NULL DEFAULT nextval('flowcharts_id_seq'::regclass),
    "uid" text,
    "title" text NOT NULL,
    "data" text DEFAULT '{"nodes":[], "edges":[]}'::text,
    "user_id" text,
    "project_id" int4,
    "is_deleted" bool DEFAULT false,
    "deleted_at" timestamp(3),
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "_version" int4 DEFAULT 0,
    "is_public" bool DEFAULT false,
    "share_token" text,
    "expiry_date" timestamp(3),
    "published_at" timestamp(3),
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS notes_id_seq;

-- Table Definition
CREATE TABLE "public"."notes" (
    "id" int4 NOT NULL DEFAULT nextval('notes_id_seq'::regclass),
    "uid" text,
    "title" text NOT NULL,
    "content" text DEFAULT ''::text,
    "user_id" text,
    "project_id" int4,
    "is_deleted" bool DEFAULT false,
    "deleted_at" timestamp(3),
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "_version" int4 DEFAULT 0,
    "is_public" bool DEFAULT false,
    "share_token" text,
    "expiry_date" timestamp(3),
    "published_at" timestamp(3),
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS projects_id_seq;

-- Table Definition
CREATE TABLE "public"."projects" (
    "id" int4 NOT NULL DEFAULT nextval('projects_id_seq'::regclass),
    "uid" text,
    "name" text NOT NULL,
    "user_id" text,
    "color" text DEFAULT '#6366f1'::text,
    "is_deleted" bool DEFAULT false,
    "deleted_at" timestamp(3),
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    "_version" int4 DEFAULT 0,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Table Definition
CREATE TABLE "public"."relationships" (
    "id" text NOT NULL,
    "diagram_id" int4,
    "source_entity_id" text,
    "target_entity_id" text,
    "source_column_id" text,
    "target_column_id" text,
    "type" text DEFAULT 'one-to-many'::text,
    "source_handle" text,
    "target_handle" text,
    "label" text,
    "on_delete" text,
    "on_update" text,
    "constraint_name" text,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- Table Definition
CREATE TABLE "public"."table_constraints" (
    "id" text NOT NULL,
    "entity_id" text NOT NULL,
    "kind" text NOT NULL,
    "name" text,
    "column_ids" text,
    "expression" text,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- Table Definition
CREATE TABLE "public"."table_indexes" (
    "id" text NOT NULL,
    "entity_id" text NOT NULL,
    "name" text NOT NULL,
    "column_ids" text NOT NULL,
    "is_unique" bool DEFAULT false,
    "algorithm" text,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Table Definition
CREATE TABLE "public"."sessions" (
    "id" text NOT NULL,
    "token" text NOT NULL,
    "user_id" text NOT NULL,
    "email" text NOT NULL,
    "name" text,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS user_ai_configs_id_seq;

-- Table Definition
CREATE TABLE "public"."user_ai_configs" (
    "id" int4 NOT NULL DEFAULT nextval('user_ai_configs_id_seq'::regclass),
    "user_id" text NOT NULL,
    "provider_id" int4,
    "selected_model_id" int4,
    "api_key" text,
    "is_enabled" bool DEFAULT true,
    "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Table Definition
CREATE TABLE "public"."user_ai_rules" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "view_type" text NOT NULL,
    "content" text NOT NULL DEFAULT ''::text,
    "is_enabled" bool NOT NULL DEFAULT true,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Table Definition
CREATE TABLE "public"."user_preferences" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "backup_folder" text,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- This script only contains the table creation statements and does not fully represent the table in the database. Do not use it as a backup.

-- Table Definition
CREATE TABLE "public"."users" (
    "id" text NOT NULL,
    "email" text NOT NULL,
    "name" text,
    "password" text NOT NULL,
    "is_super_admin" bool,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

ALTER TABLE "public"."ai_chat_messages" ADD FOREIGN KEY ("session_id") REFERENCES "public"."ai_chat_sessions"("id") ON DELETE CASCADE;
ALTER TABLE "public"."ai_chat_sessions" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
ALTER TABLE "public"."ai_chat_sessions" ADD FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;


-- Indices
CREATE UNIQUE INDEX ai_chat_sessions_uid_key ON public.ai_chat_sessions USING btree (uid);
CREATE INDEX idx_ai_chat_sessions_entity ON public.ai_chat_sessions USING btree (entity_type, entity_uid);
CREATE INDEX idx_ai_chat_sessions_project_id ON public.ai_chat_sessions USING btree (project_id);
ALTER TABLE "public"."ai_models" ADD FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE RESTRICT;


-- Indices
CREATE UNIQUE INDEX ai_providers_code_key ON public.ai_providers USING btree (code);
ALTER TABLE "public"."ai_system_prompts" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
ALTER TABLE "public"."backups" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
ALTER TABLE "public"."columns" ADD FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;


-- Indices
ALTER TABLE "public"."diagrams" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
ALTER TABLE "public"."diagrams" ADD FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;


-- Indices
CREATE UNIQUE INDEX diagrams_uid_key ON public.diagrams USING btree (uid);
CREATE INDEX idx_diagrams_project_deleted ON public.diagrams USING btree (project_id, is_deleted);
CREATE INDEX idx_diagrams_updated_at ON public.diagrams USING btree (updated_at);
CREATE INDEX idx_diagrams_version ON public.diagrams USING btree (_version);
ALTER TABLE "public"."drawings" ADD FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;
ALTER TABLE "public"."drawings" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


-- Indices
CREATE UNIQUE INDEX drawings_uid_key ON public.drawings USING btree (uid);
CREATE INDEX idx_drawings_project_deleted ON public.drawings USING btree (project_id, is_deleted);
CREATE INDEX idx_drawings_updated_at ON public.drawings USING btree (updated_at);
CREATE INDEX idx_drawings_version ON public.drawings USING btree (_version);
ALTER TABLE "public"."entities" ADD FOREIGN KEY ("diagram_id") REFERENCES "public"."diagrams"("id") ON DELETE CASCADE;
ALTER TABLE "public"."table_constraints" ADD FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;
ALTER TABLE "public"."table_indexes" ADD FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;
ALTER TABLE "public"."entity_changes" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


-- Indices
CREATE INDEX idx_entity_changes_lookup ON public.entity_changes USING btree (entity_type, entity_id, version);
CREATE INDEX idx_entity_changes_retention ON public.entity_changes USING btree (created_at);
CREATE INDEX idx_entity_changes_user ON public.entity_changes USING btree (user_id, created_at);
CREATE INDEX idx_table_constraints_entity ON public.table_constraints USING btree (entity_id);
CREATE INDEX idx_table_indexes_entity ON public.table_indexes USING btree (entity_id);
ALTER TABLE "public"."flowcharts" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
ALTER TABLE "public"."flowcharts" ADD FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;


-- Indices
CREATE UNIQUE INDEX flowcharts_uid_key ON public.flowcharts USING btree (uid);
CREATE INDEX idx_flowcharts_project_deleted ON public.flowcharts USING btree (project_id, is_deleted);
CREATE INDEX idx_flowcharts_updated_at ON public.flowcharts USING btree (updated_at);
CREATE INDEX idx_flowcharts_version ON public.flowcharts USING btree (_version);
ALTER TABLE "public"."notes" ADD FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;
ALTER TABLE "public"."notes" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


-- Indices
CREATE UNIQUE INDEX notes_uid_key ON public.notes USING btree (uid);
CREATE INDEX idx_notes_project_deleted ON public.notes USING btree (project_id, is_deleted);
CREATE INDEX idx_notes_updated_at ON public.notes USING btree (updated_at);
CREATE INDEX idx_notes_version ON public.notes USING btree (_version);
ALTER TABLE "public"."projects" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


-- Indices
CREATE UNIQUE INDEX projects_uid_key ON public.projects USING btree (uid);
CREATE INDEX idx_projects_user_deleted ON public.projects USING btree (user_id, is_deleted);
CREATE INDEX idx_projects_updated_at ON public.projects USING btree (updated_at);
ALTER TABLE "public"."relationships" ADD FOREIGN KEY ("source_entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;
ALTER TABLE "public"."relationships" ADD FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;
ALTER TABLE "public"."relationships" ADD FOREIGN KEY ("diagram_id") REFERENCES "public"."diagrams"("id") ON DELETE CASCADE;
ALTER TABLE "public"."sessions" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


-- Indices
CREATE UNIQUE INDEX sessions_token_key ON public.sessions USING btree (token);
CREATE INDEX sessions_token_idx ON public.sessions USING btree (token);
ALTER TABLE "public"."user_ai_configs" ADD FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE CASCADE;
ALTER TABLE "public"."user_ai_configs" ADD FOREIGN KEY ("selected_model_id") REFERENCES "public"."ai_models"("id") ON DELETE RESTRICT;
ALTER TABLE "public"."user_ai_configs" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


-- Indices
CREATE UNIQUE INDEX user_ai_configs_user_id_provider_id_key ON public.user_ai_configs USING btree (user_id, provider_id);
ALTER TABLE "public"."user_ai_rules" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


-- Indices
CREATE UNIQUE INDEX user_ai_rules_user_id_view_type_key ON public.user_ai_rules USING btree (user_id, view_type);
ALTER TABLE "public"."user_preferences" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


-- Indices
CREATE UNIQUE INDEX user_preferences_user_id_key ON public.user_preferences USING btree (user_id);


-- Indices
CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);
