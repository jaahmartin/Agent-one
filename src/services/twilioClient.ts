import twilio from "twilio";
import { env, requireEnv } from "../config/env";

let _client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!_client) {
    _client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return _client;
}

export async function sendSms(params: { to: string; from: string; body: string }) {
  const client = getClient();
  const message = await client.messages.create(params);
  return message;
}

/**
 * Middleware qui vérifie la signature `X-Twilio-Signature` de chaque
 * requête entrante — rejette toute requête qui ne vient pas réellement de
 * Twilio. Nécessite que `PUBLIC_BASE_URL` corresponde exactement à l'URL
 * configurée dans la console Twilio pour le numéro.
 */
export function twilioWebhookMiddleware() {
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  return twilio.webhook(authToken);
}
