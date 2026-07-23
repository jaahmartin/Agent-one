import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const leadStatusEnum = pgEnum("lead_status", [
  "nouveau",
  "en_qualification",
  "creneau_propose",
  "confirme",
  "relance_j3",
  "relance_j7",
  "relance_j14",
  "perdu",
  "termine",
]);

export const messageDirectionEnum = pgEnum("message_direction", ["in", "out"]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "proposed",
  "confirmed",
  "cancelled",
]);

// Distingue une confirmation obtenue par SMS (le client répond OUI) d'une
// confirmation manuelle par l'artisan depuis le bouton "Confirmé" du dashboard.
export const leadConfirmationSourceEnum = pgEnum("lead_confirmation_source", [
  "sms",
  "manuel",
]);

export const reminderTypeEnum = pgEnum("reminder_type", [
  "rappel_rdv",
  "silence_premier_message",
  "reflexion_j3",
]);

export const reminderStatusEnum = pgEnum("reminder_status", [
  "programmee",
  "envoyee",
  "annulee",
]);

export const artisans = pgTable("artisans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  // Métier de l'artisan (ex: "Plombier", "Électricien") — sert à terme au
  // vocabulaire/prestations spécifique injecté dans le moteur conversationnel.
  metier: text("metier"),
  // Numéro Twilio dédié que compose le client final. Nullable : un client
  // fraîchement créé depuis l'espace admin ("en attente") n'a pas encore de
  // numéro tant que Twilio n'est pas configuré pour lui.
  twilioNumber: text("twilio_number").unique(),
  // Vrai portable de l'artisan, appelé par le <Dial>. Nullable pour la même
  // raison que twilioNumber ci-dessus.
  forwardingNumber: text("forwarding_number"),
  // Adresse e-mail de l'agenda de l'artisan, partagé avec le compte de
  // service Google (voir README.md) — remplace l'ancienne approche OAuth.
  googleCalendarId: text("google_calendar_id"),
  // Jeton unique pour le lien privé du dashboard (pas de login en V1).
  dashboardToken: text("dashboard_token").notNull().unique(),
  isDemo: boolean("is_demo").notNull().default(false),
  // Utilisé pour la salutation du dashboard ("Bonjour <prénom>").
  contactFirstName: text("contact_first_name"),
  contactLastName: text("contact_last_name"),
  // Description libre de l'activité de l'entreprise (prestations, type de
  // clientèle habituelle...) — injectée dans les prompts d'extraction et de
  // génération de réponse (voir claudeClient.ts) pour qu'Agent One sache à
  // quel type de client il s'adresse et quelles questions poser, en plus du
  // simple libellé "metier" ci-dessus.
  activityDescription: text("activity_description"),
  notificationEmail: text("notification_email"),
  subscriptionStatus: text("subscription_status"),
  subscriptionRenewsOn: timestamp("subscription_renews_on"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  artisanId: uuid("artisan_id")
    .notNull()
    .references(() => artisans.id),
  clientPhone: text("client_phone").notNull(),
  status: leadStatusEnum("status").notNull().default("nouveau"),
  name: text("name"),
  problemType: text("problem_type"),
  address: text("address"),
  urgent: boolean("urgent"),
  // Renseigné quand status passe à "confirme" : par SMS (client) ou
  // manuellement (bouton "Confirmé" de l'onglet "À rappeler" du dashboard).
  confirmedBy: leadConfirmationSourceEnum("confirmed_by"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id),
  direction: messageDirectionEnum("direction").notNull(),
  body: text("body").notNull(),
  twilioSid: text("twilio_sid"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appointments = pgTable("appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id),
  calendarEventId: text("calendar_event_id"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: appointmentStatusEnum("status").notNull().default("proposed"),
  // Ancien mécanisme de relance (J+3/J+7/J+14), conservé mais plus utilisé
  // par les nouvelles relances (voir table `reminders`) — Twilio étant en
  // pause, ce moteur n'est pas reconstruit dans cette étape.
  lastReminderStage: text("last_reminder_stage"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Chiffre d'affaires déclaré par l'artisan pour un client apporté par Agent One.
export const revenues = pgTable("revenues", {
  id: uuid("id").defaultRandom().primaryKey(),
  artisanId: uuid("artisan_id")
    .notNull()
    .references(() => artisans.id),
  leadId: uuid("lead_id").references(() => leads.id),
  clientName: text("client_name").notNull(),
  jobType: text("job_type").notNull(),
  // Montant en centimes (entier) : garantit que la somme des lignes
  // correspond toujours exactement au total affiché, sans arrondi.
  amountCents: integer("amount_cents").notNull(),
  completedAt: timestamp("completed_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relances programmées/envoyées, affichées telles quelles dans l'onglet
// "Relances" du dashboard. Le moteur d'envoi réel (Twilio) n'est pas
// reconstruit dans cette étape — cette table sert de source de vérité pour
// l'affichage, alimentée pour l'instant par le seed de démonstration.
export const reminders = pgTable("reminders", {
  id: uuid("id").defaultRandom().primaryKey(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id),
  appointmentId: uuid("appointment_id").references(() => appointments.id),
  type: reminderTypeEnum("type").notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: reminderStatusEnum("status").notNull().default("programmee"),
  // Message exact prévu, précalculé, affiché tel quel dans "Relances".
  messageBody: text("message_body").notNull(),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Empêche d'envoyer deux fois le SMS de prise en charge pour le même appel
// (protection contre un retry réseau du webhook Twilio dial-status).
export const processedCalls = pgTable("processed_calls", {
  callSid: text("call_sid").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Notes et tâches internes de l'espace admin Fenn — jamais visibles par
// l'artisan lui-même (pas de policy RLS pour app_runtime : accès fermé par
// défaut, uniquement lisible via la connexion d'administration).
export const clientNotes = pgTable("client_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  artisanId: uuid("artisan_id")
    .notNull()
    .references(() => artisans.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const clientTasks = pgTable("client_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  artisanId: uuid("artisan_id")
    .notNull()
    .references(() => artisans.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Signalements du Labo Agent One : une réponse jugée mauvaise par Mathéo,
// avec jusqu'à 3 exemples de ce qu'il aurait fallu répondre à la place et
// le pourquoi du comment. Ces corrections sont réinjectées automatiquement
// dans le prompt de composeReply() (voir claudeClient.ts) pour toutes les
// conversations futures, tous artisans confondus — le "cerveau" d'Agent One
// est partagé (moteur générique, voir CONTEXTE_AGENT_ONE.md), artisanId
// n'est gardé ici que pour savoir où le problème a été repéré. Même logique
// RLS que les tables ci-dessus (aucune policy pour app_runtime : jamais
// visible depuis le dashboard artisan).
export const laboFeedback = pgTable("labo_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  artisanId: uuid("artisan_id")
    .notNull()
    .references(() => artisans.id, { onDelete: "cascade" }),
  conversationExcerpt: text("conversation_excerpt").notNull(),
  actualReply: text("actual_reply").notNull(),
  expectedReplies: jsonb("expected_replies").$type<string[]>().notNull(),
  reasoning: text("reasoning").notNull(),
  status: text("status").notNull().default("ouvert"),
  // Renseigné quand ce signalement a été digéré dans le "règlement" condensé
  // (voir agentRules ci-dessous) — évite de le retraiter à chaque
  // consolidation et distingue les corrections "toutes fraîches" pas encore
  // fondues dans les règles générales.
  consolidatedAt: timestamp("consolidated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// "Règlement" condensé d'Agent One : au lieu d'empiler indéfiniment les
// exemples bruts signalés (ce qui a déjà fait planter composeReply une fois
// le prompt trop chargé — voir claudeClient.ts), on les fait périodiquement
// fusionner par Claude en une liste courte de règles générales. Chaque ligne
// insérée ici est une version complète et à jour du règlement (pas un delta)
// — composeReply() utilise toujours la plus récente. Historique conservé
// pour pouvoir revenir en arrière si une consolidation part de travers.
export const agentRules = pgTable("agent_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Pendant de laboFeedback pour le "bon" côté : un message qu'Agent One a
// écrit et que Fenn valide comme parfait dans son contexte précis (client,
// sujet, avancée de la conversation). Contrairement à un signalement, il n'y
// a rien à corriger — juste un exemple à conserver/renforcer, digéré dans le
// même règlement condensé (voir ruleConsolidationService.ts) avec un cadrage
// positif ("continue à faire ça") plutôt que "évite ça".
export const agentPraise = pgTable("agent_praise", {
  id: uuid("id").defaultRandom().primaryKey(),
  artisanId: uuid("artisan_id")
    .notNull()
    .references(() => artisans.id, { onDelete: "cascade" }),
  conversationExcerpt: text("conversation_excerpt").notNull(),
  likedReply: text("liked_reply").notNull(),
  consolidatedAt: timestamp("consolidated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
