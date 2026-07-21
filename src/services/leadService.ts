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
import { extractLeadInfo } from "./claudeClient";
import { createCalendarEvent, getAvailableSlots } from "./calendarClient";
import { formatSlotFr } from "../utils/formatDate";
import {
  appointmentConfirmed,
  looksLikeConfirmation,
  missedCallOpening,
  nextMissingFieldQuestion,
  noSlotAvailable,
  proposeSlot as proposeSlotMessage,
  reaskConfirmation,
  recapForArtisan,
} from "./messageTemplates";

type Artisan = typeof artisans.$inferSelect;
type Lead = typeof leads.$inferSelect;

// ---------------------------------------------------------------------------
// Étage 1 — DÉCIDER : ce que dit Agent One ensuite, jamais d'effet réel
// (pas de SMS envoyé, pas d'écriture en base, pas d'événement d'agenda créé).
// Utilisé à la fois par le vrai webhook SMS ci-dessous et par le futur
// simulateur du labo Agent One (espace admin) — voir simulateReply().
// La seule chose "réelle" qu'elle touche est la lecture (pas l'écriture) des
// disponibilités Google Calendar, nécessaire pour proposer un créneau
// crédible, y compris en simulation.
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
  if (state.status === "creneau_propose") {
    return decideSlotResponse(state, incomingMessage);
  }
  const fullHistory = history ? `${history}\nClient: ${incomingMessage}` : `Client: ${incomingMessage}`;
  return decideQualification(artisan, state, fullHistory);
}

async function decideQualification(
  artisan: Artisan,
  state: ConversationState,
  fullHistory: string,
): Promise<ConversationDecision> {
  const extraction = await extractLeadInfo(fullHistory);
  const qualifiedState: ConversationState = {
    ...state,
    name: extraction.name ?? state.name,
    problemType: extraction.problem_type ?? state.problemType,
    address: extraction.address ?? state.address,
    urgent: extraction.urgent ?? state.urgent,
    status: "en_qualification",
  };

  if (extraction.missing_fields.length > 0) {
    return { reply: nextMissingFieldQuestion(extraction.missing_fields), nextState: qualifiedState, action: { type: "none" } };
  }

  return decideProposeSlot(artisan, qualifiedState);
}

async function decideProposeSlot(artisan: Artisan, state: ConversationState): Promise<ConversationDecision> {
  if (!artisan.googleCalendarId) {
    return { reply: noSlotAvailable(artisan.name), nextState: state, action: { type: "none" } };
  }

  const slots = await getAvailableSlots(artisan.googleCalendarId);
  if (slots.length === 0) {
    return { reply: noSlotAvailable(artisan.name), nextState: state, action: { type: "none" } };
  }

  const [firstSlot] = slots;
  const nextState: ConversationState = { ...state, status: "creneau_propose", proposedSlot: firstSlot };
  return {
    reply: proposeSlotMessage(artisan.name, formatSlotFr(firstSlot.start)),
    nextState,
    action: { type: "propose_slot", slot: firstSlot },
  };
}

function decideSlotResponse(state: ConversationState, incomingMessage: string): ConversationDecision {
  if (!looksLikeConfirmation(incomingMessage) || !state.proposedSlot) {
    return { reply: reaskConfirmation(), nextState: state, action: { type: "none" } };
  }
  const slot = state.proposedSlot;
  return {
    reply: appointmentConfirmed(formatSlotFr(slot.start)),
    nextState: state,
    action: { type: "confirm_appointment", slot },
  };
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

// ---------------------------------------------------------------------------
// Étage 2b — AGIR pour de vrai (webhooks Twilio) : charge/écrit en base,
// envoie les SMS, crée l'événement d'agenda. C'est le seul endroit où les
// effets réels ont lieu.
// ---------------------------------------------------------------------------

async function sendAndLog(lead: Lead, artisan: Artisan, body: string) {
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
  await sendAndLog(lead, artisan, missedCallOpening(artisan.name));
  if (lead.status === "nouveau") {
    await updateLead(lead.id, { status: "en_qualification" });
  }
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
        await sendAndLog(lead, artisan, reaskConfirmation());
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
