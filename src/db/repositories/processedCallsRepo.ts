import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { processedCalls } from "../schema";

export async function hasProcessedCall(callSid: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(processedCalls)
    .where(eq(processedCalls.callSid, callSid))
    .limit(1);
  return row !== undefined;
}

/**
 * Insertion protégée par la clé primaire `call_sid` : si deux requêtes
 * concurrentes (retry Twilio) arrivent en même temps, une seule réussit —
 * garantit qu'on n'envoie jamais deux fois le SMS pour le même appel.
 */
export async function markCallProcessed(callSid: string): Promise<boolean> {
  const db = getDb();
  try {
    await db.insert(processedCalls).values({ callSid });
    return true;
  } catch {
    return false;
  }
}
