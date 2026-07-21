# CONTEXTE PROJET — AGENT ONE / FENN

Fichier unique de référence, consolidé à partir de trois fichiers précédents (CONTEXTE_AGENT_ONE.md, STATUT_ET_PRIORITE_DASHBOARD.md, Fichier_Fenn_Code_Dashboard.md — ces deux derniers sont désormais obsolètes et peuvent être supprimés). À lire intégralement avant toute action.

## Qui est Mathéo (le porteur du projet)

- 23 ans, basé à Toulouse, en CDI 25h/semaine (~1000€/mois net actuellement)
- Aucune compétence en code — il ne développe rien lui-même. Son rôle : direction créative, stratégie, décisions, vente terrain, test produit
- Toute l'exécution technique doit être portée par Claude (chat + Claude Code)
- **Objectif personnel** : quitter son CDI le plus tôt possible, au plus tard le 19 novembre 2026 (24e anniversaire), avec un revenu net de 3000€ à 5000€/mois après charges
- **Point de vigilance non résolu** : vérifier l'absence de clause d'exclusivité/non-concurrence dans son contrat de CDI

## Le projet en une phrase

Une agence, **Fenn**, qui propose aux artisans du bâtiment un produit appelé **Agent ONE** : un agent IA qui répond par SMS aux appels manqués, qualifie la demande, prend rendez-vous dans l'agenda de l'artisan, et relance automatiquement les prospects — pour ne plus jamais perdre un client faute d'avoir décroché.

## Architecture de marque — FIGÉE

- **Fenn** = l'agence / la maison mère. Wordmark affiché dans la sidebar et le menu mobile du dashboard.
- **Agent ONE** = le produit/agent IA lui-même, déployé chez chaque artisan. Apparaît dans la pastille de statut ("Agent One — Actif") et dans tous les textes décrivant une action de l'agent.
- Ne jamais interchanger les deux noms : Fenn ne répond jamais aux SMS, c'est Agent One qui le fait, pour le compte de Fenn.

## Identité visuelle — FIGÉE, ne plus rouvrir sans décision explicite de Mathéo

**Logo : "Le Fil"** — trait unique continu formant une boucle puis repartant en ligne droite, terminaisons carrées nettes.

**Tracé vectoriel exact — source de vérité unique, ne jamais retranscrire à la main** :
`M 174,136 C 302,136 302,360 206,360 C 142,360 142,272 198,272 L 390,272` dans un `viewBox="0 0 512 512"`, trait `stroke-width="38"`, `stroke-linecap="square"`, `stroke-linejoin="round"`, sans remplissage. Toute déclinaison (couleur, taille, fond) doit réutiliser ce tracé strictement identique, en l'englobant dans un `<svg>` imbriqué redimensionné plutôt qu'en recalculant ses coordonnées.

**Police du wordmark "Fenn"** : Space Grotesk, graisse SemiBold (600) uniquement. Toujours prévoir une pile de secours strictement sans-serif (`'Space Grotesk', 'Helvetica Neue', Arial, sans-serif`) et importer la police explicitement — ne jamais laisser retomber sur une police par défaut (risque de rendu en serif déjà rencontré et corrigé).

**Police du reste de l'interface** : Inter (400/500/600/700). Aucune police monospace, aucun serif, aucune police script, nulle part.

**Fichiers d'assets disponibles** (livrés, à copier dans le projet) : `icon-master.svg` (noir), `icon-white.svg`, `icon-blue.svg`, `app-icon-dark.svg`, `app-icon-light.svg`, `app-icon-pastel.svg`, `app-icon-blue-solid.svg`, `logo-horizontal.svg` (+ `-white`, `-blue`), `favicon.ico`, `favicon-16.png`, `favicon-32.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`.

**Contrainte impérative d'apparence** : le dashboard ne doit **jamais** s'adapter au mode sombre/clair du système de l'utilisateur, sur aucun appareil. Toujours déclarer `color-scheme: light` (meta + CSS `:root`), ne jamais utiliser `prefers-color-scheme`, toutes les couleurs viennent des variables CSS définies ci-dessous.

### Palette de couleurs définitive

| Rôle | Valeur |
|---|---|
| Fond principal | `#F5F5F7` |
| Surface (cartes) | `#FFFFFF` |
| Bordure | `#D2D2D7` |
| Texte principal | `#1D1D1F` |
| Texte secondaire | `#6E6E73` |
| Accent (bleu roi chaud) | `#0C00B6` |
| Accent — hover | `#0A009B` |
| Accent — teinte 10% | `#E7E6F8` |
| Accent — teinte 20% | `#CECCF0` |
| Positif (vert) | `#229955` |
| Positif — fond | `#E3F6EA` |
| Positif — bordure | `#B7E4C7` |
| Alerte (pastille rouge) | `#D64545` |

**Échelle d'espacement** (suite de Fibonacci, approxime le nombre d'or) : `8px · 13px · 21px · 34px · 55px · 89px · 144px`. Le rapport logo/texte du wordmark suit aussi cette logique (≈1,618).

**Inspiration générale** : palette et esprit Apple — clarté, minimalisme, beaucoup de blanc/gris clair, peu de couleur, jamais tape-à-l'œil.

## Capacités réelles d'Agent ONE — à respecter strictement

**Ce qu'Agent ONE fait** : répondre aux SMS, envoyer des SMS, relancer les clients par SMS, prendre rendez-vous dans l'outil d'agenda de l'artisan.

**Ce qu'Agent ONE ne fait jamais** : répondre aux appels téléphoniques (l'appel manqué reste un fait sur la ligne de l'artisan ; Agent One n'intervient qu'ensuite, par SMS), déplacer un rendez-vous déjà confirmé pour en insérer un nouveau.

Le vocal a été volontairement écarté du MVP après analyse (complexité technique — 4 briques à assembler : téléphonie + transcription + LLM + synthèse vocale, latence <800ms requise, attestation anti-spam obligatoire, coût 0,11-0,33$/minute) — piste V2 uniquement, une fois la trésorerie et le temps d'ingénierie disponibles.

## Scope du MVP

1. Répondre au SMS déclenché par un appel/SMS manqué du client final, en moins d'une minute
2. Qualifier la demande : nom, type de problème, adresse, urgence (oui/non)
3. Proposer un créneau et le bloquer dans l'agenda de l'artisan
4. Envoyer un récapitulatif à l'artisan avec toutes les infos collectées
5. Relancer automatiquement le prospect (voir section dédiée ci-dessous)

**Explicitement exclu de cette V1** : devis automatique chiffré, paiement en ligne, multi-langue, gestion multi-utilisateurs, réponse aux appels vocaux.

## Fonctionnalité de relance — spécification complète

Trois types de relance automatique, une seule tentative chacune :

1. **Rappel avant rendez-vous confirmé** — 2 jours avant le RDV. Ne se déclenche pas si le délai est trop court.
2. **Relance après silence sur le premier message** — quelques heures après le message initial (même jour). Au-delà, le contact reste dans "À rappeler" pour action manuelle.
3. **Relance après un "je vais réfléchir"** — à J+3.

**Règle d'arrêt commune** : dès que l'artisan clique "Confirmé" ou supprime (poubelle) un contact depuis "À rappeler", toute relance automatique en cours sur ce contact s'arrête immédiatement — ces actions déjà prévues dans le dashboard servent aussi de déclencheur d'arrêt, aucun mécanisme séparé à construire.

## Le dashboard — spécification complète

**Rôle** : outil de réassurance et de transparence pour un public peu à l'aise avec l'IA — montrer, jamais cacher. Pas un outil de gestion complet : il ne remplace pas l'outil de gestion de chantier existant de l'artisan, il documente uniquement ce qu'Agent One a personnellement accompli (SMS, conversion, chantiers sécurisés, CA généré).

**Fichier de référence final : `fenn-dashboard-maquette-v14.html`** — toutes les versions antérieures (v2 à v13, et la toute première `agent-one-dashboard-maquette.html`) sont obsolètes, à ignorer.

**Structure de navigation** :
- Desktop (>800px) : sidebar fixe (233px), logo Fenn cliquable en haut (retour à l'accueil), liste d'onglets
- Mobile (≤800px) : barre supérieure + menu hamburger en panneau superposé, mêmes onglets
- Onglets : Vue d'ensemble (par défaut) · Rendez-vous · À rappeler · Chiffre d'affaires · Relances · Réglages (Appels et Taux de conversion sont accessibles uniquement via les cartes de la vue d'ensemble, pas dans la sidebar)
- Toutes les cartes/sections sont cliquables et mènent à une vue détaillée avec bouton "← Retour"

**Vue d'ensemble** : salutation, bandeau "X appels manqués relayés par SMS aujourd'hui", grille de 5 cartes de même hauteur (SMS envoyés avec courbe de tendance intégrée, Rendez-vous confirmés, Sans suite — corrélée en temps réel au nombre de contacts "à rappeler", Taux de conversion, Relances programmées aujourd'hui), aperçu "À rappeler" (3 contacts visibles + lien "+N autres" dépliable sans changer de page), aperçu Chiffre d'affaires avec bouton "Ajouter un chiffre d'affaire" accessible directement.

**Rendez-vous confirmés** : trois blocs Aujourd'hui / Cette semaine / Ce mois-ci. Chaque contact cliquable révèle résumé de l'échange SMS, horodatage, confirmation par Agent One, et CA (ou bouton d'ajout + pastille rouge si manquant). Cette semaine/Ce mois-ci s'ouvrent en cliquant n'importe où sur le titre, affichent 3 contacts par défaut avec possibilité de dérouler le reste.

**À rappeler** : liste complète, chaque contact cliquable révèle le résumé de l'échange. Trois actions par contact : "Rappeler" (ouvre l'appel), "Confirmé" (vert — déplace le contact vers Rendez-vous confirmés avec la mention "Confirmé par l'entreprise" + bouton "Ajouter détails"), et suppression (icône poubelle vectorielle). Ces deux dernières actions arrêtent aussi toute relance automatique en cours et décrémentent en temps réel les compteurs liés (badge "À rappeler", carte "Sans suite", carte "Rendez-vous confirmés").

**SMS envoyés** (vue séparée, distincte du Taux de conversion) : délai moyen d'envoi après raccroché (`< 1 seconde`) avec exemples horodatés concrets, volume par période.

**Taux de conversion** (vue séparée, la plus analytique du dashboard) : taux global affiché en tête, puis deux cartes distinctes — "Entonnoir de conversion" (SMS envoyés → réponses obtenues → RDV confirmés, barres proportionnelles) et "Évolution par période" (courbe + SMS envoyés + réponses obtenues + discussions ayant conclu à un RDV + variation %) — chacune avec son propre sélecteur Aujourd'hui/Semaine/Mois indépendant.

**Chiffre d'affaires** : total affiché, détail client par client trié chronologiquement (la somme doit toujours correspondre exactement au total affiché), chaque client cliquable révèle date, type de chantier, résumé, et bouton d'export individuel. Formulaire d'ajout avec champs période (dates), client (nom/prénom/numéro), artisan ayant réalisé le chantier, chiffre d'affaires, date de réalisation, type de chantier.

**Relances** : deux onglets — "Aujourd'hui" (flux chronologique unique mélangeant les 3 types de relance, trié par heure d'envoi, chaque ligne cliquable pour voir le message exact prévu) et "À venir" (semaine/mois suivants).

**Réglages** (lecture seule) : numéro utilisé par l'agent, canal (SMS uniquement), disponibilité, notifications, abonnement, plus un encart séparé "Contacter Fenn" (coordonnées de Mathéo, pour rassurer qu'un humain reste joignable).

**Deux besoins de déploiement** : une version réelle par client (lien privé unique, pas de login classique en V1) + une version démo à données fictives pour les rendez-vous commerciaux de Mathéo.

## Contraintes techniques

- Téléphonie/SMS : Twilio
- Agenda : Google Calendar (MCP), ou l'outil déjà utilisé par l'artisan
- Hébergement envisagé : infrastructure cloud d'Anthropic pour agents persistants (Claude Managed Agents)
- Base de données : Supabase (déjà configuré et fonctionnel)
- Mathéo ne code pas : vulgariser tout choix technique avant implémentation

## Statut Twilio (à vérifier avec Mathéo avant de reprendre cette partie)

Premier dossier réglementaire ("Individual") rejeté par Twilio. Mathéo doit le refaire en type "Business" avec les documents de sa micro-entreprise (déjà immatriculée depuis 2021, mais nécessite une mise à jour de son code d'activité via le Guichet unique, actuellement bloquée par un problème de connexion FranceConnect/NFC — plusieurs solutions de contournement ont été données : utiliser un autre fournisseur FranceConnect que "France Identité" (ex: impots.gouv.fr), ou passer par "INPI Connect"). Tant que le numéro n'est pas obtenu, la partie SMS/téléphonie reste en pause sans bloquer le reste.

## Modèle économique

- Frais d'installation one-shot par client artisan : 500-800€
- Abonnement mensuel récurrent : ~200-300€/mois
- Statut juridique : micro-entreprise, catégorie BNC, taux URSSAF 2026 = 25,6% du CA encaissé
- Objectif 3000€ net/mois → ~16 clients actifs à 250€/mois ; objectif 5000€ net/mois → ~27 clients actifs

## Calendrier cible

Point de départ 4 juillet 2026, deadline 19 novembre 2026. Le goulot d'étranglement est le rythme de vente terrain, pas la technique — toujours prioriser un MVP démontrable rapidement plutôt que la perfection technique.

## Secteur cible et logique de configuration par métier

Priorité V1 : plombiers et électriciens à Toulouse. Architecture à prévoir dès maintenant : un moteur générique (structure, logique technique, identité de marque) + une configuration modifiable par métier (vocabulaire, questions de qualification, exemples de messages) — jamais de script codé en dur spécifique à un métier, pour permettre l'ajout rapide de nouveaux métiers (ex: nail art, esthétique) sans reconstruction. Piste future non prioritaire : connexion Instagram DM (API Meta officielle) pour les métiers à forte composante visuelle.

## Points de vigilance à trancher avant la première mise en production payante

1. Responsabilité juridique en cas d'erreur d'Agent One (à écrire dans les CGV)
2. Gestion des urgences dangereuses (fuite de gaz, danger immédiat) — mots-clés déclencheurs pour sortir du script normal
3. Filet de sécurité en cas de panne technique (Twilio/Claude/Supabase) — ne jamais laisser un client final sans réponse
4. Devenir des données à la résiliation d'un artisan (RGPD, données de tiers, durée d'engagement)
5. Résistance d'Agent One à la manipulation par SMS

## Principe d'architecture fondamental — isolation stricte des données par artisan

Agent One sert plusieurs artisans de métiers différents avec la même infrastructure technique, mais chaque artisan doit être **totalement cloisonné** des autres — jamais de mélange de vocabulaire, de prestations, ou de données entre deux clients Fenn.

**Mécanisme de cloisonnement** : le numéro de téléphone dédié de chaque artisan (voir règle "un numéro par artisan, sans exception" ci-dessus) sert de clé d'identification. Toute conversation entrante est d'abord rattachée à l'artisan propriétaire du numéro contacté, puis seule la configuration de cet artisan précis (prestations, vocabulaire, questions de qualification) est chargée pour mener la conversation. Aucune requête ne doit jamais charger les données de plusieurs artisans à la fois.

**Ce qui est partagé entre tous les artisans** : le moteur générique (structure de conversation, logique technique, identité de marque Fenn).
**Ce qui est strictement isolé par artisan** : les prestations proposées, le vocabulaire spécifique au métier, toute donnée client (leurs propres clients finaux).

Ce principe doit être respecté dès la conception de la base de données (chaque table de configuration/prestations doit être systématiquement filtrée par identifiant artisan, jamais une table globale non filtrée) — ce n'est pas une précaution éditoriale mais une exigence d'architecture non négociable.

## Fonctionnalité — l'artisan peut enrichir lui-même le vocabulaire d'Agent One

L'artisan peut ajouter de nouvelles prestations à son propre Agent One sans jamais toucher au code, via un formulaire guidé (pas de champ de texte libre) dans la section Réglages du dashboard : nom de la prestation, description courte de ce qu'elle implique, urgence typique associée. Un aperçu de ce qu'Agent One dira à un client à propos de cette prestation doit être montré et validé par l'artisan avant mise en ligne définitive — jamais de publication immédiate sans confirmation.

**Point de sécurité impératif** : ce que l'artisan saisit doit toujours être traité comme une donnée ajoutée à une liste bornée de prestations, jamais injecté comme une instruction dans le fonctionnement du moteur d'Agent One — pour éviter qu'une saisie malveillante ou maladroite ne perturbe le comportement général de l'agent au-delà de la simple prestation ajoutée.

## Pied de page légal du dashboard — à ajouter

Même si le dashboard n'est pas un site public indexé (accès via lien privé uniquement), le RGPD s'applique dès qu'il y a traitement de données personnelles — c'est le cas ici (coordonnées de l'artisan + données de ses clients finaux, des tiers). Prévoir en bas de chaque page du dashboard, en petit : lien "Mentions légales", lien "Politique de confidentialité", lien "CGU/CGV". Contenu exact à rédiger et à faire relire par un professionnel avant publication réelle — ne pas publier de version non vérifiée. Point lié à la question de vigilance n°1 (responsabilité juridique) et n°4 (RGPD, données de tiers) listées plus haut. Clarifier aussi dans le contrat Fenn/artisan (pas seulement sur le dashboard) que l'artisan reste responsable du traitement des données de ses propres clients, Fenn agissant comme sous-traitant.

## Espace admin Fenn — jamais transmis à Claude Code jusqu'ici, à intégrer maintenant

En plus du dashboard artisan, un espace admin séparé existe pour Mathéo, avec un accès distinct (email + mot de passe, sécurité renforcée par rapport aux liens privés des artisans — voir "Architecture d'accès" ci-dessous). Prototype de référence : `fenn-espace-admin-mobile-v3.html` (format mobile, à transmettre à Claude Code avec ce fichier de contexte).

### Architecture d'accès (rappel de la logique déjà actée)

- Chaque artisan reçoit un lien unique et privé (type `fenn.app/d/[code]-nom-artisan`) donnant accès uniquement à son propre dashboard — pas de mot de passe à retenir
- Mathéo a un accès admin séparé et plus sécurisé (email + mot de passe), donnant accès à l'espace décrit ci-dessous, avec visibilité sur tous les artisans

### Contenu de l'espace admin

- **Vue d'ensemble globale** : statistiques tous clients confondus (nombre de clients actifs, CA total généré, RDV confirmés, taux de conversion moyen), chacune cliquable vers un détail par client
- **Liste des clients** : tous les artisans Fenn, avec statut (actif/en pause/en attente), CA du mois, accès à leur profil
- **Bouton d'ajout de client (icône "+")** : présent à la fois sur la vue d'ensemble et sur la liste des clients. Créer un nouveau client génère une fiche en statut "en attente" (peut être annulée/supprimée) et ouvre directement son profil pour complétion
- **Profil client (admin)** : informations modifiables (nom, métier), gestion de l'abonnement (mettre en pause/réactiver/supprimer), lien d'accès unique avec copie rapide, notes internes libres, liste de tâches à faire propres à ce client
- **Labo Agent One (section critique, quasi-prioritaire selon Mathéo)** : l'endroit où Mathéo teste, forme et améliore Agent One avant tout déploiement réel chez un client. Contenu :
  - Sélecteur du client dont on veut tester la configuration (chaque client a son propre "cerveau"/config, voir principe d'isolation des données)
  - **Test de conversation** : un simulateur de chat où Mathéo tape un message "comme un client" et voit la réponse générée par Agent One pour la configuration du client sélectionné, avant que ça ne soit jamais utilisé en réel. Doit permettre de signaler un problème sur une réponse précise (pour garder une trace des corrections à faire)
  - **Compétences (skills)** : liste des prestations/vocabulaire connus d'un client donné, avec possibilité d'ajouter une compétence directement depuis l'admin (même logique que la fonctionnalité côté artisan, mais pilotable aussi par Mathéo)
  - **Ton & style** : réglages de la personnalité conversationnelle d'Agent One (curseurs du type formel/décontracté, concis/détaillé, réservé/chaleureux), ajustables par client
  - **Problèmes signalés** : historique des problèmes de comportement détectés en test ou en réel, avec statut ouvert/résolu

### Ce que ça implique techniquement pour le moteur conversationnel en cours de construction

Le moteur conversationnel d'Agent One doit être conçu pour être **testable en environnement simulé avant tout envoi réel de SMS** — c'est-à-dire qu'il doit pouvoir être invoqué avec un message d'entrée fictif et une configuration client donnée, et renvoyer la réponse générée, sans jamais réellement passer par Twilio ni toucher à un vrai client, pour que le labo Agent One puisse s'en servir. Prévoir cette séparation (logique de génération de réponse vs. logique d'envoi réel) dès la construction du moteur, pas comme un ajout après coup.

## Setup en cours côté Mathéo

- Abonnement Claude Pro actif, Claude Code installé et fonctionnel dans le Terminal macOS, dossier de travail : `~/Documents/AgentOne`
- Supabase configuré, Twilio en attente (voir section dédiée)

## Instructions comportementales pour Claude Code sur ce projet

- Toujours vulgariser les choix techniques avant implémentation, en une phrase simple
- Ne jamais sortir du scope MVP défini plus haut sans le signaler explicitement et demander validation
- Privilégier la simplicité et la rapidité à l'exhaustivité technique — deadline serrée
- Respecter strictement l'identité de marque et la contrainte d'apparence figée (voir sections dédiées)
- Tenir ce fichier à jour si des décisions importantes changent
