import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "../config/env";

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
 */
export async function extractLeadInfo(conversation: string): Promise<LeadExtraction> {
  const client = getClient();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: LEAD_EXTRACTION_SCHEMA } },
    messages: [{ role: "user", content: conversation }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude n'a renvoyé aucun texte pour l'extraction du lead.");
  }

  return JSON.parse(textBlock.text) as LeadExtraction;
}
