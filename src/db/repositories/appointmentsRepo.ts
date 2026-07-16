import { and, eq } from "drizzle-orm";
import { getDb } from "../client";
import { appointments, leads } from "../schema";

export async function createProposedAppointment(
  leadId: string,
  startTime: Date,
  endTime: Date,
) {
  const db = getDb();
  const [appointment] = await db
    .insert(appointments)
    .values({ leadId, startTime, endTime, status: "proposed" })
    .returning();
  return appointment;
}

export async function confirmAppointment(appointmentId: string, calendarEventId: string) {
  const db = getDb();
  const [appointment] = await db
    .update(appointments)
    .set({ status: "confirmed", calendarEventId, confirmedAt: new Date() })
    .where(eq(appointments.id, appointmentId))
    .returning();
  return appointment;
}

export async function findLatestProposedAppointmentByLead(leadId: string) {
  const db = getDb();
  const [appointment] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.leadId, leadId), eq(appointments.status, "proposed")))
    .limit(1);
  return appointment ?? null;
}

/**
 * Tous les rendez-vous encore non confirmés, avec le lead associé
 * (numéro du client). La décision "faut-il relancer, et à quel stade"
 * se fait ensuite en JS pur dans reminderService.ts — plus simple à lire
 * et à tester qu'une requête SQL par palier J+3/J+7/J+14.
 */
export async function findAllProposedAppointmentsWithLead() {
  const db = getDb();
  return db
    .select({ appointment: appointments, lead: leads })
    .from(appointments)
    .innerJoin(leads, eq(appointments.leadId, leads.id))
    .where(eq(appointments.status, "proposed"));
}

export async function markReminderSent(appointmentId: string, stage: "j3" | "j7" | "j14") {
  const db = getDb();
  await db
    .update(appointments)
    .set({ lastReminderStage: stage })
    .where(eq(appointments.id, appointmentId));
}

/** Rendez-vous confirmés d'un artisan (onglet "Rendez-vous" du dashboard), avec le lead associé. */
export async function listConfirmedAppointmentsByArtisan(artisanId: string) {
  const db = getDb();
  return db
    .select({ appointment: appointments, lead: leads })
    .from(appointments)
    .innerJoin(leads, eq(appointments.leadId, leads.id))
    .where(and(eq(leads.artisanId, artisanId), eq(appointments.status, "confirmed")));
}
