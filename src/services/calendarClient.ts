import { google } from "googleapis";
import { requireEnv } from "../config/env";

const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar"];

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
};

let _calendar: ReturnType<typeof google.calendar> | null = null;

/**
 * Un seul compte de service pour toute l'app (pas un par artisan) : chaque
 * artisan partage son propre agenda Google avec l'adresse e-mail de ce
 * compte de service (voir README.md). La clé est stockée en base64 dans
 * GOOGLE_SERVICE_ACCOUNT_KEY pour éviter les soucis de retours à la ligne
 * de la clé privée PEM dans un fichier .env.
 */
function getCalendar() {
  if (!_calendar) {
    const encoded = requireEnv("GOOGLE_SERVICE_ACCOUNT_KEY");
    const keyJson: ServiceAccountKey = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf-8"),
    );
    const auth = new google.auth.JWT({
      email: keyJson.client_email,
      key: keyJson.private_key,
      scopes: CALENDAR_SCOPES,
    });
    _calendar = google.calendar({ version: "v3", auth });
  }
  return _calendar;
}

const BUSINESS_HOUR_START = 8;
const BUSINESS_HOUR_END = 18;
const SLOT_DURATION_MINUTES = 60;
const SEARCH_WINDOW_DAYS = 7;
const SLOTS_TO_PROPOSE = 3;

/**
 * Génère les créneaux d'1h disponibles sur les BUSINESS_HOUR_START-END,
 * du lendemain jusqu'à SEARCH_WINDOW_DAYS jours, en retirant ceux qui
 * chevauchent un événement existant dans l'agenda de l'artisan.
 * `calendarId` est l'adresse e-mail de l'artisan (son agenda principal),
 * partagé au préalable avec le compte de service.
 */
export async function getAvailableSlots(
  calendarId: string,
): Promise<Array<{ start: Date; end: Date }>> {
  const calendar = getCalendar();

  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() + 1);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + SEARCH_WINDOW_DAYS);

  const { data } = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  const busyPeriods = (data.items ?? [])
    .filter((event) => event.start?.dateTime && event.end?.dateTime)
    .map((event) => ({
      start: new Date(event.start!.dateTime!),
      end: new Date(event.end!.dateTime!),
    }));

  const candidateSlots: Array<{ start: Date; end: Date }> = [];
  for (let dayOffset = 0; dayOffset < SEARCH_WINDOW_DAYS; dayOffset++) {
    const day = new Date(timeMin);
    day.setDate(day.getDate() + dayOffset);
    // On saute les week-ends pour un MVP simple (pas de config horaires par artisan).
    if (day.getDay() === 0 || day.getDay() === 6) continue;

    for (let hour = BUSINESS_HOUR_START; hour < BUSINESS_HOUR_END; hour++) {
      const start = new Date(day);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + SLOT_DURATION_MINUTES);

      const overlaps = busyPeriods.some((busy) => start < busy.end && end > busy.start);
      if (!overlaps) candidateSlots.push({ start, end });
    }
  }

  return candidateSlots.slice(0, SLOTS_TO_PROPOSE);
}

export async function createCalendarEvent(
  calendarId: string,
  params: { start: Date; end: Date; summary: string; description: string },
) {
  const calendar = getCalendar();
  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.start.toISOString() },
      end: { dateTime: params.end.toISOString() },
    },
  });
  return data.id ?? null;
}

/** Petite vérification de bout en bout : le compte de service a-t-il bien accès à cet agenda ? */
export async function checkCalendarAccess(calendarId: string) {
  const calendar = getCalendar();
  const { data } = await calendar.events.list({ calendarId, maxResults: 1, singleEvents: true });
  return data;
}
