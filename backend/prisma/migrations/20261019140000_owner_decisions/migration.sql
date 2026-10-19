-- Owner decisions of 2026-10-19 (DEC-119 to DEC-124).
-- Indexes for foreign keys and the hashtag prefix index come from the Prisma schema diff.

-- DEC-121: indexes on the 11 foreign-key columns that had no leading index.
-- CreateIndex
CREATE INDEX "bookmarks_question_id_idx" ON "bookmarks"("question_id");

-- CreateIndex
CREATE INDEX "conversations_initiated_by_id_idx" ON "conversations"("initiated_by_id");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "messages_shared_question_id_idx" ON "messages"("shared_question_id");

-- CreateIndex
CREATE INDEX "notifications_actor_id_idx" ON "notifications"("actor_id");

-- CreateIndex
CREATE INDEX "notifications_question_id_idx" ON "notifications"("question_id");

-- CreateIndex
CREATE INDEX "notifications_reply_id_idx" ON "notifications"("reply_id");

-- CreateIndex
CREATE INDEX "reports_reporter_id_idx" ON "reports"("reporter_id");

-- CreateIndex
CREATE INDEX "reports_reviewed_by_id_idx" ON "reports"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "support_threads_closed_by_id_idx" ON "support_threads"("closed_by_id");

-- CreateIndex
CREATE INDEX "support_messages_author_user_id_idx" ON "support_messages"("author_user_id");

-- DEC-122: prefix search on hashtags (suggestions while typing).
-- CreateIndex
CREATE INDEX "hashtags_name_idx" ON "hashtags"("name" text_pattern_ops);

-- DEC-120: full-text search with the 'french' text search configuration.
-- Replaces the 'simple' indexes created in migration 20261019131646_constraints.
DROP INDEX "questions_body_fts_idx";
DROP INDEX "users_handle_fts_idx";
DROP INDEX "users_display_name_fts_idx";

CREATE INDEX "questions_body_fts_idx" ON "questions" USING GIN (to_tsvector('french', "body"));
CREATE INDEX "users_handle_fts_idx" ON "users" USING GIN (to_tsvector('french', "handle"));
CREATE INDEX "users_display_name_fts_idx" ON "users" USING GIN (to_tsvector('french', "display_name"));

-- DEC-123: updated_at is set by the application (Prisma @updatedAt), no SQL needed.
-- DEC-119: ON DELETE rules unchanged. DEC-124: CHECK constraints confirmed (migration 20261019131646_constraints).
