# INSTRUCTIONS — DOCUMENTS LÉGAUX DU DASHBOARD FENN

## Objectif

Rédiger trois documents légaux et les intégrer en pied de page de chaque page du dashboard, sous forme de trois petits liens discrets ("Mentions légales", "Politique de confidentialité", "CGU/CGV"), ouvrant chacun une page dédiée simple (pas une modale — une vraie page, plus adapté à ce type de contenu long).

**Important sur la méthode** : recherche dans tes connaissances les textes légaux français exacts applicables (LCEN pour les mentions légales, RGPD pour la politique de confidentialité, droit des contrats/Code de la consommation pour les CGU/CGV) pour produire un premier jet complet et sérieux. Là où une information précise sur Fenn/Mathéo manque (SIRET définitif, adresse d'hébergement exacte, etc.), laisse un espace clairement identifié du type `[À COMPLÉTER : ...]` plutôt que d'inventer une donnée. Le résultat final devra être relu par un professionnel du droit avant toute publication réelle — ne jamais présenter ce premier jet comme juridiquement validé ou définitif, le signaler explicitement dans un commentaire au début de chaque document.

## 1. Mentions légales (obligation LCEN, art. 6-III)

Obligatoires pour tout site/service en ligne, y compris à accès restreint par lien privé — l'obligation ne dépend ni de la taille du site ni de l'accès public ou non. Absence de mentions légales : délit pénal (jusqu'à 75 000€ d'amende pour une personne morale, 1 an de prison + 5 000€ pour une personne physique).

**Contenu obligatoire pour Mathéo/Fenn (personne physique, micro-entreprise)** :
- Nom et prénom de l'éditeur (Mathéo [nom de famille à compléter])
- Statut : micro-entrepreneur (entreprise individuelle)
- Numéro SIRET (voir CONTEXTE_AGENT_ONE.md pour le statut d'immatriculation)
- Adresse (siège de la micro-entreprise)
- Adresse email ou numéro de téléphone de contact
- Nom, adresse et téléphone de l'hébergeur du site/dashboard (une fois choisi — Render selon le contexte du projet)
- Nom du directeur de la publication (Mathéo)

Le lien vers cette page doit être accessible depuis n'importe quelle page (footer), en un clic maximum.

## 2. Politique de confidentialité (obligation RGPD)

S'applique dès qu'il y a traitement de données personnelles, indépendamment du caractère public ou privé de l'accès au site.

**Contenu obligatoire** :
- Identité et coordonnées du responsable de traitement et, si applicable, du sous-traitant (voir distinction ci-dessous — point important pour ce projet)
- Finalités précises de la collecte de données (ex : qualification des demandes clients, prise de rendez-vous, envoi de SMS de suivi)
- Base légale de chaque traitement (probablement "exécution du contrat" pour la majorité des traitements ici)
- Catégories de données collectées (nom, numéro de téléphone, adresse, contenu des échanges SMS)
- Durée de conservation des données
- Droits des personnes concernées (accès, rectification, effacement, opposition) et moyen concret de les exercer (email de contact)
- Destinataires des données (Fenn, l'artisan concerné, les sous-traitants techniques : Twilio, Supabase, hébergeur — à nommer précisément)
- Mention des transferts de données hors Union Européenne le cas échéant (vérifier la localisation des serveurs Twilio/Supabase utilisés)

**Point d'architecture juridique important, propre à ce projet** : dans la relation Fenn/artisan, c'est en principe l'**artisan qui est responsable du traitement** des données de ses propres clients finaux (c'est lui qui décide de les collecter et pourquoi) — Fenn agit comme **sous-traitant** au sens de l'article 28 du RGPD, qui traite ces données pour le compte de l'artisan. Cette répartition doit être formalisée dans un contrat séparé entre Fenn et chaque artisan (un DPA — Data Processing Agreement), pas seulement affichée sur la page publique de politique de confidentialité. Le DPA doit préciser : objet, durée et finalités du traitement, catégories de données et de personnes concernées, obligations de confidentialité et de sécurité, conditions de recours à d'autres sous-traitants (Twilio, Supabase), assistance à l'artisan pour répondre aux demandes de ses clients. Rédige un premier jet de ce DPA en document séparé (`DPA_FENN_ARTISAN.md`), à annexer au contrat commercial entre Fenn et chaque artisan — ce n'est pas un document public du dashboard.

## 3. CGU / CGV (conditions générales d'utilisation et de vente)

Encadrent la relation contractuelle entre Fenn et l'artisan (le client direct de Fenn).

**Clauses à inclure, dans un langage clair** :
- Objet du contrat (description du service Agent One tel que défini dans CONTEXTE_AGENT_ONE.md — capacités et limites explicites, notamment ce qu'Agent One ne fait jamais)
- Modalités d'abonnement, tarifs, durée d'engagement, conditions de résiliation (rappel légal : depuis juin 2023, résiliation en ligne gratuite obligatoire pour tout abonnement)
- **Clause de responsabilité** — reprendre le point de vigilance n°1 du fichier de contexte : qui porte la responsabilité entre Fenn et l'artisan en cas d'erreur d'Agent One, avec une clause de limitation de responsabilité raisonnable mais honnête, pas abusive
- Référence au DPA/RGPD (renvoi vers le document séparé mentionné au point 2)
- Propriété intellectuelle (le dashboard, la marque Fenn, le logo)
- Devenir des données à la résiliation (point de vigilance n°4 du fichier de contexte)
- Droit applicable (droit français) et juridiction compétente

## Emplacement technique dans le dashboard

Ajoute un pied de page simple et discret, visible mais en petit texte, présent sur chaque vue du dashboard (vue d'ensemble et toutes les vues détaillées) : trois liens texte "Mentions légales" · "Politique de confidentialité" · "CGU/CGV", séparés par un point médian, alignés au centre ou à gauche selon ce qui s'intègre le mieux visuellement à la charte graphique déjà en place (voir palette et typographie dans CONTEXTE_AGENT_ONE.md — texte en gris secondaire `#6E6E73`, taille réduite ~12px, jamais plus visible que le contenu principal du dashboard).
