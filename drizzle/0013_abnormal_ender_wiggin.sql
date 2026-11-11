ALTER TABLE "content_blocks" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "published_content" jsonb;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "has_draft_changes" boolean DEFAULT false NOT NULL;