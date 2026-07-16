import { asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { messages } from "../schema";

export async function logMessage(
  leadId: string,
  direction: "in" | "out",
  body: string,
  twilioSid?: string | null,
) {
  const db = getDb();
  const [message] = await db
    .insert(messages)
    .values({ leadId, direction, body, twilioSid: twilioSid ?? null })
    .returning();
  return message;
}

/** Historique complet d'une conversation, du plus ancien au plus récent — sert de contexte à Claude. */
export async function listMessagesByLead(leadId: string) {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.leadId, leadId))
    .orderBy(asc(messages.createdAt));
}
