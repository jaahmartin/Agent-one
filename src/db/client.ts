import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { requireEnv } from "../config/env";
import * as schema from "./schema";

type Db = ReturnType<typeof buildDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let _db: Db | null = null;
let _runtimeDb: Db | null = null;

// Porte la transaction "scopée à un artisan" (ouverte par withArtisanScope)
// à travers tous les appels asynchrones du traitement de la requête en
// cours, sans avoir à faire passer un paramètre `tx` dans chaque fonction
// de src/db/repositories/*.ts et src/services/dashboardService.ts — elles
// appellent toutes getDb() elles-mêmes.
const artisanScope = new AsyncLocalStorage<Tx>();

function buildDb(connectionString: string) {
  const client = postgres(connectionString, { max: 5 });
  return drizzle(client, { schema });
}

/**
 * Connexion paresseuse : la base n'est requise qu'à partir du moment où une
 * route a réellement besoin de lire/écrire un lead (voir env.ts).
 *
 * À l'intérieur d'un withArtisanScope(...), renvoie la transaction scopée à
 * cet artisan (soumise aux policies RLS du rôle app_runtime) plutôt que la
 * connexion d'administration par défaut.
 */
export function getDb(): Db | Tx {
  const scoped = artisanScope.getStore();
  if (scoped) return scoped;
  if (!_db) {
    const connectionString = requireEnv("DATABASE_URL");
    _db = buildDb(connectionString);
  }
  return _db;
}

function getRuntimeDb(): Db {
  if (!_runtimeDb) {
    const connectionString = requireEnv("DATABASE_URL_RUNTIME");
    _runtimeDb = buildDb(connectionString);
  }
  return _runtimeDb;
}

/**
 * Fait tourner `fn` avec toutes les requêtes DB (via getDb(), donc dans
 * tous les repositories) scopées à un artisan précis : ouvre une
 * transaction sur la connexion restreinte (rôle app_runtime, sans
 * BYPASSRLS) et fixe app.artisan_id pour cette transaction avant d'exécuter
 * `fn`. Les policies RLS de drizzle/0002_rls_policies.sql filtrent alors
 * réellement chaque ligne lue/écrite par artisan_id — pas seulement le
 * filtre déjà présent côté code.
 */
export async function withArtisanScope<T>(artisanId: string, fn: () => Promise<T>): Promise<T> {
  const runtimeDb = getRuntimeDb();
  return runtimeDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.artisan_id', ${artisanId}, true)`);
    return artisanScope.run(tx as Tx, fn);
  });
}
