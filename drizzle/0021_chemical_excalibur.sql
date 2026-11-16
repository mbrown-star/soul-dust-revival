CREATE TABLE "activity_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"area" text NOT NULL,
	"section" text NOT NULL,
	"path" text NOT NULL,
	"study_id" uuid,
	"lesson_id" uuid,
	"product_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active_seconds" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_visits" ADD CONSTRAINT "activity_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_visits" ADD CONSTRAINT "activity_visits_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_visits" ADD CONSTRAINT "activity_visits_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_visits" ADD CONSTRAINT "activity_visits_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_visits_user_last_seen_idx" ON "activity_visits" USING btree ("user_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "activity_visits_started_at_idx" ON "activity_visits" USING btree ("started_at");