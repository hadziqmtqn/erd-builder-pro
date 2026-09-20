ALTER TABLE "ai_chat_messages"
ADD COLUMN "is_trusted_assistant" BOOLEAN NOT NULL DEFAULT false;
