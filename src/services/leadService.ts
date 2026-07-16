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
  proposeSlot,
  reaskConfirmation,
  recapForArtisan,
} from "./messageTemplates";

type Artisan = typeof artisans.$inferSelect;
type Lead = typeof leads.$inferSelect;

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
  await logMessage(lead.id, "in", body, twilioSid ?? null);

  if (lead.status === "creneau_propose") {
    return handleSlotResponse(artisan, lead, body);
  }

  const conversation = await buildConversationText(lead.id);
  const extraction = await extractLeadInfo(conversation);

  const updatedLead = await updateLead(lead.id, {
    name: extraction.name ?? lead.name,
    problemType: extraction.problem_type ?? lead.problemType,
    address: extraction.address ?? lead.address,
    urgent: extraction.urgent ?? lead.urgent,
    status: "en_qualification",
  });

  if (extraction.missing_fields.length > 0) {
    await sendAndLog(updatedLead, artisan, nextMissingFieldQuestion(extraction.missing_fields));
    return;
  }

  await proposeSlotToClient(artisan, updatedLead);
}

async function proposeSlotToClient(artisan: Artisan, lead: Lead) {
  if (!artisan.googleCalendarId) {
    await sendAndLog(lead, artisan, noSlotAvailable(artisan.name));
    return;
  }

  const slots = await getAvailableSlots(artisan.googleCalendarId);
  if (slots.length === 0) {
    await sendAndLog(lead, artisan, noSlotAvailable(artisan.name));
    return;
  }

  const [firstSlot] = slots;
  await createProposedAppointment(lead.id, firstSlot.start, firstSlot.end);
  const updatedLead = await updateLead(lead.id, { status: "creneau_propose" });
  await sendAndLog(updatedLead, artisan, proposeSlot(artisan.name, formatSlotFr(firstSlot.start)));
}

async function handleSlotResponse(artisan: Artisan, lead: Lead, body: string) {
  if (!looksLikeConfirmation(body)) {
    await sendAndLog(lead, artisan, reaskConfirmation());
    return;
  }

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
  const slotLabel = formatSlotFr(appointment.startTime);

  await sendAndLog(updatedLead, artisan, appointmentConfirmed(slotLabel));

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
}
