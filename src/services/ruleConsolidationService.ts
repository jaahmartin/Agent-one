import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "../config/env";
import { getLatestAgentRules, insertAgentRules } from "../db/repositories/agentRulesRepo";
import { listUnconsolidatedFeedback, markFeedbackConsolidated } from "../db/repositories/laboFeedbackRepo";

let _client: Anthropic | null = null;

function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  }
  return _client;
}

const CONSOLIDATION_SYSTEM_PROMPT =
  "Tu maintiens le règlement interne d'Agent One, l'assistant SMS partagé par tous les artisans clients " +
  "de Fenn (plombiers, électriciens...). On te donne le règlement actuel (peut être vide) et de nouvelles " +
  "corrections concrètes signalées par Fenn suite à de mauvaises réponses d'Agent One. Ta tâche : produire " +
  "une version mise à jour et complète du règlement, sous forme de liste à puces courtes et actionnables.\n\n" +
  "Règles impératives :\n" +
  "- Généralise chaque correction : n'y laisse jamais le nom d'un artisan précis ni un métier/secteur " +
  "particulier (ex: pas de \"nettoyage de véhicule\"), sauf si la règle porte explicitement sur une " +
  "distinction de métier générale (ex: urgence électrique vs urgence plomberie) — le règlement s'applique à " +
  "tous les artisans, quel que soit leur métier.\n" +
  "- Fusionne les règles nouvelles qui recoupent des règles existantes au lieu de les dupliquer.\n" +
  "- Reste concis : vise 20 règles maximum. Si tu dépasses, fusionne ou supprime les moins utiles.\n" +
  "- Réponds uniquement avec la liste à puces (une règle par ligne, préfixée par \"- \"), rien d'autre : " +
  "pas de titre, pas de commentaire, pas d'explication.";

function formatPendingFeedback(entries: Awaited<ReturnType<typeof listUnconsolidatedFeedback>>): string {
  return entries
    .map((f, i) => {
      const examples = f.expectedReplies.map((r) => `"${r}"`).join(" / ");
      return (
        `${i + 1}. Contexte : ${f.conversationExcerpt || "(premier message, pas encore de contexte)"}\n` +
        `   Réponse à NE PAS reproduire : "${f.actualReply}"\n` +
        `   Bonnes réponses possibles : ${examples}\n` +
        `   Pourquoi : ${f.reasoning}`
      );
    })
    .join("\n\n");
}

/**
 * Digère les corrections du labo pas encore traitées dans le règlement
 * condensé — appelée automatiquement après chaque nouveau signalement (voir
 * adminService.ts), qu'il vienne de l'espace admin ou d'un ajout direct. Ne
 * fait rien s'il n'y a rien de nouveau à digérer. Ne lève jamais d'erreur :
 * un échec de consolidation ne doit jamais empêcher l'enregistrement du
 * signalement lui-même.
 */
export async function consolidateAgentRules(): Promise<{ updated: boolean; rulesCount?: number }> {
  try {
    const pending = await listUnconsolidatedFeedback();
    if (pending.length === 0) return { updated: false };

    const previous = await getLatestAgentRules();
    const userContent =
      `RÈGLEMENT ACTUEL :\n${previous?.content ?? "(vide, aucune règle pour l'instant)"}\n\n` +
      `NOUVELLES CORRECTIONS À INTÉGRER :\n\n${formatPendingFeedback(pending)}`;

    const client = getClient();
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      system: CONSOLIDATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error(`consolidateAgentRules : aucun texte renvoyé (stop_reason=${response.stop_reason}).`);
      return { updated: false };
    }

    const newRules = await insertAgentRules(textBlock.text.trim());
    await markFeedbackConsolidated(pending.map((f) => f.id));

    const rulesCount = newRules.content.split("\n").filter((line) => line.trim().startsWith("-")).length;
    return { updated: true, rulesCount };
  } catch (err) {
    console.error("consolidateAgentRules : échec de la consolidation, signalement conservé tel quel.", err);
    return { updated: false };
  }
}
