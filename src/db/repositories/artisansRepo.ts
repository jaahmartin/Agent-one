import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { artisans } from "../schema";

export async function findArtisanByTwilioNumber(twilioNumber: string) {
  const db = getDb();
  const [artisan] = await db
    .select()
    .from(artisans)
    .where(eq(artisans.twilioNumber, twilioNumber))
    .limit(1);
  return artisan ?? null;
}

export async function findArtisanById(id: string) {
  const db = getDb();
  const [artisan] = await db.select().from(artisans).where(eq(artisans.id, id)).limit(1);
  return artisan ?? null;
}

export async function findArtisanByDashboardToken(token: string) {
  const db = getDb();
  const [artisan] = await db
    .select()
    .from(artisans)
    .where(eq(artisans.dashboardToken, token))
    .limit(1);
  return artisan ?? null;
}
