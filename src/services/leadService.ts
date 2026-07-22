import type { artisans, leads } from "../db/schema";
import {
  createLead,
  findOpenLeadByPhone,
  updateLead,
} from "../db/repositories/leadsRepo";
import { listMessagesByLead, logMessage } from "../db/repositories/messagesRepo";
import {
  confirmAppointment,
  createProposedAppointment,
  findLatestProposedAppointmentByLead,
} from "../db/repositories/appointmentsRepo";
import { sendSms } from "./twilioClient";
import { composeReply, extractLeadInfo, type LeadExtraction } from "./claudeClient";
import { createCalendarEvent, getAvailableSlots } from "./calendarClient";
import { formatSlotFr } from "../utils/formatDate";
import { looksLikeConfirmation, recapForArtisan } from "./messageTemplates";

type Artisan = typeof artisans.$inferSelect;
type Lead = typeof leads.$inferSelect;

// ---------------------------------------------------------------------------
// Étage 1 — DÉCIDER : ce que dit Agent One ensuite, jamais d'effet réel
// (pas de SMS envoyé, pas d'écriture en base, pas d'événement d'agenda créé).
// Utilisé à la fois par le vrai webhook SMS ci-dessous et par le labo Agent
// One (espace admin) — voir simulateReply()/simulateMissedCall(). La seule
// chose "réelle" que ça touche est la lecture (pas l'écriture) des
// disponibilités Google Calendar, nécessaire pour proposer un créneau
// crédible, y compris en simulation, et l'appel à Claude qui écrit le texte
// (voir claudeClient.ts, composeReply — c'est lui qui donne à Agent One sa
// personnalité, pas des phrases figées).
// ---------------------------------------------------------------------------

export type ConversationState = {
  status: "nouveau" | "en_qualification" | "creneau_propose";
  name: string | null;
  problemType: string | null;
  address: string | null;
  urgent: boolean | null;
  proposedSlot: { start: Date; end: Date } | null;
};

export const INITIAL_CONVERSATION_STATE: ConversationState = {
  status: "nouveau",
  name: null,
  problemType: null,
  address: null,
  urgent: null,
  proposedSlot: null,
};

export type ConversationAction =
  | { type: "none" }
  | { type: "propose_slot"; slot: { start: Date; end: Date } }
  | { type: "confirm_appointment"; slot: { start: Date; end: Date } };

export type ConversationDecision = {
  reply: string;
  nextState: ConversationState;
  action: ConversationAction;
};

const MISSING_FIELD_PRIORITY: LeadExtraction["missing_fields"] = ["name", "problem_type", "address", "urgent"];
const MISSING_FIELD_LABELS: Record<LeadExtraction["missing_fields"][number], string> = {
  name: "son nom",
  problem_type: "le problème rencontré",
  address: "l'adresse d'intervention",
  urgent: "si c'est urgent (fuite active, panne totale, danger) ou si ça peut attendre",
};

function missingFieldInstruction(state: ConversationState, missingFields: LeadExtraction["missing_fields"]): string {
  const known: string[] = [];
  if (state.name) known.push(`nom: ${state.name}`);
  if (state.problemType) known.push(`problème: ${state.problemType}`);
  if (state.address) known.push(`adresse: ${state.address}`);
  if (state.urgent !== null) known.push(`urgence: ${state.urgent ? "oui" : "non"}`);
  const knownText = known.length > 0 ? `Tu sais déjà : ${known.join(", ")}.` : "Tu ne sais encore rien sur cette demande.";

  const nextField = MISSING_FIELD_PRIORITY.find((field) => missingFields.includes(field)) ?? "name";
  return (
    `Tu qualifies la demande d'un client. ${knownText} Réagis brièvement à ce qu'il vient de dire, ` +
    `puis demande-lui ${MISSING_FIELD_LABELS[nextField]} — pose une seule question, celle-là uniquement.`
  );
}

function noSlotInstruction(artisanName: string): string {
  return (
    `Tu as maintenant toutes les informations nécessaires. Mais aucun créneau n'est disponible dans ` +
    `l'agenda pour les prochains jours. Informe le client avec tact que ${artisanName} va le recontacter ` +
    `très vite pour convenir d'une date, sans le décevoir ni paraître désorganisé.`
  );
}

function proposeSlotInstruction(slotLabel: string): string {
  return (
    `Tu as maintenant toutes les informations nécessaires (nom, problème, adresse, urgence). Un créneau ` +
    `est disponible : ${slotLabel}. Annonce-le clairement et demande au client de confirmer.`
  );
}

function confirmInstruction(slotLabel: string): string {
  return `Le client vient de confirmer le rendez-vous du ${slotLabel}. Confirme chaleureusement que c'est noté, en une phrase ou deux.`;
}

function reaskInstruction(slotLabel: string): string {
  return (
    `Un créneau (${slotLabel}) a été proposé au client, mais sa dernière réponse ne confirme ni n'infirme ` +
    `clairement. Redemande poliment une confirmation claire (oui/non), ou invite-le à préciser sa contrainte s'il en a une.`
  );
}

const MISSED_CALL_INSTRUCTION =
  "Le client vient d'appeler mais l'appel n'a mené nulle part (personne n'a décroché, ou il a raccroché " +
  "avant). C'est le tout premier message que tu lui envoies. Présente-toi brièvement comme l'assistant de " +
  "l'artisan, rassure-le que sa demande est prise en compte, et demande-lui son nom, le problème rencontré, " +
  "son adresse, et si c'est urgent.";

/**
 * Coeur pur du moteur conversationnel. `history` est le texte des échanges
 * PRÉCÉDENTS uniquement ("Client: ...\nAssistant: ...", chaîne vide s'il n'y
 * en a pas) ; `incomingMessage` est le nouveau message du client, pas encore
 * inclus dans `history`.
 */
export async function decideNextMessage(
  artisan: Artisan,
  state: ConversationState,
  history: string,
  incomingMessage: string,
): Promise<ConversationDecision> {
  const fullHistory = history ? `${history}\nClient: ${incomingMessage}` : `Client: ${incomingMessage}`;
  if (state.status === "creneau_propose") {
    return decideSlotResponse(artisan, state, fullHistory, incomingMessage);
  }
  return decideQualification(artisan, state, fullHistory);
}

async function decideQualification(
  artisan: Artisan,
  state: ConversationState,
  fullHistory: string,
): Promise<ConversationDecision> {
  const extraction = await extractLeadInfo(fullHistory, artisan);
  const qualifiedState: ConversationState = {
    ...state,
    name: extraction.name ?? state.name,
    problemType: extraction.problem_type ?? state.problemType,
    address: extraction.address ?? state.address,
    urgent: extraction.urgent ?? state.urgent,
    status: "en_qualification",
  };

  if (extraction.missing_fields.length > 0) {
    const reply = await composeReply(artisan, missingFieldInstruction(qualifiedState, extraction.missing_fields), fullHistory);
    return { reply, nextState: qualifiedState, action: { type: "none" } };
  }

  return decideProposeSlot(artisan, qualifiedState, fullHistory);
}

async function decideProposeSlot(artisan: Artisan, state: ConversationState, fullHistory: string): Promise<ConversationDecision> {
  if (!artisan.googleCalendarId) {
    const reply = await composeReply(artisan, noSlotInstruction(artisan.name), fullHistory);
    return { reply, nextState: state, action: { type: "none" } };
  }

  const slots = await getAvailableSlots(artisan.googleCalendarId);
  if (slots.length === 0) {
    const reply = await composeReply(artisan, noSlotInstruction(artisan.name), fullHistory);
    return { reply, nextState: state, action: { type: "none" } };
  }

  const [firstSlot] = slots;
  const nextState: ConversationState = { ...state, status: "creneau_propose", proposedSlot: firstSlot };
  const reply = await composeReply(artisan, proposeSlotInstruction(formatSlotFr(firstSlot.start)), fullHistory);
  return { reply, nextState, action: { type: "propose_slot", slot: firstSlot } };
}

async function decideSlotResponse(
  artisan: Artisan,
  state: ConversationState,
  fullHistory: string,
  incomingMessage: string,
): Promise<ConversationDecision> {
  if (!looksLikeConfirmation(incomingMessage) || !state.proposedSlot) {
    const slotLabel = state.proposedSlot ? formatSlotFr(state.proposedSlot.start) : "proposé";
    const reply = await composeReply(artisan, reaskInstruction(slotLabel), fullHistory);
    return { reply, nextState: state, action: { type: "none" } };
  }
  const slot = state.proposedSlot;
  const reply = await composeReply(artisan, confirmInstruction(formatSlotFr(slot.start)), fullHistory);
  return { reply, nextState: state, action: { type: "confirm_appointment", slot } };
}

async function decideMissedCallOpening(artisan: Artisan): Promise<ConversationDecision> {
  const reply = await composeReply(artisan, MISSED_CALL_INSTRUCTION, "");
  return { reply, nextState: { ...INITIAL_CONVERSATION_STATE, status: "en_qualification" }, action: { type: "none" } };
}

// ---------------------------------------------------------------------------
// Étage 2a — SIMULER (labo Agent One) : appelle uniquement la décision
// ci-dessus, ne touche jamais Twilio, la base des vrais clients, ni
// l'agenda réel de l'artisan (à part la lecture des disponibilités). Prend
// et renvoie l'état de conversation en mémoire — rien n'est persisté.
// ---------------------------------------------------------------------------

export async function simulateReply(
  artisan: Artisan,
  state: ConversationState,
  history: string,
  incomingMessage: string,
): Promise<ConversationDecision> {
  return decideNextMessage(artisan, state, history, incomingMessage);
}

/** Simule le tout premier message envoyé après un appel manqué — pour entraîner/vérifier Agent One dans le labo. */
export async function simulateMissedCall(artisan: Artisan): Promise<ConversationDecision> {
  return decideMissedCallOpening(artisan);
}

// ---------------------------------------------------------------------------
// Étage 2b — AGIR pour de vrai (webhooks Twilio) : charge/écrit en base,
// envoie les SMS, crée l'événement d'agenda. C'est le seul endroit où les
// effets réels ont lieu.
// ---------------------------------------------------------------------------

async function sendAndLog(lead: Lead, artisan: Artisan, body: string) {
  if (!artisan.twilioNumber) {
    throw new Error(`L'artisan "${artisan.name}" n'a pas encore de numéro Twilio configuré.`);
  }
  const message = await sendSms({ to: lead.clientPhone, from: artisan.twilioNumber, body });
  await logMessage(lead.id, "out", body, message.sid);
}

async function getOrCreateOpenLead(artisan: Artisan, clientPhone: string): Promise<Lead> {
  const existing = await findOpenLeadByPhone(artisan.id, clientPhone);
  if (existing) return existing;
  return createLead(artisan.id, clientPhone);
}

async function buildConversationText(leadId: string): Promise<string> {
  const history = await listMessagesByLead(leadId);
  return history
    .map((m) => `${m.direction === "in" ? "Client" : "Assistant"}: ${m.body}`)
    .join("\n");
}

async function loadConversationState(lead: Lead): Promise<ConversationState> {
  const base: ConversationState = {
    status: lead.status === "creneau_propose" ? "creneau_propose" : lead.status === "en_qualification" ? "en_qualification" : "nouveau",
    name: lead.name,
    problemType: lead.problemType,
    address: lead.address,
    urgent: lead.urgent,
    proposedSlot: null,
  };
  if (base.status !== "creneau_propose") return base;

  const appointment = await findLatestProposedAppointmentByLead(lead.id);
  if (!appointment) return { ...base, status: "en_qualification" };
  return { ...base, proposedSlot: { start: appointment.startTime, end: appointment.endTime } };
}

/** Déclenché par le webhook voix quand l'appel n'a pas été décroché. */
export async function handleMissedCall(artisan: Artisan, clientPhone: string) {
  const lead = await getOrCreateOpenLead(artisan, clientPhone);
  const decision = await decideMissedCallOpening(artisan);
  await applyDecision(artisan, lead, decision);
}

/** Déclenché par le webhook SMS, que le client ait ou non appelé au préalable. */
export async function handleInboundMessage(
  artisan: Artisan,
  clientPhone: string,
  body: string,
  twilioSid?: string | null,
) {
  const lead = await getOrCreateOpenLead(artisan, clientPhone);
  const state = await loadConversationState(lead);
  // L'historique est lu AVANT d'enregistrer le message entrant, pour ne
  // jamais l'y retrouver en double — c'est decideNextMessage qui l'ajoute
  // lui-même au texte envoyé à Claude, exactement comme pour le simulateur
  // du labo (voir simulateReply()).
  const priorHistory = await buildConversationText(lead.id);
  await logMessage(lead.id, "in", body, twilioSid ?? null);

  const decision = await decideNextMessage(artisan, state, priorHistory, body);
  await applyDecision(artisan, lead, decision);
}

async function applyDecision(artisan: Artisan, lead: Lead, decision: ConversationDecision) {
  switch (decision.action.type) {
    case "propose_slot": {
      await createProposedAppointment(lead.id, decision.action.slot.start, decision.action.slot.end);
      const updatedLead = await updateLead(lead.id, {
        name: decision.nextState.name,
        problemType: decision.nextState.problemType,
        address: decision.nextState.address,
        urgent: decision.nextState.urgent,
        status: "creneau_propose",
      });
      await sendAndLog(updatedLead, artisan, decision.reply);
      return;
    }
    case "confirm_appointment": {
      const appointment = await findLatestProposedAppointmentByLead(lead.id);
      if (!appointment) {
        const reply = await composeReply(artisan, reaskInstruction("proposé"), await buildConversationText(lead.id));
        await sendAndLog(lead, artisan, reply);
        return;
      }
      let calendarEventId = "";
      if (artisan.googleCalendarId) {
        calendarEventId =
          (await createCalendarEvent(artisan.googleCalendarId, {
            start: appointment.startTime,
            end: appointment.endTime,
            summary: `Intervention - ${lead.problemType ?? "demande client"}`,
            description: `Client: ${lead.name ?? "?"} - Tél: ${lead.clientPhone} - Adresse: ${lead.address ?? "?"}`,
          })) ?? "";
      }
      await confirmAppointment(appointment.id, calendarEventId);
      const updatedLead = await updateLead(lead.id, { status: "confirme" });
      await sendAndLog(updatedLead, artisan, decision.reply);

      if (!artisan.twilioNumber || !artisan.forwardingNumber) {
        throw new Error(`L'artisan "${artisan.name}" n'a pas de numéro Twilio/portable configuré, récapitulatif non envoyé.`);
      }
      const slotLabel = formatSlotFr(appointment.startTime);
      await sendSms({
        to: artisan.forwardingNumber,
        from: artisan.twilioNumber,
        body: recapForArtisan({
          clientPhone: updatedLead.clientPhone,
          name: updatedLead.name,
          problemType: updatedLead.problemType,
          address: updatedLead.address,
          urgent: updatedLead.urgent,
          slotLabel,
        }),
      });
      return;
    }
    case "none": {
      const updatedLead = await updateLead(lead.id, {
        name: decision.nextState.name,
        problemType: decision.nextState.problemType,
        address: decision.nextState.address,
        urgent: decision.nextState.urgent,
        status: decision.nextState.status === "nouveau" ? "en_qualification" : decision.nextState.status,
      });
      await sendAndLog(updatedLead, artisan, decision.reply);
      return;
    }
  }
}
