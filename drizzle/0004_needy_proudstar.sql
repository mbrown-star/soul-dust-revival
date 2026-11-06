ALTER TABLE "order_items" ADD COLUMN "variant" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "digital_price_cents" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "digital_stripe_product_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "digital_stripe_price_id" text;