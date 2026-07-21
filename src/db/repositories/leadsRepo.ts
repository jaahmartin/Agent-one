import { and, desc, eq, notInArray } from "drizzle-orm";
import { getDb } from "../client";
import { leads } from "../schema";

// "confirme" est volontairement inclus ici : Agent One ne déplace jamais un
// rendez-vous déjà confirmé pour en insérer un nouveau (voir
// CONTEXTE_AGENT_ONE.md, "Capacités réelles d'Agent ONE"). Un nouveau SMS
// du même client après confirmation ouvre donc un lead tout neuf plutôt que
// de rouvrir/modifier celui déjà confirmé.
const TERMINAL_STATUSES = ["confirme", "perdu", "termine"] as const;

/**
 * Récupère le lead en cours pour ce client (s'il existe déjà une
 * conversation non terminée) — évite de repartir de zéro à chaque nouveau
 * SMS du même client.
 */
export async function findOpenLeadByPhone(artisanId: string, clientPhone: string) {
  const db = getDb();
  const [lead] = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.artisanId, artisanId),
        eq(leads.clientPhone, clientPhone),
        notInArray(leads.status, [...TERMINAL_STATUSES]),
      ),
    )
    .orderBy(desc(leads.createdAt))
    .limit(1);
  return lead ?? null;
}

export async function createLead(artisanId: string, clientPhone: string) {
  const db = getDb();
  const [lead] = await db
    .insert(leads)
    .values({ artisanId, clientPhone, status: "nouveau" })
    .returning();
  return lead;
}

export async function updateLead(
  leadId: string,
  fields: Partial<{
    status: (typeof leads.$inferInsert)["status"];
    name: string | null;
    problemType: string | null;
    address: string | null;
    urgent: boolean | null;
  }>,
) {
  const db = getDb();
  const [lead] = await db
    .update(leads)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(leads.id, leadId))
    .returning();
  return lead;
}

export async function findLeadById(leadId: string) {
  const db = getDb();
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  return lead ?? null;
}

// Statuts considérés "sans suite" / "à rappeler" dans le dashboard : ni
// confirmé, ni perdu, ni terminé.
const CALLBACK_EXCLUDED_STATUSES = ["confirme", "perdu", "termine"] as const;

/** Leads de l'onglet "À rappeler" — pas encore confirmés, pas perdus. */
export async function listCallbackLeads(artisanId: string) {
  const db = getDb();
  return db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.artisanId, artisanId),
        notInArray(leads.status, [...CALLBACK_EXCLUDED_STATUSES]),
      ),
    )
    .orderBy(desc(leads.createdAt));
}

/**
 * Leads confirmés manuellement depuis le dashboard (bouton "Confirmé" de
 * l'onglet "À rappeler") — n'ont jamais de rendez-vous calendrier associé,
 * contrairement à une confirmation par SMS qui, elle, passe par `appointments`.
 */
export async function listManuallyConfirmedLeads(artisanId: string) {
  const db = getDb();
  return db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.artisanId, artisanId),
        eq(leads.status, "confirme"),
        eq(leads.confirmedBy, "manuel"),
      ),
    )
    .orderBy(desc(leads.confirmedAt));
}

/** Bouton "Confirmé" de l'onglet "À rappeler" : arrête aussi les relances (appelant). */
export async function confirmLeadManually(leadId: string) {
  const db = getDb();
  const [lead] = await db
    .update(leads)
    .set({ status: "confirme", confirmedBy: "manuel", confirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(leads.id, leadId))
    .returning();
  return lead;
}

/** Suppression (icône poubelle) de l'onglet "À rappeler". */
export async function markLeadLost(leadId: string) {
  const db = getDb();
  const [lead] = await db
    .update(leads)
    .set({ status: "perdu", updatedAt: new Date() })
    .where(eq(leads.id, leadId))
    .returning();
  return lead;
}
