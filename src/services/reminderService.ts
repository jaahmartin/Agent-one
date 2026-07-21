import {
  findAllProposedAppointmentsWithLead,
  markReminderSent,
} from "../db/repositories/appointmentsRepo";
import { findArtisanById } from "../db/repositories/artisansRepo";
import { logMessage } from "../db/repositories/messagesRepo";
import { sendSms } from "./twilioClient";
import { formatSlotFr } from "../utils/formatDate";

type Stage = "j3" | "j7" | "j14";

// Ordre séquentiel : on ne passe au palier suivant que si le précédent a
// déjà été envoyé (ou, pour j3, si aucune relance n'a encore été envoyée).
const STAGES: Array<{ stage: Stage; afterDays: number; previousStage: Stage | null }> = [
  { stage: "j3", afterDays: 3, previousStage: null },
  { stage: "j7", afterDays: 7, previousStage: "j3" },
  { stage: "j14", afterDays: 14, previousStage: "j7" },
];

function reminderMessage(stage: Stage, artisanName: string, slotLabel: string): string {
  switch (stage) {
    case "j3":
      return (
        `Bonjour, vous n'avez pas encore confirmé le créneau du ${slotLabel} proposé par ` +
        `${artisanName}. Répondez OUI pour le confirmer, ou dites-nous si vous avez besoin ` +
        `d'un autre horaire.`
      );
    case "j7":
      return (
        `Second rappel : le créneau du ${slotLabel} avec ${artisanName} est toujours en ` +
        `attente de votre confirmation. Répondez OUI pour le valider.`
      );
    case "j14":
      return (
        `Dernier rappel : sans confirmation de votre part, nous considérerons que votre ` +
        `demande n'est plus d'actualité. Répondez OUI pour confirmer le créneau du ${slotLabel}.`
      );
  }
}

/**
 * À exécuter une fois par jour. Pour chaque rendez-vous encore "proposed",
 * détermine si l'ancienneté justifie de passer au palier de relance
 * suivant, et l'envoie — jamais deux fois le même palier (protégé par
 * lastReminderStage en base).
 */
export async function runReminderSweep(now: Date = new Date()): Promise<number> {
  const rows = await findAllProposedAppointmentsWithLead();
  let sentCount = 0;

  for (const { appointment, lead } of rows) {
    const daysSinceCreated = Math.floor(
      (now.getTime() - appointment.createdAt.getTime()) / 86_400_000,
    );

    for (const { stage, afterDays, previousStage } of STAGES) {
      const isNextStageForThisAppointment = appointment.lastReminderStage === previousStage;
      if (daysSinceCreated >= afterDays && isNextStageForThisAppointment) {
        const artisan = await findArtisanById(lead.artisanId);
        if (!artisan || !artisan.twilioNumber) break;

        const slotLabel = formatSlotFr(appointment.startTime);
        const body = reminderMessage(stage, artisan.name, slotLabel);
        const message = await sendSms({ to: lead.clientPhone, from: artisan.twilioNumber, body });
        await logMessage(lead.id, "out", body, message.sid);
        await markReminderSent(appointment.id, stage);
        sentCount++;
        break; // un seul palier de relance envoyé par passage de cron pour ce RDV
      }
    }
  }

  return sentCount;
}
