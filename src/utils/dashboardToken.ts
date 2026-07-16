import { randomBytes } from "crypto";

/** Jeton d'accès imprévisible pour le lien privé du dashboard (pas de login en V1). */
export function generateDashboardToken(): string {
  return randomBytes(24).toString("hex");
}
