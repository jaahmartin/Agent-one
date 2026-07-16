import "dotenv/config";
import { findArtisanByTwilioNumber } from "../db/repositories/artisansRepo";
import { checkCalendarAccess } from "../services/calendarClient";

/**
 * Vérifie que le compte de service a bien accès à l'agenda de l'artisan
 * (partagé manuellement depuis Google Calendar — voir README.md).
 *
 *   ARTISAN_TWILIO_NUMBER="+33612345678" npm run calendar:check
 */
async function main() {
  const twilioNumber = process.env.ARTISAN_TWILIO_NUMBER;
  if (!twilioNumber) {
    console.error("Définis ARTISAN_TWILIO_NUMBER dans .env avant de lancer ce script.");
    process.exit(1);
  }

  const artisan = await findArtisanByTwilioNumber(twilioNumber);
  if (!artisan) {
    console.error(`Aucun artisan trouvé avec le numéro Twilio ${twilioNumber}. Lance npm run seed:artisan.`);
    process.exit(1);
  }
  if (!artisan.googleCalendarId) {
    console.error(
      `L'artisan "${artisan.name}" n'a pas de google_calendar_id en base. ` +
        `Relance npm run seed:artisan avec ARTISAN_GOOGLE_CALENDAR_ID renseigné.`,
    );
    process.exit(1);
  }

  try {
    await checkCalendarAccess(artisan.googleCalendarId);
    console.log(
      `OK : le compte de service a bien accès à l'agenda de "${artisan.name}" ` +
        `(${artisan.googleCalendarId}).`,
    );
    process.exit(0);
  } catch (err) {
    console.error(
      `Échec de l'accès à l'agenda ${artisan.googleCalendarId}. Vérifie que :\n` +
        `  1. L'agenda a bien été partagé avec l'adresse e-mail du compte de service\n` +
        `     (permission "Apporter des modifications aux événements").\n` +
        `  2. GOOGLE_SERVICE_ACCOUNT_KEY dans .env contient bien la clé JSON encodée en base64.\n` +
        `  3. L'API Google Calendar est activée sur le projet Google Cloud.\n`,
    );
    console.error(err);
    process.exit(1);
  }
}

main();
