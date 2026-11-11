ALTER TABLE "products" ADD COLUMN "sell_on_amazon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "coming_soon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Products that already have an Amazon link already sell there.
UPDATE "products" SET "sell_on_amazon" = true WHERE "amazon_url" IS NOT NULL;