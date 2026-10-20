-- Erased content keeps its row as a placeholder (DEC-067): the body becomes '' once the content was deleted.
-- The 1-to-280 rule still applies to every live row; an empty body is allowed only on a deleted row.
ALTER TABLE "questions" DROP CONSTRAINT "questions_body_length_check";
ALTER TABLE "questions" ADD CONSTRAINT "questions_body_length_check" CHECK (char_length("body") BETWEEN 1 AND 280 OR ("body" = '' AND "deleted_at" IS NOT NULL));

ALTER TABLE "replies" DROP CONSTRAINT "replies_body_length_check";
ALTER TABLE "replies" ADD CONSTRAINT "replies_body_length_check" CHECK (char_length("body") BETWEEN 1 AND 280 OR ("body" = '' AND "deleted_at" IS NOT NULL));
