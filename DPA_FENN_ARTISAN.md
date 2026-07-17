# ACCORD DE SOUS-TRAITANCE (DPA) — FENN / ARTISAN

> ⚠️ **Premier jet, non finalisé.** Ce document n'a pas encore été relu par un
> professionnel du droit. Il ne doit pas être signé ni annexé à un contrat
> réel tant que les sections marquées `[À COMPLÉTER]` n'ont pas été
> renseignées, que les positions proposées par défaut n'ont pas été validées
> par Mathéo, et que l'ensemble n'a pas été vérifié par un avocat.
>
> Ce document est une **annexe au contrat commercial** entre Fenn et chaque
> artisan client — ce n'est pas une page publique du dashboard.

## Parties

- **Le sous-traitant** : Fenn, micro-entreprise de Mathéo `[À COMPLÉTER : nom de famille]`, SIRET `[À COMPLÉTER]`, `[À COMPLÉTER : adresse]`.
- **Le responsable de traitement** : l'artisan signataire du contrat commercial Fenn (identité et coordonnées reprises dans ce contrat).

## 1. Objet

Le présent accord encadre le traitement, par Fenn pour le compte de l'artisan, des données personnelles des clients finaux de l'artisan, dans le cadre de la fourniture du service Agent One (réception et qualification des demandes par SMS, prise de rendez-vous, relances automatiques).

## 2. Durée

Le présent accord s'applique pendant toute la durée du contrat commercial entre Fenn et l'artisan, et jusqu'à l'exécution complète des obligations de suppression/restitution des données prévues à l'article 7.

## 3. Finalités du traitement

- Qualification des demandes reçues par SMS ou suite à un appel manqué
- Prise de rendez-vous dans l'agenda de l'artisan
- Envoi de SMS de suivi et de relance
- Mise à disposition du dashboard de suivi d'activité

## 4. Catégories de données et de personnes concernées

**Personnes concernées** : les clients finaux de l'artisan (particuliers ayant contacté l'artisan).

**Catégories de données** : nom, numéro de téléphone, adresse, contenu des échanges SMS, type de demande, urgence, date/heure de rendez-vous, chiffre d'affaires associé le cas échéant.

## 5. Obligations de Fenn (sous-traitant)

Fenn s'engage à :
- Ne traiter les données que sur instruction documentée de l'artisan, pour les finalités listées à l'article 3
- Garantir la confidentialité des données (accès limité aux personnes qui en ont besoin)
- Mettre en œuvre des mesures de sécurité techniques appropriées : isolation stricte des données par artisan (aucune requête ne charge les données de plusieurs artisans à la fois — voir principe d'architecture dans `CONTEXTE_AGENT_ONE.md`), chiffrement des connexions, accès protégé par jeton privé au dashboard
- Notifier l'artisan dans les meilleurs délais en cas de violation de données le concernant, et au plus tard `[À COMPLÉTER : délai, ex. 48h]` après en avoir eu connaissance
- Assister l'artisan pour répondre aux demandes d'exercice de droits de ses clients finaux (accès, rectification, effacement)
- Tenir un registre des catégories de traitements effectués pour le compte de l'artisan

## 6. Sous-traitants ultérieurs

Fenn a recours aux sous-traitants techniques suivants pour l'exécution du service :

| Sous-traitant | Rôle | Localisation |
|---|---|---|
| Twilio | Envoi/réception des SMS | `[À COMPLÉTER : région de résidence des données, non configurée à ce jour]` |
| Supabase | Hébergement de la base de données | Union Européenne (Irlande) |
| Render | Hébergement du serveur applicatif | `[À COMPLÉTER : région à vérifier]` |

Fenn s'engage à informer l'artisan de tout changement prévu concernant l'ajout ou le remplacement de ces sous-traitants, lui laissant la possibilité de s'y opposer pour un motif légitime.

## 7. Sort des données à la fin du contrat

`[À VALIDER PAR MATHÉO / UN AVOCAT]` — Position par défaut proposée : au terme du contrat, Fenn met à disposition de l'artisan un export de ses données dans un délai de 30 jours, puis procède à leur suppression définitive, sauf obligation légale de conservation plus longue.

## 8. Audit

L'artisan peut demander à Fenn les informations raisonnablement nécessaires pour démontrer le respect du présent accord. `[À COMPLÉTER : modalités précises d'audit si nécessaire]`.

## 9. Droit applicable

Le présent accord est soumis au droit français.
