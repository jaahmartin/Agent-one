import type { LeadExtraction } from "./claudeClient";

export function missedCallOpening(artisanName: string): string {
  return (
    `Bonjour, désolé de vous avoir manqué ! Je suis l'assistant de ${artisanName}. ` +
    `Pouvez-vous me dire votre nom, le problème rencontré, et votre adresse ? ` +
    `Précisez aussi si c'est urgent.`
  );
}

const MISSING_FIELD_QUESTIONS: Record<LeadExtraction["missing_fields"][number], string> = {
  name: "Pourriez-vous me donner votre nom, s'il vous plaît ?",
  problem_type: "Quel est le problème que vous rencontrez ?",
  address: "Quelle est l'adresse d'intervention ?",
  urgent: "Est-ce urgent (fuite active, panne totale, danger) ? Répondez OUI ou NON.",
};

// Ordre de priorité des relances si plusieurs champs manquent à la fois.
const MISSING_FIELD_PRIORITY: LeadExtraction["missing_fields"] = [
  "name",
  "problem_type",
  "address",
  "urgent",
];

export function nextMissingFieldQuestion(missingFields: LeadExtraction["missing_fields"]): string {
  const next = MISSING_FIELD_PRIORITY.find((field) => missingFields.includes(field));
  return next ? MISSING_FIELD_QUESTIONS[next] : MISSING_FIELD_QUESTIONS.name;
}

export function proposeSlot(artisanName: string, slotLabel: string): string {
  return (
    `Merci ! ${artisanName} peut intervenir le ${slotLabel}. ` +
    `Cela vous convient ? Répondez OUI pour confirmer.`
  );
}

export function noSlotAvailable(artisanName: string): string {
  return (
    `Merci pour ces informations. ${artisanName} n'a malheureusement aucun créneau disponible ` +
    `dans les prochains jours — nous revenons vers vous au plus vite pour convenir d'une date.`
  );
}

export function appointmentConfirmed(slotLabel: string): string {
  return `Parfait, c'est confirmé pour le ${slotLabel}. À bientôt !`;
}

export function reaskConfirmation(): string {
  return (
    "Merci de répondre OUI pour confirmer le créneau proposé, ou décrivez votre contrainte " +
    "et nous reviendrons vers vous."
  );
}

export function recapForArtisan(params: {
  clientPhone: string;
  name: string | null;
  problemType: string | null;
  address: string | null;
  urgent: boolean | null;
  slotLabel: string;
}): string {
  const urgentLabel = params.urgent === true ? "OUI" : params.urgent === false ? "non" : "non précisé";
  return (
    `Nouveau RDV confirmé : ${params.name ?? "?"} - ${params.problemType ?? "?"} - ` +
    `${params.address ?? "?"} - Urgent: ${urgentLabel} - Créneau: ${params.slotLabel} - ` +
    `Tél client: ${params.clientPhone}`
  );
}

const CONFIRMATION_KEYWORDS = ["oui", "ok", "d'accord", "daccord", "confirme", "confirmé", "confirmée"];

export function looksLikeConfirmation(body: string): boolean {
  const normalized = body.trim().toLowerCase();
  return CONFIRMATION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
