# Agent ONE — MVP

Agent IA de réception et qualification de leads pour artisans du bâtiment (Toulouse). Contexte complet : voir `CLAUDE.md` et `CONTEXTE_AGENT_ONE.md`.

## Statut

Tout le code du MVP est écrit et compile (`npm run build` passe sans erreur). Il reste à créer les comptes externes ci-dessous et à les brancher pour tester en conditions réelles.

## Comptes à créer, dans l'ordre

1. **Twilio** (console.twilio.com) — créer un compte, acheter un numéro français avec capacités Voix + SMS. Récupérer `Account SID` et `Auth Token` (page d'accueil de la console).
2. **Render** (render.com) — créer un compte pour héberger le serveur (nécessaire pour avoir une URL publique que Twilio peut appeler).
3. **Supabase** (supabase.com) — créer un projet, récupérer la chaîne de connexion Postgres (`Project Settings > Database > Connection string > URI`).
4. **Anthropic** (console.anthropic.com) — créer une clé API.
5. **Google Cloud Console** (console.cloud.google.com) — créer un projet, activer l'API "Google Calendar API", créer un **compte de service** (`APIs & Services > Identifiants > Créer des identifiants > Compte de service`) et télécharger sa clé JSON.

Une fois ces comptes créés, copie `.env.example` vers `.env` et remplis les valeurs.

```bash
cp .env.example .env
```

## Lancer en local

```bash
npm install        # déjà fait
npm run dev         # démarre le serveur en local sur le PORT défini dans .env
```

Pour que Twilio (un service externe) puisse appeler ton serveur qui tourne en local, il faut un tunnel public temporaire — l'outil standard est **ngrok** (ngrok.com, gratuit pour cet usage) :

```bash
ngrok http 3000
```

ngrok donne une URL du type `https://xxxx.ngrok-free.app` — c'est celle-ci qu'il faut renseigner :
- dans le `.env` (`PUBLIC_BASE_URL`)
- dans la console Twilio, sur la configuration du numéro (`Voice > A call comes in` → `https://xxxx.ngrok-free.app/webhooks/voice/incoming`, et `Messaging > A message comes in` → `https://xxxx.ngrok-free.app/webhooks/sms/incoming`)

⚠️ L'URL ngrok change à chaque redémarrage du tunnel (sauf compte payant) — il faut la remettre à jour dans Twilio à chaque fois pendant les tests locaux.

## Créer l'artisan pilote en base

Une fois `DATABASE_URL` renseigné dans `.env` :

```bash
npm run db:migrate   # crée les tables dans Supabase

ARTISAN_NAME="Jean Dupont Plomberie" \
ARTISAN_TWILIO_NUMBER="+33612345678" \
ARTISAN_FORWARDING_NUMBER="+33698765432" \
npm run seed:artisan
```

## Connecter l'agenda Google de l'artisan

Cette partie utilise un **compte de service** Google (pas de connexion/consentement de l'artisan à faire, juste un partage d'agenda) :

1. Dans Google Cloud Console, crée un compte de service et télécharge sa clé JSON (voir ci-dessus).
2. Encode le fichier en base64 et mets-le dans `.env` :
   ```bash
   base64 -i ~/Downloads/nom-du-fichier.json | pbcopy
   ```
   puis colle le résultat comme valeur de `GOOGLE_SERVICE_ACCOUNT_KEY` dans `.env`.
3. Sur calendar.google.com (connecté avec le compte Google de l'artisan) : Paramètres → l'agenda de l'artisan → "Partager avec des personnes" → ajouter l'adresse e-mail du compte de service (visible dans Google Cloud Console, ex. `agent-one-calendar@ton-projet.iam.gserviceaccount.com`) → permission "Apporter des modifications aux événements".
4. Renseigne `ARTISAN_GOOGLE_CALENDAR_ID` dans `.env` avec l'adresse e-mail de l'artisan (celle dont l'agenda a été partagé), puis relance :
   ```bash
   npm run seed:artisan
   ```
5. Vérifie que tout est bien connecté :
   ```bash
   ARTISAN_TWILIO_NUMBER="+33612345678" npm run calendar:check
   ```

## Déployer sur Render

1. Pousser ce dépôt sur GitHub.
2. Sur Render : "New +" → "Web Service" → connecter le dépôt → Render détecte `render.yaml` automatiquement.
3. Renseigner les variables d'environnement (celles marquées `sync: false` dans `render.yaml`) dans l'interface Render.
4. Une fois déployé, remplacer les URLs ngrok par l'URL Render définitive dans la configuration Twilio et dans `PUBLIC_BASE_URL`.

## Tester le parcours complet

Voir la section "Vérification" du plan (`/Users/matheomartin/.claude/plans/wobbly-discovering-abelson.md`) pour le détail étape par étape : appel manqué → SMS, qualification par SMS, proposition de créneau, confirmation, récap artisan, relance.

## Scripts disponibles

| Commande | Rôle |
|---|---|
| `npm run dev` | Lance le serveur en local avec rechargement automatique |
| `npm run build` | Compile le TypeScript |
| `npm start` | Lance le serveur compilé (utilisé par Render) |
| `npm run db:generate` | Génère une migration SQL à partir du schéma |
| `npm run db:migrate` | Applique les migrations sur la base Supabase |
| `npm run db:studio` | Ouvre une interface web pour consulter la base |
| `npm run seed:artisan` | Crée/met à jour l'artisan pilote en base |
| `npm run calendar:check` | Vérifie que le compte de service a accès à l'agenda d'un artisan |
