-- Constraints and indexes that the Prisma schema cannot express (plan step 4.2).

-- CHECK: no self-reference
ALTER TABLE "follows" ADD CONSTRAINT "follows_no_self_follow_check" CHECK ("follower_id" <> "followee_id");
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_no_self_block_check" CHECK ("blocker_id" <> "blocked_id");

-- CHECK: exactly one target (DEC-089 for mentions)
ALTER TABLE "reports" ADD CONSTRAINT "reports_exactly_one_target_check" CHECK (("question_id" IS NULL) <> ("reply_id" IS NULL));
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_exactly_one_target_check" CHECK (("question_id" IS NULL) <> ("reply_id" IS NULL));

-- CHECK: details are required when the report reason is 'other'
ALTER TABLE "reports" ADD CONSTRAINT "reports_details_required_for_other_check" CHECK ("reason" <> 'other' OR "details" IS NOT NULL);

-- CHECK: counters are never negative
ALTER TABLE "users" ADD CONSTRAINT "users_follower_count_check" CHECK ("follower_count" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "users_following_count_check" CHECK ("following_count" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "users_failed_login_count_check" CHECK ("failed_login_count" >= 0);
ALTER TABLE "questions" ADD CONSTRAINT "questions_like_count_check" CHECK ("like_count" >= 0);
ALTER TABLE "questions" ADD CONSTRAINT "questions_dislike_count_check" CHECK ("dislike_count" >= 0);
ALTER TABLE "questions" ADD CONSTRAINT "questions_y_count_check" CHECK ("y_count" >= 0);
ALTER TABLE "questions" ADD CONSTRAINT "questions_reply_count_check" CHECK ("reply_count" >= 0);
ALTER TABLE "replies" ADD CONSTRAINT "replies_like_count_check" CHECK ("like_count" >= 0);
ALTER TABLE "replies" ADD CONSTRAINT "replies_dislike_count_check" CHECK ("dislike_count" >= 0);
ALTER TABLE "signup_codes" ADD CONSTRAINT "signup_codes_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "password_reset_codes" ADD CONSTRAINT "password_reset_codes_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "email_change_codes" ADD CONSTRAINT "email_change_codes_attempts_check" CHECK ("attempts" >= 0);

-- CHECK: handle is ASCII letters, digits and underscore only
ALTER TABLE "users" ADD CONSTRAINT "users_handle_format_check" CHECK ("handle" ~ '^[A-Za-z0-9_]+$');

-- Case-insensitive unique handle (DEC-061, DEC-070)
CREATE UNIQUE INDEX "users_handle_lower_key" ON "users" (lower("handle"));

-- Full-text search with the 'simple' text search configuration
CREATE INDEX "questions_body_fts_idx" ON "questions" USING GIN (to_tsvector('simple', "body"));
CREATE INDEX "users_handle_fts_idx" ON "users" USING GIN (to_tsvector('simple', "handle"));
CREATE INDEX "users_display_name_fts_idx" ON "users" USING GIN (to_tsvector('simple', "display_name"));
