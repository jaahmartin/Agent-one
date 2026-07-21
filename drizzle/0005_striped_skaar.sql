CREATE TABLE "labo_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artisan_id" uuid NOT NULL,
	"conversation_excerpt" text NOT NULL,
	"actual_reply" text NOT NULL,
	"expected_reply" text NOT NULL,
	"status" text DEFAULT 'ouvert' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "labo_feedback" ADD CONSTRAINT "labo_feedback_artisan_id_artisans_id_fk" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE cascade ON UPDATE no action;