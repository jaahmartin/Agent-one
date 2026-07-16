# Agent ONE

## Le projet

Agent ONE est un agent IA de réception et de qualification de leads pour les
artisans du bâtiment (plombiers, électriciens en priorité), basé à Toulouse.

Le client final (le particulier qui a une fuite d'eau, une panne électrique,
etc.) appelle ou envoie un SMS à l'artisan. Souvent l'artisan ne peut pas
répondre tout de suite (il est sur un chantier). Agent ONE prend le relais
automatiquement pour ne pas perdre le lead.

## Utilisateur du projet

- Ne sait pas coder : Claude écrit et maintient tout le code.
- Attend des propositions simples, expliquées en langage non-technique,
  avant toute implémentation.

## Parcours fonctionnel du MVP

1. Un appel ou SMS du client final arrive et reste sans réponse de l'artisan.
2. Agent ONE relance le client final par SMS en moins d'une minute.
3. Agent ONE qualifie la demande par SMS : nom, type de problème, adresse,
   urgence (oui/non).
4. Agent ONE consulte l'agenda Google de l'artisan, propose un créneau et le
   bloque dès confirmation du client final.
5. Agent ONE envoie un récapitulatif à l'artisan (SMS).
6. Si le client final ne confirme pas le rendez-vous dans les 24h, Agent ONE
   envoie une relance automatique.

## Contraintes

- MVP simple et fonctionnel avant toute sophistication (pas de bot vocal IA
  en V1, pas de multi-métiers, pas de multi-villes).
- Doit pouvoir se connecter à un service de téléphonie/SMS (Twilio ou
  équivalent) et à Google Calendar.

## Stack technique retenue (et pourquoi)

- **Canal client final : SMS uniquement pour le MVP** (pas de robot vocal qui
  décroche). Un vrai agent voix (reconnaissance vocale en temps réel) est
  bien plus complexe et coûteux à fiabiliser ; le SMS permet de répondre en
  moins d'une minute avec beaucoup moins de risques techniques. Un appel
  manqué déclenche un SMS automatique de prise en charge. Piste V2 : ajouter
  un vrai agent vocal (ex. Twilio + Vapi/Retell/Bland.ai).
- **Téléphonie/SMS : Twilio.** Standard du marché, fonctionne en France,
  permet de louer un numéro dédié par artisan et de recevoir/envoyer des SMS
  et des appels via une API.
- **Cerveau conversationnel : Claude (API Anthropic).** Comprend les messages
  du client final en langage naturel et en extrait les informations
  structurées (nom, problème, adresse, urgence), même si le message est
  informel ou incomplet.
- **Agenda : Google Calendar API.** Lit les disponibilités de l'artisan et
  crée directement l'événement de rendez-vous.
- **Serveur applicatif : Node.js/TypeScript**, hébergé sur une plateforme
  simple (Render ou Railway) qui déploie depuis le code sans gestion serveur
  manuelle. C'est ce serveur qui reçoit les webhooks Twilio, appelle Claude,
  parle à Google Calendar et déclenche les relances.
- **Base de données : Supabase (Postgres managé).** Stocke leads,
  conversations et rendez-vous, avec une interface visuelle permettant de
  tout consulter sans coder.
- **Relance : tâche planifiée (cron)** intégrée au process du serveur
  (`node-cron`), qui envoie les relances J+3/J+7/J+14 (mis à jour depuis la
  version "24h" initiale — voir CONTEXTE_AGENT_ONE.md, qui fait référence).

## Comptes/accès à prévoir avant l'implémentation

- Compte Twilio + numéro de téléphone français.
- Clé API Anthropic (Claude).
- Accès Google Calendar de l'artisan pilote (OAuth "application de bureau").
- Compte d'hébergement Render + compte Supabase.

Voir `README.md` à la racine du projet pour la marche à suivre détaillée
(ordre de création des comptes, variables d'environnement, test local via
ngrok, déploiement).

## Statut actuel

MVP entièrement codé (webhooks Twilio voix/SMS, pipeline de qualification,
extraction Claude, Google Calendar, récap artisan, cron de relance) et
compile sans erreur (`npm run build`). Reste à créer les comptes externes
et à tester en conditions réelles avec l'artisan pilote.

## Prochaines étapes possibles

- Créer les comptes externes (Twilio, Render, Supabase, Anthropic, Google)
  et suivre `README.md` pour connecter le tout.
- Tester le parcours de bout en bout avec un numéro de test, puis avec
  l'artisan pilote réel.
