import { desc } from "drizzle-orm";
import { getDb } from "../client";
import { agentRules } from "../schema";

/** Version la plus récente du règlement condensé, ou null si aucune consolidation n'a encore eu lieu. */
export async function getLatestAgentRules() {
  const db = getDb();
  const [latest] = await db.select().from(agentRules).orderBy(desc(agentRules.createdAt)).limit(1);
  return latest ?? null;
}

/** Insère une nouvelle version complète du règlement (jamais un delta). */
export async function insertAgentRules(content: string) {
  const db = getDb();
  const [rules] = await db.insert(agentRules).values({ content }).returning();
  return rules;
}
