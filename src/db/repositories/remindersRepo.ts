import { and, asc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../client";
import { leads, reminders } from "../schema";

export async function createReminder(params: {
  leadId: string;
  appointmentId?: string | null;
  type: (typeof reminders.$inferInsert)["type"];
  scheduledFor: Date;
  messageBody: string;
  status?: (typeof reminders.$inferInsert)["status"];
  sentAt?: Date | null;
}) {
  const db = getDb();
  const [reminder] = await db
    .insert(reminders)
    .values({
      leadId: params.leadId,
      appointmentId: params.appointmentId ?? null,
      type: params.type,
      scheduledFor: params.scheduledFor,
      messageBody: params.messageBody,
      status: params.status ?? "programmee",
      sentAt: params.sentAt ?? null,
    })
    .returning();
  return reminder;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Relances programmées ou déjà envoyées aujourd'hui, du plus tôt au plus tard. */
export async function listTodayReminders(artisanId: string) {
  const db = getDb();
  const start = startOfDay(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return db
    .select({ reminder: reminders, lead: leads })
    .from(reminders)
    .innerJoin(leads, eq(reminders.leadId, leads.id))
    .where(
      and(
        eq(leads.artisanId, artisanId),
        gte(reminders.scheduledFor, start),
        lt(reminders.scheduledFor, end),
      ),
    )
    .orderBy(asc(reminders.scheduledFor));
}

/** Relances programmées au-delà d'aujourd'hui. */
export async function listUpcomingReminders(artisanId: string) {
  const db = getDb();
  const end = new Date(startOfDay(new Date()));
  end.setDate(end.getDate() + 1);

  return db
    .select({ reminder: reminders, lead: leads })
    .from(reminders)
    .innerJoin(leads, eq(reminders.leadId, leads.id))
    .where(and(eq(leads.artisanId, artisanId), gte(reminders.scheduledFor, end)))
    .orderBy(asc(reminders.scheduledFor));
}

/** Arrête toute relance en cours pour ce lead — déclenché par "Confirmé" ou la suppression. */
export async function cancelPendingRemindersForLead(leadId: string) {
  const db = getDb();
  await db
    .update(reminders)
    .set({ status: "annulee" })
    .where(and(eq(reminders.leadId, leadId), eq(reminders.status, "programmee")));
}
