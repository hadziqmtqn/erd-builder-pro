ALTER TABLE "projects" ADD COLUMN "team_id" TEXT;

CREATE TABLE "teams" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'team',
    "created_by" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "license_id" TEXT,
    "license_code_last_four" TEXT,
    "license_status" TEXT NOT NULL DEFAULT 'active',
    "license_expires_at" DATETIME,
    "max_members" INTEGER,
    "binding_generation" INTEGER DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE "team_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "joined_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "team_invitations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "team_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "accepted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "team_license_entitlements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "team_id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "license_id" TEXT NOT NULL,
    "installation_id" TEXT NOT NULL,
    "encrypted_client_token" TEXT NOT NULL,
    "signed_entitlement" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "grace_until" DATETIME,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_license_entitlements_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "team_audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "team_id" TEXT,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_audit_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "team_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "teams_license_id_key" ON "teams"("license_id");
CREATE INDEX "idx_teams_license_status" ON "teams"("license_status");
CREATE UNIQUE INDEX "team_members_team_user_key" ON "team_members"("team_id", "user_id");
CREATE INDEX "idx_team_members_user_status" ON "team_members"("user_id", "status");
CREATE UNIQUE INDEX "team_members_one_active_user_key" ON "team_members"("user_id") WHERE "status" = 'active';
CREATE UNIQUE INDEX "team_invitations_token_hash_key" ON "team_invitations"("token_hash");
CREATE INDEX "idx_team_invitations_team_expires" ON "team_invitations"("team_id", "expires_at");
CREATE INDEX "idx_team_invitations_email_accepted" ON "team_invitations"("email", "accepted_at");
CREATE UNIQUE INDEX "team_license_entitlements_activation_id_key" ON "team_license_entitlements"("activation_id");
CREATE INDEX "idx_team_license_entitlements_team_status" ON "team_license_entitlements"("team_id", "status");
CREATE INDEX "idx_team_license_entitlements_license" ON "team_license_entitlements"("license_id");
CREATE INDEX "idx_team_audit_events_team_created" ON "team_audit_events"("team_id", "created_at");
CREATE INDEX "idx_team_audit_events_actor_created" ON "team_audit_events"("actor_id", "created_at");
CREATE INDEX "idx_projects_team_deleted" ON "projects"("team_id", "is_deleted");
