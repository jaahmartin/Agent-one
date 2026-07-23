CREATE TABLE "agent_praise" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artisan_id" uuid NOT NULL,
	"conversation_excerpt" text NOT NULL,
	"liked_reply" text NOT NULL,
	"consolidated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_praise" ADD CONSTRAINT "agent_praise_artisan_id_artisans_id_fk" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE cascade ON UPDATE no action;