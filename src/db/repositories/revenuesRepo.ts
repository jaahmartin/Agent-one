import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { revenues } from "../schema";

export async function createRevenue(params: {
  artisanId: string;
  leadId?: string | null;
  clientName: string;
  jobType: string;
  amountCents: number;
  completedAt: Date;
}) {
  const db = getDb();
  const [revenue] = await db
    .insert(revenues)
    .values({
      artisanId: params.artisanId,
      leadId: params.leadId ?? null,
      clientName: params.clientName,
      jobType: params.jobType,
      amountCents: params.amountCents,
      completedAt: params.completedAt,
    })
    .returning();
  return revenue;
}

/** Du plus récent au plus ancien (ordre chronologique inverse) — le détail par client de la maquette. */
export async function listRevenuesByArtisan(artisanId: string) {
  const db = getDb();
  return db
    .select()
    .from(revenues)
    .where(eq(revenues.artisanId, artisanId))
    .orderBy(desc(revenues.completedAt));
}

/** Somme en centimes — garantit que le total affiché correspond toujours exactement au détail. */
export async function sumRevenueByArtisan(artisanId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${revenues.amountCents}), 0)` })
    .from(revenues)
    .where(eq(revenues.artisanId, artisanId));
  return Number(row?.total ?? 0);
}
