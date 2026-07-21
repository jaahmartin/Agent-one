import { z } from "zod";

/**
 * Seuls PORT/TWILIO sont obligatoires au démarrage — les autres services
 * (DB, Claude, Google Calendar) ne sont vérifiés qu'au moment où ils sont
 * réellement utilisés, pour permettre de tester le webhook voix/SMS avant
 * d'avoir créé tous les comptes externes (voir CONTEXTE_AGENT_ONE.md).
 */
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  TWILIO_ACCOUNT_SID: z.string().min(1, "TWILIO_ACCOUNT_SID manquant dans .env"),
  TWILIO_AUTH_TOKEN: z.string().min(1, "TWILIO_AUTH_TOKEN manquant dans .env"),
  DATABASE_URL: z.string().optional(),
  // Connexion restreinte (rôle Postgres sans BYPASSRLS) utilisée pour les
  // requêtes du dashboard, afin que les policies RLS par artisan
  // s'appliquent réellement (voir drizzle/0002_rls_policies.sql).
  DATABASE_URL_RUNTIME: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  // Clé JSON du compte de service Google, encodée en base64 (voir README.md).
  GOOGLE_SERVICE_ACCOUNT_KEY: z.string().optional(),
  PUBLIC_BASE_URL: z.string().optional(),
  // Espace admin Fenn (accès de Mathéo uniquement) : identifiants + secret
  // de signature des sessions. Voir src/services/adminAuth.ts.
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Configuration invalide (.env) :");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

/** À appeler au début de tout service qui a besoin d'une variable "optionnelle". */
export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(
      `Variable d'environnement "${key}" manquante. Ajoute-la dans .env avant d'utiliser cette fonctionnalité.`,
    );
  }
  return value as NonNullable<(typeof env)[K]>;
}
