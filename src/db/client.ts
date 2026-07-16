import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { requireEnv } from "../config/env";
import * as schema from "./schema";

let _db: ReturnType<typeof buildDb> | null = null;

function buildDb(connectionString: string) {
  const client = postgres(connectionString, { max: 5 });
  return drizzle(client, { schema });
}

/**
 * Connexion paresseuse : la base n'est requise qu'à partir du moment où une
 * route a réellement besoin de lire/écrire un lead (voir env.ts).
 */
export function getDb() {
  if (!_db) {
    const connectionString = requireEnv("DATABASE_URL");
    _db = buildDb(connectionString);
  }
  return _db;
}
