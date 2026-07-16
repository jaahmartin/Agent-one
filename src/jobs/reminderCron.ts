import cron from "node-cron";
import { runReminderSweep } from "../services/reminderService";

/**
 * node-cron intégré au process du serveur plutôt qu'un cron externe séparé
 * chez l'hébergeur : mêmes logs, même monitoring, plus simple à tester en
 * local (voir plan MVP).
 */
export function startReminderCron() {
  cron.schedule(
    "0 9 * * *", // tous les jours à 9h
    async () => {
      try {
        const sent = await runReminderSweep();
        if (sent > 0) console.log(`[reminderCron] ${sent} relance(s) envoyée(s).`);
      } catch (err) {
        console.error("[reminderCron] Erreur lors du passage de relance :", err);
      }
    },
    { timezone: "Europe/Paris" },
  );
  console.log("[reminderCron] Programmé tous les jours à 9h (Europe/Paris).");
}
