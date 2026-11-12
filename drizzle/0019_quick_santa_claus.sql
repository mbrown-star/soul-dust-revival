CREATE TABLE "amazon_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"ip_hash" text NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amazon_reminders" ADD CONSTRAINT "amazon_reminders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amazon_reminders_email_idx" ON "amazon_reminders" USING btree ("email_hash","created_at");--> statement-breakpoint
CREATE INDEX "amazon_reminders_ip_idx" ON "amazon_reminders" USING btree ("ip_hash","created_at");