ALTER TABLE "products" ADD COLUMN "amazon_url" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sell_on_stripe" boolean DEFAULT true NOT NULL;