// Le texte envoyé au client est désormais écrit par Claude à chaque fois
// (voir claudeClient.ts, composeReply) pour avoir une vraie personnalité —
// ce fichier ne garde que ce qui reste un texte fixe : le récapitulatif
// interne envoyé à l'artisan (pas une conversation, une notification), et
// la détection simple d'une confirmation du client.

const CONFIRMATION_KEYWORDS = ["oui", "ok", "d'accord", "daccord", "confirme", "confirmé", "confirmée"];

export function looksLikeConfirmation(body: string): boolean {
  const normalized = body.trim().toLowerCase();
  return CONFIRMATION_KEYWORDS.some((keyword) => normalized.includes(keyword));
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
