const FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

/** Ex: "lundi 8 juillet à 09:00" */
export function formatSlotFr(date: Date): string {
  return FORMATTER.format(date).replace(",", " à");
}
