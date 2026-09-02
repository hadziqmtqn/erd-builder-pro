ALTER TABLE "ai_chat_messages" ADD COLUMN "client_message_id" TEXT;

CREATE UNIQUE INDEX "ai_chat_messages_session_id_client_message_id_key"
ON "ai_chat_messages"("session_id", "client_message_id");
