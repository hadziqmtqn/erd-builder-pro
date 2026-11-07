-- CLD-013.3 Trial survey panel state. Additive: no row means the panel has not been dismissed or submitted.

CREATE TABLE IF NOT EXISTS "user_trial_surveys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "survey_key" TEXT NOT NULL,
    "hidden_until" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_trial_surveys_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "user_trial_surveys_team_id_fkey"
      FOREIGN KEY ("team_id") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_trial_surveys_user_team_survey_key"
ON "user_trial_surveys"("user_id", "team_id", "survey_key");
