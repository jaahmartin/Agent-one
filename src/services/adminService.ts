import { randomBytes } from "crypto";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { appointments, artisans, clientNotes, clientTasks, leads, revenues } from "../db/schema";
import {
  deleteLaboFeedback,
  insertLaboFeedback,
  listLaboFeedbackWithArtisan,
  updateLaboFeedbackStatus,
} from "../db/repositories/laboFeedbackRepo";

// Toutes les requêtes ci-dessous tournent volontairement sur la connexion
// d'administration par défaut (jamais withArtisanScope) : l'espace admin a
// besoin de voir tous les artisans à la fois, contrairement au dashboard
// d'un artisan qui doit rester cloisonné (voir src/db/client.ts).

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Statut d'abonnement normalisé pour l'affichage (pastille) dans l'admin. */
export function normalizeSubscriptionStatus(raw: string | null): "actif" | "en_pause" | "en_attente" {
  if (raw === "en_pause" || raw === "en_attente") return raw;
  return "actif";
}

export async function getGlobalOverview() {
  const db = getDb();
  const monthStart = startOfMonth();

  const [{ count: clientCount }] = await db
    .select({ count: sql<string>`count(*)` })
    .from(artisans)
    .where(eq(artisans.isDemo, false));

  const [{ total: revenueThisMonth }] = await db
    .select({ total: sql<string>`coalesce(sum(${revenues.amountCents}), 0)` })
    .from(revenues)
    .innerJoin(artisans, eq(revenues.artisanId, artisans.id))
    .where(and(eq(artisans.isDemo, false), gte(revenues.completedAt, monthStart)));

  const [{ count: confirmedAppointments }] = await db
    .select({ count: sql<string>`count(*)` })
    .from(appointments)
    .innerJoin(leads, eq(appointments.leadId, leads.id))
    .innerJoin(artisans, eq(leads.artisanId, artisans.id))
    .where(and(eq(artisans.isDemo, false), eq(appointments.status, "confirmed")));

  const [{ total: totalLeads, confirmed: confirmedLeads }] = await db
    .select({
      total: sql<string>`count(*)`,
      confirmed: sql<string>`count(*) filter (where ${leads.status} = 'confirme')`,
    })
    .from(leads)
    .innerJoin(artisans, eq(leads.artisanId, artisans.id))
    .where(eq(artisans.isDemo, false));

  const conversionRate =
    Number(totalLeads) > 0 ? Math.round((Number(confirmedLeads) / Number(totalLeads)) * 100) : 0;

  return {
    clientCount: Number(clientCount),
    revenueThisMonthCents: Number(revenueThisMonth),
    confirmedAppointments: Number(confirmedAppointments),
    conversionRate,
  };
}

export async function listClients() {
  const db = getDb();
  const monthStart = startOfMonth();
  const rows = await db.select().from(artisans).where(eq(artisans.isDemo, false)).orderBy(artisans.createdAt);

  return Promise.all(
    rows.map(async (artisan) => {
      const [{ total }] = await db
        .select({ total: sql<string>`coalesce(sum(${revenues.amountCents}), 0)` })
        .from(revenues)
        .where(and(eq(revenues.artisanId, artisan.id), gte(revenues.completedAt, monthStart)));
      return { artisan, revenueThisMonthCents: Number(total) };
    }),
  );
}

export async function getClientProfile(artisanId: string) {
  const db = getDb();
  const [artisan] = await db.select().from(artisans).where(eq(artisans.id, artisanId)).limit(1);
  if (!artisan) return null;

  const [{ total: revenueTotal }] = await db
    .select({ total: sql<string>`coalesce(sum(${revenues.amountCents}), 0)` })
    .from(revenues)
    .where(eq(revenues.artisanId, artisanId));

  const notes = await db
    .select()
    .from(clientNotes)
    .where(eq(clientNotes.artisanId, artisanId))
    .orderBy(sql`${clientNotes.createdAt} desc`);

  const tasks = await db
    .select()
    .from(clientTasks)
    .where(eq(clientTasks.artisanId, artisanId))
    .orderBy(sql`${clientTasks.createdAt} desc`);

  return {
    artisan,
    status: normalizeSubscriptionStatus(artisan.subscriptionStatus),
    revenueTotalCents: Number(revenueTotal),
    notes,
    tasks,
  };
}

/** Crée une fiche client "en attente" — complétable ensuite depuis son profil. */
export async function createPendingClient(params: {
  name: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  metier: string | null;
  activityDescription: string | null;
}) {
  const db = getDb();
  const dashboardToken = randomBytes(24).toString("base64url");
  const [artisan] = await db
    .insert(artisans)
    .values({
      ...params,
      dashboardToken,
      subscriptionStatus: "en_attente",
      isDemo: false,
    })
    .returning();
  return artisan;
}

export async function updateClientProfile(
  artisanId: string,
  fields: Partial<{
    name: string;
    contactFirstName: string | null;
    contactLastName: string | null;
    metier: string | null;
    activityDescription: string | null;
    twilioNumber: string | null;
    forwardingNumber: string | null;
    notificationEmail: string | null;
    subscriptionStatus: string;
  }>,
) {
  const db = getDb();
  const [artisan] = await db.update(artisans).set(fields).where(eq(artisans.id, artisanId)).returning();
  return artisan;
}

export async function deleteClient(artisanId: string) {
  const db = getDb();
  await db.delete(artisans).where(and(eq(artisans.id, artisanId), ne(artisans.isDemo, true)));
}

export async function addClientNote(artisanId: string, body: string) {
  const db = getDb();
  const [note] = await db.insert(clientNotes).values({ artisanId, body }).returning();
  return note;
}

export async function addClientTask(artisanId: string, body: string) {
  const db = getDb();
  const [task] = await db.insert(clientTasks).values({ artisanId, body }).returning();
  return task;
}

export async function toggleClientTask(taskId: string, done: boolean) {
  const db = getDb();
  await db.update(clientTasks).set({ done }).where(eq(clientTasks.id, taskId));
}

/** Artisans non-démo, pour le sélecteur du labo Agent One. */
export async function listClientsForLabo() {
  const db = getDb();
  return db
    .select({ id: artisans.id, name: artisans.name, metier: artisans.metier })
    .from(artisans)
    .where(eq(artisans.isDemo, false))
    .orderBy(artisans.name);
}

export const reportLaboFeedback = insertLaboFeedback;
export const listLaboFeedback = listLaboFeedbackWithArtisan;
export const toggleLaboFeedbackStatus = updateLaboFeedbackStatus;
export const removeLaboFeedback = deleteLaboFeedback;
