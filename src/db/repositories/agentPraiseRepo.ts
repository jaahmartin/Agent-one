import { inArray, isNull } from "drizzle-orm";
import { getDb } from "../client";
import { agentPraise } from "../schema";

export async function insertAgentPraise(params: {
  artisanId: string;
  conversationExcerpt: string;
  likedReply: string;
}) {
  const db = getDb();
  const [praise] = await db.insert(agentPraise).values(params).returning();
  return praise;
}

/** Messages "likés" pas encore fondus dans le règlement condensé. */
export async function listUnconsolidatedPraise() {
  const db = getDb();
  return db
    .select()
    .from(agentPraise)
    .where(isNull(agentPraise.consolidatedAt))
    .orderBy(agentPraise.createdAt);
}

export async function markPraiseConsolidated(ids: string[]) {
  if (ids.length === 0) return;
  const db = getDb();
  await db.update(agentPraise).set({ consolidatedAt: new Date() }).where(inArray(agentPraise.id, ids));
}
