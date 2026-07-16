import "dotenv/config";
import { getDb } from "../db/client";
import { artisans } from "../db/schema";
import { eq } from "drizzle-orm";
import { generateDashboardToken } from "../utils/dashboardToken";

/**
 * Crée (ou met à jour) l'artisan pilote en base à partir des variables
 * d'environnement. À lancer une fois après avoir créé le numéro Twilio :
 *   ARTISAN_NAME="Jean Dupont Plomberie" \
 *   ARTISAN_TWILIO_NUMBER="+33612345678" \
 *   ARTISAN_FORWARDING_NUMBER="+33698765432" \
 *   ARTISAN_GOOGLE_CALENDAR_ID="jean.dupont@gmail.com" \
 *   npx tsx src/scripts/seedArtisan.ts
 *
 * ARTISAN_GOOGLE_CALENDAR_ID est optionnel : à ajouter une fois que
 * l'agenda de l'artisan a été partagé avec le compte de service (voir
 * README.md) — relance simplement ce script avec la variable en plus pour
 * mettre à jour un artisan déjà créé.
 */
async function main() {
  const name = process.env.ARTISAN_NAME;
  const twilioNumber = process.env.ARTISAN_TWILIO_NUMBER;
  const forwardingNumber = process.env.ARTISAN_FORWARDING_NUMBER;
  const googleCalendarId = process.env.ARTISAN_GOOGLE_CALENDAR_ID || null;

  if (!name || !twilioNumber || !forwardingNumber) {
    console.error(
      "Variables manquantes. Fournis ARTISAN_NAME, ARTISAN_TWILIO_NUMBER et ARTISAN_FORWARDING_NUMBER.",
    );
    process.exit(1);
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(artisans)
    .where(eq(artisans.twilioNumber, twilioNumber))
    .limit(1);

  if (existing) {
    await db
      .update(artisans)
      .set({ name, forwardingNumber, googleCalendarId: googleCalendarId ?? existing.googleCalendarId })
      .where(eq(artisans.id, existing.id));
    console.log(`Artisan "${name}" mis à jour (id=${existing.id}).`);
  } else {
    const dashboardToken = generateDashboardToken();
    const [created] = await db
      .insert(artisans)
      .values({ name, twilioNumber, forwardingNumber, googleCalendarId, dashboardToken })
      .returning();
    console.log(`Artisan "${name}" créé (id=${created.id}).`);
    console.log(`Lien du dashboard : /dashboard/${dashboardToken}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
