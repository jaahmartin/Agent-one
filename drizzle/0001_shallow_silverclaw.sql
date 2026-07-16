CREATE TYPE "public"."lead_confirmation_source" AS ENUM('sms', 'manuel');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('programmee', 'envoyee', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."reminder_type" AS ENUM('rappel_rdv', 'silence_premier_message', 'reflexion_j3');--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"appointment_id" uuid,
	"type" "reminder_type" NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"status" "reminder_status" DEFAULT 'programmee' NOT NULL,
	"message_body" text NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artisan_id" uuid NOT NULL,
	"lead_id" uuid,
	"client_name" text NOT NULL,
	"job_type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"completed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Ajoutée nullable d'abord pour ne pas casser d'éventuelles lignes déjà en base,
-- puis backfillée avec un jeton distinct par ligne avant de forcer NOT NULL.
ALTER TABLE "artisans" ADD COLUMN "dashboard_token" text;--> statement-breakpoint
UPDATE "artisans" SET "dashboard_token" = encode(gen_random_bytes(24), 'hex') WHERE "dashboard_token" IS NULL;--> statement-breakpoint
ALTER TABLE "artisans" ALTER COLUMN "dashboard_token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "artisans" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "artisans" ADD COLUMN "contact_first_name" text;--> statement-breakpoint
ALTER TABLE "artisans" ADD COLUMN "notification_email" text;--> statement-breakpoint
ALTER TABLE "artisans" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "artisans" ADD COLUMN "subscription_renews_on" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "confirmed_by" "lead_confirmation_source";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_artisan_id_artisans_id_fk" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artisans" ADD CONSTRAINT "artisans_dashboard_token_unique" UNIQUE("dashboard_token");