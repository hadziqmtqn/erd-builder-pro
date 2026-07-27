-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "is_super_admin" BOOLEAN,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "projects" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uid" TEXT,
    "name" TEXT NOT NULL,
    "user_id" TEXT,
    "color" TEXT DEFAULT '#6366f1',
    "is_deleted" BOOLEAN DEFAULT false,
    "deleted_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "_version" INTEGER DEFAULT 0,
    CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "diagrams" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uid" TEXT,
    "name" TEXT NOT NULL,
    "user_id" TEXT,
    "project_id" INTEGER,
    "is_deleted" BOOLEAN DEFAULT false,
    "deleted_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "viewport_x" REAL DEFAULT 0,
    "viewport_y" REAL DEFAULT 0,
    "viewport_zoom" REAL DEFAULT 1.0,
    "_version" INTEGER DEFAULT 0,
    "is_public" BOOLEAN DEFAULT false,
    "share_token" TEXT,
    "expiry_date" DATETIME,
    "published_at" DATETIME,
    "dbml_source" TEXT,
    CONSTRAINT "diagrams_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "diagrams_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "notes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uid" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT DEFAULT '',
    "user_id" TEXT,
    "project_id" INTEGER,
    "is_deleted" BOOLEAN DEFAULT false,
    "deleted_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "_version" INTEGER DEFAULT 0,
    "is_public" BOOLEAN DEFAULT false,
    "share_token" TEXT,
    "expiry_date" DATETIME,
    "published_at" DATETIME,
    CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "drawings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uid" TEXT,
    "title" TEXT NOT NULL,
    "data" TEXT DEFAULT '[]',
    "user_id" TEXT,
    "project_id" INTEGER,
    "is_deleted" BOOLEAN DEFAULT false,
    "deleted_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "_version" INTEGER DEFAULT 0,
    "is_public" BOOLEAN DEFAULT false,
    "share_token" TEXT,
    "expiry_date" DATETIME,
    "published_at" DATETIME,
    CONSTRAINT "drawings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "drawings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "flowcharts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uid" TEXT,
    "title" TEXT NOT NULL,
    "data" TEXT DEFAULT '{"nodes":[], "edges":[]}',
    "user_id" TEXT,
    "project_id" INTEGER,
    "is_deleted" BOOLEAN DEFAULT false,
    "deleted_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "_version" INTEGER DEFAULT 0,
    "is_public" BOOLEAN DEFAULT false,
    "share_token" TEXT,
    "expiry_date" DATETIME,
    "published_at" DATETIME,
    CONSTRAINT "flowcharts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "flowcharts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "diagram_id" INTEGER,
    "name" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "color" TEXT DEFAULT '#6366f1',
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entities_diagram_id_fkey" FOREIGN KEY ("diagram_id") REFERENCES "diagrams" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "columns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_id" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "is_pk" BOOLEAN DEFAULT false,
    "is_nullable" BOOLEAN DEFAULT true,
    "enum_values" TEXT,
    "comment" TEXT,
    "max_length" INTEGER,
    "numeric_precision" INTEGER,
    "numeric_scale" INTEGER,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "columns_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "diagram_id" INTEGER,
    "source_entity_id" TEXT,
    "target_entity_id" TEXT,
    "source_column_id" TEXT,
    "target_column_id" TEXT,
    "type" TEXT DEFAULT 'one-to-many',
    "source_handle" TEXT,
    "target_handle" TEXT,
    "label" TEXT,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "relationships_diagram_id_fkey" FOREIGN KEY ("diagram_id") REFERENCES "diagrams" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "relationships_source_entity_id_fkey" FOREIGN KEY ("source_entity_id") REFERENCES "entities" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "relationships_target_entity_id_fkey" FOREIGN KEY ("target_entity_id") REFERENCES "entities" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "entity_changes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "user_id" TEXT,
    "changes" TEXT DEFAULT '{}',
    "change_type" TEXT DEFAULT 'update',
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entity_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "backups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "file_path" TEXT,
    "file_size" INTEGER,
    "destinations" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "backups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "base_url" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ai_models" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider_id" INTEGER,
    "model_identifier" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "context_window" INTEGER,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "user_ai_configs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "provider_id" INTEGER,
    "selected_model_id" INTEGER,
    "api_key" TEXT NOT NULL,
    "is_enabled" BOOLEAN DEFAULT true,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_ai_configs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "user_ai_configs_selected_model_id_fkey" FOREIGN KEY ("selected_model_id") REFERENCES "ai_models" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "user_ai_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "ai_chat_sessions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uid" TEXT,
    "user_id" TEXT,
    "project_id" INTEGER,
    "title" TEXT DEFAULT 'New Conversation',
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "entity_uid" TEXT,
    "entity_type" TEXT,
    CONSTRAINT "ai_chat_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "ai_chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "ai_chat_messages" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "session_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "selection_text" TEXT,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_chat_sessions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "ai_system_prompts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'custom',
    "is_default" BOOLEAN DEFAULT false,
    "is_built_in" BOOLEAN DEFAULT false,
    "user_id" TEXT,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_system_prompts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "user_ai_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "view_type" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_ai_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "backup_folder" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "projects_uid_key" ON "projects"("uid");

-- CreateIndex
CREATE INDEX "idx_projects_user_deleted" ON "projects"("user_id", "is_deleted");

-- CreateIndex
CREATE INDEX "idx_projects_updated_at" ON "projects"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "diagrams_uid_key" ON "diagrams"("uid");

-- CreateIndex
CREATE INDEX "idx_diagrams_project_deleted" ON "diagrams"("project_id", "is_deleted");

-- CreateIndex
CREATE INDEX "idx_diagrams_updated_at" ON "diagrams"("updated_at");

-- CreateIndex
CREATE INDEX "idx_diagrams_version" ON "diagrams"("_version");

-- CreateIndex
CREATE UNIQUE INDEX "notes_uid_key" ON "notes"("uid");

-- CreateIndex
CREATE INDEX "idx_notes_project_deleted" ON "notes"("project_id", "is_deleted");

-- CreateIndex
CREATE INDEX "idx_notes_updated_at" ON "notes"("updated_at");

-- CreateIndex
CREATE INDEX "idx_notes_version" ON "notes"("_version");

-- CreateIndex
CREATE UNIQUE INDEX "drawings_uid_key" ON "drawings"("uid");

-- CreateIndex
CREATE INDEX "idx_drawings_project_deleted" ON "drawings"("project_id", "is_deleted");

-- CreateIndex
CREATE INDEX "idx_drawings_updated_at" ON "drawings"("updated_at");

-- CreateIndex
CREATE INDEX "idx_drawings_version" ON "drawings"("_version");

-- CreateIndex
CREATE UNIQUE INDEX "flowcharts_uid_key" ON "flowcharts"("uid");

-- CreateIndex
CREATE INDEX "idx_flowcharts_project_deleted" ON "flowcharts"("project_id", "is_deleted");

-- CreateIndex
CREATE INDEX "idx_flowcharts_updated_at" ON "flowcharts"("updated_at");

-- CreateIndex
CREATE INDEX "idx_flowcharts_version" ON "flowcharts"("_version");

-- CreateIndex
CREATE INDEX "idx_entity_changes_lookup" ON "entity_changes"("entity_type", "entity_id", "version");

-- CreateIndex
CREATE INDEX "idx_entity_changes_retention" ON "entity_changes"("created_at");

-- CreateIndex
CREATE INDEX "idx_entity_changes_user" ON "entity_changes"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_providers_code_key" ON "ai_providers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_ai_configs_user_id_provider_id_key" ON "user_ai_configs"("user_id", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_chat_sessions_uid_key" ON "ai_chat_sessions"("uid");

-- CreateIndex
CREATE INDEX "idx_ai_chat_sessions_entity" ON "ai_chat_sessions"("entity_type", "entity_uid");

-- CreateIndex
CREATE INDEX "idx_ai_chat_sessions_project_id" ON "ai_chat_sessions"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_ai_rules_user_id_view_type_key" ON "user_ai_rules"("user_id", "view_type");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");
