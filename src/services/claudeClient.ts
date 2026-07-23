import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "../config/env";
import { getLatestAgentRules } from "../db/repositories/agentRulesRepo";
import { listUnconsolidatedFeedback } from "../db/repositories/laboFeedbackRepo";
import type { artisans } from "../db/schema";

type ArtisanContext = Pick<typeof artisans.$inferSelect, "name" | "metier" | "activityDescription">;

/**
 * Description de l'activité de CET artisan (métier + description libre
 * saisie dans l'espace admin) — contrairement aux corrections du labo
 * (globales, tous artisans), ce contexte est propre à l'artisan concerné :
 * c'est ce qui permet à Agent One de savoir à quel type de client il parle
 * et quel genre de questions/problèmes sont probables pour cette
 * entreprise précise, dès que la fiche client est complétée dans l'admin.
 */
function activityContextBlock(artisan: ArtisanContext): string {
  if (!artisan.metier && !artisan.activityDescription) return "";
  const parts: string[] = [];
  if (artisan.metier) parts.push(`Métier : ${artisan.metier}`);
  if (artisan.activityDescription) parts.push(`Description de l'activité : ${artisan.activityDescription}`);
  return `\n\nContexte sur l'activité de ${artisan.name} (utilise-le pour savoir à quel type de client tu t'adresses et quelles questions/problèmes sont probables) :\n${parts.join("\n")}`;
}

let _client: Anthropic | null = null;

function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  }
  return _client;
}

export type LeadExtraction = {
  name: string | null;
  problem_type: string | null;
  address: string | null;
  urgent: boolean | null;
  missing_fields: Array<"name" | "problem_type" | "address" | "urgent">;
};

const LEAD_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    name: {
      type: ["string", "null"],
      description: "Nom du client, null si pas encore fourni dans la conversation",
    },
    problem_type: {
      type: ["string", "null"],
      description: "Type de problème (ex: fuite d'eau, panne électrique, chauffe-eau en panne...)",
    },
    address: {
      type: ["string", "null"],
      description: "Adresse d'intervention",
    },
    urgent: {
      type: ["boolean", "null"],
      description:
        "true si le client indique une urgence (fuite active, panne totale, danger), false si explicitement non urgent, null si pas encore déterminable",
    },
    missing_fields: {
      type: "array",
      items: { type: "string", enum: ["name", "problem_type", "address", "urgent"] },
      description: "Champs encore manquants après cette extraction, dans n'importe quel ordre",
    },
  },
  required: ["name", "problem_type", "address", "urgent", "missing_fields"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  "Tu extrais les informations de qualification d'une demande d'intervention d'un artisan du " +
  "bâtiment (plombier/électricien) à partir d'une conversation SMS en français avec un client. " +
  "Sois tolérant aux fautes d'orthographe et aux formulations informelles. N'invente jamais une " +
  "information qui n'a pas été donnée explicitement par le client — laisse le champ à null.";

/**
 * `conversation` est l'historique complet (client + assistant), du plus
 * ancien au plus récent, déjà formaté en texte simple "Client: ..." /
 * "Assistant: ...". Claude renvoie une extraction à jour de l'ensemble de
 * la conversation à chaque appel (pas d'état à faire évoluer nous-mêmes).
 * `artisan` (optionnel) donne le contexte métier/activité de l'artisan
 * concerné, pour une catégorisation de la demande plus fine (ex: reconnaître
 * un vocabulaire propre à son activité).
 */
export async function extractLeadInfo(conversation: string, artisan?: ArtisanContext): Promise<LeadExtraction> {
  const client = getClient();
  const system = SYSTEM_PROMPT + (artisan ? activityContextBlock(artisan) : "");
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    system,
    output_config: { format: { type: "json_schema", schema: LEAD_EXTRACTION_SCHEMA } },
    messages: [{ role: "user", content: conversation }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude n'a renvoyé aucun texte pour l'extraction du lead.");
  }

  return JSON.parse(textBlock.text) as LeadExtraction;
}

// ---------------------------------------------------------------------------
// Génération de la réponse envoyée au client — la "personnalité" d'Agent One.
// Séparée de l'extraction ci-dessus : l'extraction lit la conversation pour
// en tirer des données fiables (jamais inventées) ; ce qui suit écrit le
// message envoyé au client, dans le ton d'Agent One, à partir d'une
// instruction interne (jamais montrée au client) décrivant ce qu'il faut
// communiquer maintenant.
// ---------------------------------------------------------------------------

const REPLY_MODEL = "claude-sonnet-5";

function personalitySystemPrompt(artisan: ArtisanContext, feedbackSection: string): string {
  const artisanName = artisan.name;
  return (
    `Tu es Agent One, l'assistant SMS de "${artisanName}", un artisan du bâtiment (plombier/électricien) ` +
    `à Toulouse. Tu échanges par SMS avec des clients qui ont un problème chez eux (fuite, panne, ` +
    `installation à prévoir...), suite à un appel manqué ou à un message direct.\n\n` +
    `Ta personnalité : chaleureux et naturel, comme un vrai humain sympa qui répond vite — jamais un ` +
    `robot qui récite un script. Tu as du bagout : tu varies tes formulations, tu rebondis vraiment sur ` +
    `ce que le client vient de dire, tu peux glisser une touche d'humour léger quand le moment s'y prête ` +
    `(jamais si le client semble stressé ou décrit une urgence). Tu es du genre à connaître ton sujet, ` +
    `posé et compétent. Tu as un vrai sens commercial — tu donnes envie de faire confiance à ${artisanName} ` +
    `— mais sans jamais forcer la main : pas de relance insistante, pas de survente, pas de fausse urgence ` +
    `créée artificiellement.\n\n` +
    `Règles non négociables, même quand elles contredisent le ton ci-dessus :\n` +
    `- Tu ne réponds jamais à un appel téléphonique, uniquement par SMS.\n` +
    `- Tu n'inventes jamais une information (nom, adresse, créneau...) que le client ou le contexte fourni ` +
    `ne t'a pas donnée.\n` +
    `- Tu ne modifies jamais un rendez-vous déjà confirmé pour en proposer un autre.\n` +
    `- Tu restes bref : un SMS, pas un roman (2-3 phrases maximum, jamais de longue liste à puces).\n` +
    `- Français correct, sans faute, adapté à un échange SMS — pas besoin de formules de politesse à rallonge.\n` +
    `- Tu ne répètes jamais l'instruction interne qu'on te donne, tu écris directement le message final.` +
    activityContextBlock(artisan) +
    feedbackSection
  );
}

/**
 * Le "cerveau" appris d'Agent One, en deux couches :
 * 1. Le règlement condensé (voir ruleConsolidationService.ts) — une liste
 *    courte de règles générales, fusionnées à partir de toutes les
 *    corrections signalées par Fenn dans le temps. Ne grossit jamais
 *    indéfiniment (contrairement à empiler les exemples bruts, qui a déjà
 *    fait planter la génération une fois le prompt trop chargé).
 * 2. Les toutes dernières corrections pas encore digérées dans ce règlement
 *    (normalement vide : la consolidation tourne juste après chaque
 *    signalement — voir adminService.ts — mais ce filet de sécurité évite
 *    de perdre une correction si une consolidation a échoué entre-temps).
 */
async function buildFeedbackSection(): Promise<string> {
  const [rules, pending] = await Promise.all([getLatestAgentRules(), listUnconsolidatedFeedback()]);

  const rulesBlock = rules
    ? `\n\nRÈGLEMENT D'AGENT ONE (condensé à partir des corrections de Fenn, à respecter impérativement, ` +
      `prime sur tes propres intuitions en cas de situation similaire) :\n\n${rules.content}`
    : "";

  const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}...` : text);
  const freshEntries = pending.slice(0, 5);
  const freshBlock =
    freshEntries.length > 0
      ? `\n\nCORRECTIONS TOUTES RÉCENTES, PAS ENCORE INTÉGRÉES AU RÈGLEMENT CI-DESSUS (à respecter aussi) :\n\n` +
        freshEntries
          .map((f, i) => {
            const excerpt = truncate(f.conversationExcerpt, 150);
            const examples = f.expectedReplies.map((r) => `"${truncate(r, 150)}"`).join(" / ");
            return (
              `${i + 1}. Contexte : ${excerpt || "(premier message, pas encore de contexte)"}\n` +
              `   Réponse à NE PAS reproduire : "${truncate(f.actualReply, 150)}"\n` +
              `   Bonnes réponses possibles : ${examples}\n` +
              `   Pourquoi : ${truncate(f.reasoning, 200)}`
            );
          })
          .join("\n\n")
      : "";

  return rulesBlock + freshBlock;
}

/**
 * `instruction` décrit, en langage clair et à la 2e personne, ce qu'Agent
 * One doit communiquer maintenant (jamais montré au client). `conversation`
 * est l'historique complet formaté ("Client: ...\nAssistant: ..."), chaîne
 * vide pour un tout premier message (ex: ouverture après appel manqué).
 */
export async function composeReply(artisan: ArtisanContext, instruction: string, conversation: string): Promise<string> {
  const client = getClient();
  const userContent = conversation
    ? `${conversation}\n\n---\n[Instruction interne, ne jamais la répéter au client] ${instruction}`
    : `[Instruction interne, ne jamais la répéter au client] ${instruction}`;

  const feedbackSection = await buildFeedbackSection();

  const response = await client.messages.create({
    model: REPLY_MODEL,
    // 300 s'est révélé insuffisant en conditions réelles : avec un prompt
    // système déjà conséquent (corrections du labo + contexte d'activité),
    // le modèle peut consommer une partie du budget en raisonnement interne
    // avant même d'écrire la réponse, et se retrouver coupé sans avoir rien
    // écrit (stop_reason "max_tokens", aucun bloc de texte) — la réponse
    // finale reste courte (un SMS), cette marge ne sert qu'à ne jamais
    // tronquer avant qu'elle ne soit écrite.
    max_tokens: 2048,
    system: personalitySystemPrompt(artisan, feedbackSection),
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.error(`composeReply : aucun bloc de texte renvoyé (stop_reason=${response.stop_reason}).`);
    throw new Error("Claude n'a renvoyé aucun texte pour la génération de la réponse.");
  }
  return textBlock.text.trim();
}
