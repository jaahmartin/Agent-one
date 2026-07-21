ALTER TABLE "labo_feedback" ADD COLUMN "expected_replies" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "labo_feedback" ADD COLUMN "reasoning" text NOT NULL;