import { desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../client";
import { artisans, laboFeedback } from "../schema";

export async function insertLaboFeedback(params: {
  artisanId: string;
  conversationExcerpt: string;
  actualReply: string;
  expectedReplies: string[];
  reasoning: string;
}) {
  const db = getDb();
  const [feedback] = await db.insert(laboFeedback).values(params).returning();
  return feedback;
}

/**
 * Corrections les plus récentes, réinjectées dans le prompt de
 * composeReply() (voir claudeClient.ts) pour toutes les conversations
 * futures — le "cerveau" d'Agent One est partagé entre tous les artisans.
 */
export async function listRecentLaboFeedback(limit = 20) {
  const db = getDb();
  return db.select().from(laboFeedback).orderBy(desc(laboFeedback.createdAt)).limit(limit);
}

export async function listLaboFeedbackWithArtisan() {
  const db = getDb();
  return db
    .select({ feedback: laboFeedback, artisanName: artisans.name })
    .from(laboFeedback)
    .innerJoin(artisans, eq(laboFeedback.artisanId, artisans.id))
    .orderBy(desc(laboFeedback.createdAt));
}

export async function updateLaboFeedbackStatus(id: string, status: "ouvert" | "resolu") {
  const db = getDb();
  await db.update(laboFeedback).set({ status }).where(eq(laboFeedback.id, id));
}

export async function deleteLaboFeedback(id: string) {
  const db = getDb();
  await db.delete(laboFeedback).where(eq(laboFeedback.id, id));
}

/**
 * Corrections pas encore fondues dans le règlement condensé (voir
 * ruleConsolidationService.ts) — c'est cette liste qu'une consolidation
 * traite, puis marque via markFeedbackConsolidated().
 */
export async function listUnconsolidatedFeedback() {
  const db = getDb();
  return db
    .select()
    .from(laboFeedback)
    .where(isNull(laboFeedback.consolidatedAt))
    .orderBy(laboFeedback.createdAt);
}

export async function markFeedbackConsolidated(ids: string[]) {
  if (ids.length === 0) return;
  const db = getDb();
  await db.update(laboFeedback).set({ consolidatedAt: new Date() }).where(inArray(laboFeedback.id, ids));
}
