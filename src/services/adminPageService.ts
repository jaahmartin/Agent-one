import { readFileSync } from "fs";
import path from "path";
import { getGlobalOverview, listClients, normalizeSubscriptionStatus } from "./adminService";

const SHELL_PATH = path.join(__dirname, "..", "public", "admin", "index.html");
const LOGIN_PATH = path.join(__dirname, "..", "public", "admin", "login.html");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEuros(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
}

function statusLabel(status: "actif" | "en_pause" | "en_attente"): string {
  return status === "actif" ? "Actif" : status === "en_pause" ? "En pause" : "En attente";
}

export function renderLoginPage(hasError: boolean): string {
  const template = readFileSync(LOGIN_PATH, "utf-8");
  return template.split("{{ERROR_DISPLAY}}").join(hasError ? "block" : "none");
}

export async function renderAdminShell(adminEmail: string): Promise<string> {
  const template = readFileSync(SHELL_PATH, "utf-8");
  const overview = await getGlobalOverview();
  const clients = await listClients();

  const clientsListHtml =
    clients
      .map(({ artisan, revenueThisMonthCents }) => {
        const status = normalizeSubscriptionStatus(artisan.subscriptionStatus);
        return `<div class="client-card" onclick="openProfile('${artisan.id}')">
          <div><div class="client-name">${escapeHtml(artisan.name)}</div><div class="client-meta">${escapeHtml(artisan.metier ?? "Métier non renseigné")}</div></div>
          <div class="client-right"><span class="status-pill ${status}">${statusLabel(status)}</span><div class="client-amount">${formatEuros(revenueThisMonthCents)}</div></div>
        </div>`;
      })
      .join("") || `<div class="empty-state">Aucun client pour l'instant — utilise le bouton "+" pour en ajouter un.</div>`;

  const replacements: Record<string, string> = {
    OVERVIEW_CLIENT_COUNT: String(overview.clientCount),
    OVERVIEW_REVENUE_MONTH: formatEuros(overview.revenueThisMonthCents),
    OVERVIEW_APPOINTMENTS: String(overview.confirmedAppointments),
    OVERVIEW_CONVERSION: String(overview.conversionRate),
    CLIENTS_LIST_HTML: clientsListHtml,
    ADMIN_EMAIL: escapeHtml(adminEmail),
  };

  let html = template;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  return html;
}
