CREATE TABLE "amazon_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"amazon_order_number" text NOT NULL,
	"entitlement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	CONSTRAINT "amazon_claims_order_product_unique" UNIQUE("amazon_order_number","product_id")
);
--> statement-breakpoint
ALTER TABLE "amazon_claims" ADD CONSTRAINT "amazon_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_claims" ADD CONSTRAINT "amazon_claims_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;