-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "account_status" AS ENUM ('pending_verification', 'active', 'suspended', 'pending_deletion', 'deleted');

-- CreateEnum
CREATE TYPE "moderation_status" AS ENUM ('visible', 'hidden', 'removed');

-- CreateEnum
CREATE TYPE "report_decision" AS ENUM ('no_action', 'content_hidden', 'content_removed', 'account_suspended');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('user', 'moderator', 'admin');

-- CreateEnum
CREATE TYPE "age_check_status" AS ENUM ('pending', 'verified', 'failed');

-- CreateEnum
CREATE TYPE "login_result" AS ENUM ('success', 'failure');

-- CreateEnum
CREATE TYPE "reaction_kind" AS ENUM ('like', 'dislike', 'y');

-- CreateEnum
CREATE TYPE "reply_reaction_kind" AS ENUM ('like', 'dislike');

-- CreateEnum
CREATE TYPE "request_status" AS ENUM ('pending', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('reply_to_question', 'conversation_opened', 'reaction_like', 'reaction_dislike', 'reaction_y', 'follow', 'mention');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('open', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "report_reason" AS ENUM ('spam', 'harassment', 'hate', 'illegal_content', 'misinformation', 'other');

-- CreateEnum
CREATE TYPE "support_status" AS ENUM ('new', 'replied', 'closed');

-- CreateEnum
CREATE TYPE "support_author_type" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "support_channel" AS ENUM ('email', 'none');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "handle" VARCHAR(30) NOT NULL,
    "display_name" VARCHAR(50) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(20),
    "password_hash" VARCHAR(255) NOT NULL,
    "birth_date" DATE,
    "bio" VARCHAR(160),
    "avatar_url" VARCHAR(2048),
    "status" "account_status" NOT NULL DEFAULT 'pending_verification',
    "role" "user_role" NOT NULL DEFAULT 'user',
    "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "terms_version" VARCHAR(20) NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "status_changed_at" TIMESTAMPTZ(3),
    "suspension_reason" VARCHAR(500),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "deletion_requested_at" TIMESTAMPTZ(3),
    "deletion_purge_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "follower_count" INTEGER NOT NULL DEFAULT 0,
    "following_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signup_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_change_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "new_email" VARCHAR(254) NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_change_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "age_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL DEFAULT 'VerifAge',
    "provider_reference" VARCHAR(255),
    "status" "age_check_status" NOT NULL DEFAULT 'pending',
    "checked_at" TIMESTAMPTZ(3),

    CONSTRAINT "age_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "result" "login_result" NOT NULL,
    "ip_hash" CHAR(64) NOT NULL,
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" VARCHAR(128) NOT NULL,
    "user_id" UUID,
    "data" JSON NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_access_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "follower_id" UUID NOT NULL,
    "followee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","followee_id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "body" VARCHAR(280) NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "dislike_count" INTEGER NOT NULL DEFAULT 0,
    "y_count" INTEGER NOT NULL DEFAULT 0,
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "conversation_opened_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "moderation_status" "moderation_status" NOT NULL DEFAULT 'visible',
    "moderated_at" TIMESTAMPTZ(3),

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" VARCHAR(280) NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "dislike_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "moderation_status" "moderation_status" NOT NULL DEFAULT 'visible',
    "moderated_at" TIMESTAMPTZ(3),

    CONSTRAINT "replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_reactions" (
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "kind" "reaction_kind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_reactions_pkey" PRIMARY KEY ("user_id","question_id")
);

-- CreateTable
CREATE TABLE "reply_reactions" (
    "user_id" UUID NOT NULL,
    "reply_id" UUID NOT NULL,
    "kind" "reply_reaction_kind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reply_reactions_pkey" PRIMARY KEY ("user_id","reply_id","kind")
);

-- CreateTable
CREATE TABLE "mentions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID,
    "reply_id" UUID,
    "mentioned_user_id" UUID NOT NULL,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hashtags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "hashtags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_hashtags" (
    "question_id" UUID NOT NULL,
    "hashtag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_hashtags_pkey" PRIMARY KEY ("question_id","hashtag_id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("user_id","question_id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMPTZ(3),
    "initiated_by_id" UUID,
    "direct_key" VARCHAR(80),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "request_status" "request_status" NOT NULL DEFAULT 'accepted',
    "last_read_at" TIMESTAMPTZ(3),
    "muted_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "shared_question_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" "notification_type" NOT NULL,
    "question_id" UUID,
    "reply_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","type")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_id" UUID NOT NULL,
    "question_id" UUID,
    "reply_id" UUID,
    "reason" "report_reason" NOT NULL,
    "details" VARCHAR(280),
    "status" "report_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "decision" "report_decision",
    "decision_note" VARCHAR(1000),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_mfa" (
    "user_id" UUID NOT NULL,
    "totp_secret_encrypted" VARCHAR(255) NOT NULL,
    "enabled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_step" BIGINT,

    CONSTRAINT "admin_mfa_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "admin_backup_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "admin_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" VARCHAR(60) NOT NULL,
    "result" VARCHAR(20) NOT NULL DEFAULT 'ok',
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" VARCHAR(500),
    "details" JSON,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prev_hash" CHAR(64) NOT NULL,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" VARCHAR(20) NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "support_status" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    "closed_by_id" UUID,
    "closed_by_lift" BOOLEAN NOT NULL DEFAULT false,
    "open_user_id" UUID,

    CONSTRAINT "support_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "author_type" "support_author_type" NOT NULL,
    "author_user_id" UUID,
    "body" VARCHAR(1000) NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" "support_channel" NOT NULL DEFAULT 'none',

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_status_deletion_purge_at_idx" ON "users"("status", "deletion_purge_at");

-- CreateIndex
CREATE INDEX "signup_codes_user_id_created_at_idx" ON "signup_codes"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "password_reset_codes_user_id_created_at_idx" ON "password_reset_codes"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "email_change_codes_user_id_created_at_idx" ON "email_change_codes"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "age_verifications_user_id_key" ON "age_verifications"("user_id");

-- CreateIndex
CREATE INDEX "login_events_user_id_created_at_idx" ON "login_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "login_events_created_at_idx" ON "login_events"("created_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "follows_followee_id_idx" ON "follows"("followee_id");

-- CreateIndex
CREATE INDEX "blocks_blocked_id_idx" ON "blocks"("blocked_id");

-- CreateIndex
CREATE INDEX "questions_author_id_created_at_idx" ON "questions"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "questions_created_at_idx" ON "questions"("created_at");

-- CreateIndex
CREATE INDEX "questions_y_count_idx" ON "questions"("y_count");

-- CreateIndex
CREATE INDEX "questions_moderation_status_created_at_idx" ON "questions"("moderation_status", "created_at");

-- CreateIndex
CREATE INDEX "replies_question_id_created_at_idx" ON "replies"("question_id", "created_at");

-- CreateIndex
CREATE INDEX "replies_author_id_idx" ON "replies"("author_id");

-- CreateIndex
CREATE INDEX "replies_moderation_status_created_at_idx" ON "replies"("moderation_status", "created_at");

-- CreateIndex
CREATE INDEX "question_reactions_question_id_kind_idx" ON "question_reactions"("question_id", "kind");

-- CreateIndex
CREATE INDEX "question_reactions_created_at_question_id_idx" ON "question_reactions"("created_at", "question_id");

-- CreateIndex
CREATE INDEX "reply_reactions_reply_id_kind_idx" ON "reply_reactions"("reply_id", "kind");

-- CreateIndex
CREATE INDEX "mentions_mentioned_user_id_idx" ON "mentions"("mentioned_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mentions_question_id_mentioned_user_id_key" ON "mentions"("question_id", "mentioned_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mentions_reply_id_mentioned_user_id_key" ON "mentions"("reply_id", "mentioned_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "hashtags_name_key" ON "hashtags"("name");

-- CreateIndex
CREATE INDEX "question_hashtags_hashtag_id_created_at_idx" ON "question_hashtags"("hashtag_id", "created_at");

-- CreateIndex
CREATE INDEX "bookmarks_user_id_created_at_idx" ON "bookmarks"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_direct_key_key" ON "conversations"("direct_key");

-- CreateIndex
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "conversation_participants_user_id_last_read_at_idx" ON "conversation_participants"("user_id", "last_read_at");

-- CreateIndex
CREATE INDEX "conversation_participants_user_id_request_status_archived_a_idx" ON "conversation_participants"("user_id", "request_status", "archived_at");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_created_at_idx" ON "notifications"("recipient_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_idx" ON "notifications"("recipient_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_type_question_id_created_at_idx" ON "notifications"("recipient_id", "type", "question_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_question_id_status_idx" ON "reports"("question_id", "status");

-- CreateIndex
CREATE INDEX "reports_reply_id_status_idx" ON "reports"("reply_id", "status");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "admin_backup_codes_user_id_idx" ON "admin_backup_codes"("user_id");

-- CreateIndex
CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log"("created_at");

-- CreateIndex
CREATE INDEX "admin_audit_log_actor_id_created_at_idx" ON "admin_audit_log"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_log_target_type_target_id_created_at_idx" ON "admin_audit_log"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_threads_reference_key" ON "support_threads"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "support_threads_open_user_id_key" ON "support_threads"("open_user_id");

-- CreateIndex
CREATE INDEX "support_threads_user_id_created_at_idx" ON "support_threads"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "support_threads_status_idx" ON "support_threads"("status");

-- CreateIndex
CREATE INDEX "support_messages_thread_id_sent_at_idx" ON "support_messages"("thread_id", "sent_at");

-- AddForeignKey
ALTER TABLE "signup_codes" ADD CONSTRAINT "signup_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "password_reset_codes" ADD CONSTRAINT "password_reset_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "email_change_codes" ADD CONSTRAINT "email_change_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "age_verifications" ADD CONSTRAINT "age_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_fkey" FOREIGN KEY ("followee_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "replies" ADD CONSTRAINT "replies_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "replies" ADD CONSTRAINT "replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "question_reactions" ADD CONSTRAINT "question_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "question_reactions" ADD CONSTRAINT "question_reactions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reply_reactions" ADD CONSTRAINT "reply_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reply_reactions" ADD CONSTRAINT "reply_reactions_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "replies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "replies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "question_hashtags" ADD CONSTRAINT "question_hashtags_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "question_hashtags" ADD CONSTRAINT "question_hashtags_hashtag_id_fkey" FOREIGN KEY ("hashtag_id") REFERENCES "hashtags"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_initiated_by_id_fkey" FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_shared_question_id_fkey" FOREIGN KEY ("shared_question_id") REFERENCES "questions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "replies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "replies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_mfa" ADD CONSTRAINT "admin_mfa_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_backup_codes" ADD CONSTRAINT "admin_backup_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "support_threads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

