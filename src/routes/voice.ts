import { Router } from "express";
import { twiml } from "twilio";
import { findArtisanByTwilioNumber } from "../db/repositories/artisansRepo";
import { hasProcessedCall, markCallProcessed } from "../db/repositories/processedCallsRepo";
import { handleMissedCall } from "../services/leadService";
import { twilioWebhookMiddleware } from "../services/twilioClient";

const router = Router();
const { VoiceResponse } = twiml;

const DIAL_TIMEOUT_SECONDS = 18;

/**
 * Le client compose le numéro Twilio de l'artisan. On sonne en temps réel
 * chez l'artisan via <Dial> ; le résultat (décroché ou non) arrive au
 * webhook /dial-status ci-dessous, quel que soit le cas (décroché, occupé,
 * pas de réponse, échec, ou raccroché par le client avant réponse).
 */
router.post("/incoming", twilioWebhookMiddleware(), async (req, res) => {
  const response = new VoiceResponse();
  const artisan = await findArtisanByTwilioNumber(req.body.To);

  if (!artisan || !artisan.forwardingNumber) {
    response.say({ language: "fr-FR" }, "Ce numéro n'est pas configuré. Merci de réessayer plus tard.");
    response.hangup();
    res.type("text/xml").send(response.toString());
    return;
  }

  const dial = response.dial({
    timeout: DIAL_TIMEOUT_SECONDS,
    action: "/webhooks/voice/dial-status",
    method: "POST",
  });
  dial.number(artisan.forwardingNumber);

  res.type("text/xml").send(response.toString());
});

/**
 * Callback appelé une seule fois, après la tentative d'appel. DialCallStatus
 * vaut 'completed' si l'artisan a décroché ; sinon ('busy', 'no-answer',
 * 'failed', 'canceled') on envoie immédiatement le SMS de prise en charge.
 */
router.post("/dial-status", twilioWebhookMiddleware(), async (req, res) => {
  const dialCallStatus = req.body.DialCallStatus as string | undefined;
  const callSid = req.body.CallSid as string | undefined;
  const clientPhone = req.body.From as string | undefined;
  const twilioNumber = req.body.To as string | undefined;

  const response = new VoiceResponse();

  const missed = dialCallStatus !== "completed";
  if (missed && callSid && clientPhone && twilioNumber) {
    const alreadyProcessed = await hasProcessedCall(callSid);
    if (!alreadyProcessed) {
      const wasFirstToClaim = await markCallProcessed(callSid);
      if (wasFirstToClaim) {
        const artisan = await findArtisanByTwilioNumber(twilioNumber);
        if (artisan) {
          await handleMissedCall(artisan, clientPhone);
        }
      }
    }
    response.say(
      { language: "fr-FR" },
      "Merci pour votre appel, nous revenons vers vous par SMS à l'instant.",
    );
  }

  response.hangup();
  res.type("text/xml").send(response.toString());
});

export default router;
