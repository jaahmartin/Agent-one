import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "../config/env";
import { listUnconsolidatedPraise, markPraiseConsolidated } from "../db/repositories/agentPraiseRepo";
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
  "de Fenn (plombiers, électriciens...). On te donne le règlement actuel (peut être vide), puis deux types " +
  "d'entrées possibles : des corrections (réponses jugées mauvaises par Fenn, à éviter à l'avenir) et des " +
  "réponses félicitées (réponses jugées parfaites par Fenn dans leur contexte, à conserver/renforcer). Ta " +
  "tâche : produire une version mise à jour et complète du règlement, sous forme de liste à puces courtes " +
  "et actionnables.\n\n" +
  "Règles impératives :\n" +
  "- Généralise chaque entrée : n'y laisse jamais le nom d'un artisan précis ni un métier/secteur " +
  "particulier (ex: pas de \"nettoyage de véhicule\"), sauf si la règle porte explicitement sur une " +
  "distinction de métier générale (ex: urgence électrique vs urgence plomberie) — le règlement s'applique à " +
  "tous les artisans, quel que soit leur métier.\n" +
  "- Pour une correction : ajoute ou renforce une règle qui l'évite à l'avenir.\n" +
  "- Pour une réponse félicitée : n'ajoute une nouvelle règle que si elle révèle un comportement pas encore " +
  "couvert par le règlement actuel ; si le comportement est déjà couvert, laisse le règlement inchangé sur ce " +
  "point plutôt que de dupliquer une règle existante.\n" +
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

function formatPendingPraise(entries: Awaited<ReturnType<typeof listUnconsolidatedPraise>>): string {
  return entries
    .map((p, i) => {
      return (
        `${i + 1}. Contexte : ${p.conversationExcerpt || "(premier message, pas encore de contexte)"}\n` +
        `   Réponse validée comme parfaite dans ce contexte : "${p.likedReply}"`
      );
    })
    .join("\n\n");
}

/**
 * Digère les corrections et félicitations du labo pas encore traitées dans
 * le règlement condensé — appelée automatiquement après chaque nouveau
 * signalement ou "like" (voir adminService.ts), qu'il vienne de l'espace
 * admin ou d'un ajout direct. Ne fait rien s'il n'y a rien de nouveau à
 * digérer. Ne lève jamais d'erreur : un échec de consolidation ne doit
 * jamais empêcher l'enregistrement du signalement/like lui-même.
 */
export async function consolidateAgentRules(): Promise<{ updated: boolean; rulesCount?: number }> {
  try {
    const [pendingCorrections, pendingPraise] = await Promise.all([
      listUnconsolidatedFeedback(),
      listUnconsolidatedPraise(),
    ]);
    if (pendingCorrections.length === 0 && pendingPraise.length === 0) return { updated: false };

    const previous = await getLatestAgentRules();
    const sections = [`RÈGLEMENT ACTUEL :\n${previous?.content ?? "(vide, aucune règle pour l'instant)"}`];
    if (pendingCorrections.length > 0) {
      sections.push(`CORRECTIONS À INTÉGRER (à éviter à l'avenir) :\n\n${formatPendingFeedback(pendingCorrections)}`);
    }
    if (pendingPraise.length > 0) {
      sections.push(`RÉPONSES FÉLICITÉES (à conserver/renforcer) :\n\n${formatPendingPraise(pendingPraise)}`);
    }

    const client = getClient();
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      system: CONSOLIDATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: sections.join("\n\n") }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error(`consolidateAgentRules : aucun texte renvoyé (stop_reason=${response.stop_reason}).`);
      return { updated: false };
    }

    const newRules = await insertAgentRules(textBlock.text.trim());
    await Promise.all([
      markFeedbackConsolidated(pendingCorrections.map((f) => f.id)),
      markPraiseConsolidated(pendingPraise.map((p) => p.id)),
    ]);

    const rulesCount = newRules.content.split("\n").filter((line) => line.trim().startsWith("-")).length;
    return { updated: true, rulesCount };
  } catch (err) {
    console.error("consolidateAgentRules : échec de la consolidation, signalement/like conservé tel quel.", err);
    return { updated: false };
  }
}
