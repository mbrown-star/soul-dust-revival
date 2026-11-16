ALTER TABLE "social_post_metrics" ALTER COLUMN "likes" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "social_post_metrics" ALTER COLUMN "likes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "social_post_metrics" ALTER COLUMN "comments" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "social_post_metrics" ALTER COLUMN "comments" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "social_post_metrics" ALTER COLUMN "shares" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "social_post_metrics" ALTER COLUMN "shares" DROP NOT NULL;