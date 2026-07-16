import { Router } from "express";
import { findArtisanByTwilioNumber } from "../db/repositories/artisansRepo";
import { handleInboundMessage } from "../services/leadService";
import { twilioWebhookMiddleware } from "../services/twilioClient";

const router = Router();

/**
 * Reçoit aussi bien les SMS envoyés spontanément par un client que les
 * réponses du client à la relance déclenchée par un appel manqué — les
 * deux cas passent par la même fonction métier handleInboundMessage().
 */
router.post("/incoming", twilioWebhookMiddleware(), async (req, res) => {
  const clientPhone = req.body.From as string | undefined;
  const twilioNumber = req.body.To as string | undefined;
  const body = (req.body.Body as string | undefined)?.trim();
  const twilioSid = req.body.MessageSid as string | undefined;

  if (clientPhone && twilioNumber && body) {
    const artisan = await findArtisanByTwilioNumber(twilioNumber);
    if (artisan) {
      await handleInboundMessage(artisan, clientPhone, body, twilioSid);
    }
  }

  // Réponse TwiML vide : on répond déjà via l'API Twilio (sendSms) dans
  // handleInboundMessage, pas besoin de <Message> ici.
  res.type("text/xml").send("<Response></Response>");
});

export default router;
