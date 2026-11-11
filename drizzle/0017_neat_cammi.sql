CREATE TABLE "blocked_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"reason" text,
	"auth_user_id" uuid,
	"auth_user_is_placeholder" boolean DEFAULT false NOT NULL,
	"blocked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "blocked_emails_email_unique" UNIQUE("email")
);
