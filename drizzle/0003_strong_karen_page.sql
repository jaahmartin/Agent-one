ALTER TABLE "artisans" ALTER COLUMN "twilio_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "artisans" ALTER COLUMN "forwarding_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "artisans" ADD COLUMN "metier" text;