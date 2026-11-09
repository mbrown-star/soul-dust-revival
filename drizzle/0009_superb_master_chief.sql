ALTER TABLE "products" ADD COLUMN "kind" text DEFAULT 'book' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "book_binding" text;