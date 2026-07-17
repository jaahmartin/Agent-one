import { readFileSync } from "fs";
import path from "path";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { leads, messages, type artisans } from "../db/schema";
import {
  confirmLeadManually,
  listCallbackLeads,
  listManuallyConfirmedLeads,
  markLeadLost,
} from "../db/repositories/leadsRepo";
import { listConfirmedAppointmentsByArtisan } from "../db/repositories/appointmentsRepo";
import { createRevenue, listRevenuesByArtisan, sumRevenueByArtisan } from "../db/repositories/revenuesRepo";
import {
  cancelPendingRemindersForLead,
  listTodayReminders,
  listUpcomingReminders,
} from "../db/repositories/remindersRepo";
import { listMessagesByLead } from "../db/repositories/messagesRepo";

type Artisan = typeof artisans.$inferSelect;

const TEMPLATE_PATH = path.join(__dirname, "..", "public", "dashboard", "index.html");

const REMINDER_TYPE_LABELS: Record<string, string> = {
  rappel_rdv: "Rappel avant RDV",
  silence_premier_message: "Silence sur 1er message",
  reflexion_j3: 'Relance "je réfléchis"',
};

// ---------- Utilitaires de formatage ----------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEuros(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`;
}

function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(date);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(date);
}

function formatDelay(ms: number): string {
  if (ms < 1000) return "< 1 seconde";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} secondes`;
  return `${Math.round(seconds / 60)} min`;
}

// ---------- Bornes de dates ----------

function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function startOfMonth(date = new Date()): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------- Requêtes d'agrégation (comptages réels) ----------

async function countMessages(artisanId: string, direction: "in" | "out", from: Date, to: Date): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(messages)
    .innerJoin(leads, eq(messages.leadId, leads.id))
    .where(
      and(
        eq(leads.artisanId, artisanId),
        eq(messages.direction, direction),
        gte(messages.createdAt, from),
        lt(messages.createdAt, to),
      ),
    );
  return Number(row?.count ?? 0);
}

async function countLeadsCreated(artisanId: string, from: Date, to: Date): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(leads)
    .where(and(eq(leads.artisanId, artisanId), gte(leads.createdAt, from), lt(leads.createdAt, to)));
  return Number(row?.count ?? 0);
}

async function countConfirmedLeads(artisanId: string, from: Date, to: Date): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(leads)
    .where(
      and(
        eq(leads.artisanId, artisanId),
        eq(leads.status, "confirme"),
        gte(leads.confirmedAt, from),
        lt(leads.confirmedAt, to),
      ),
    );
  return Number(row?.count ?? 0);
}

async function countDistinctLeadsWithInboundMessage(artisanId: string, from: Date, to: Date): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<string>`count(distinct ${messages.leadId})` })
    .from(messages)
    .innerJoin(leads, eq(messages.leadId, leads.id))
    .where(
      and(
        eq(leads.artisanId, artisanId),
        eq(messages.direction, "in"),
        gte(messages.createdAt, from),
        lt(messages.createdAt, to),
      ),
    );
  return Number(row?.count ?? 0);
}

async function dailyOutboundCounts(artisanId: string, days: number): Promise<number[]> {
  const counts: number[] = [];
  const today = startOfDay();
  for (let i = days - 1; i >= 0; i--) {
    const from = addDays(today, -i);
    const to = addDays(from, 1);
    counts.push(await countMessages(artisanId, "out", from, to));
  }
  return counts;
}

// ---------- Courbes lissées (Catmull-Rom -> Bézier, épaisseur de trait constante) ----------

function trendCoords(counts: number[], width: number, height: number): Array<[number, number]> {
  const max = Math.max(1, ...counts);
  const step = counts.length > 1 ? width / (counts.length - 1) : width;
  // Marge interne (haut/bas) : le lissage Catmull-Rom peut légèrement dépasser
  // les points d'origine (overshoot). Sans cette marge, un pic ou un creux
  // marqué se retrouve rogné par les bords de la zone d'affichage du SVG.
  const pad = height * 0.16;
  const usable = height - pad * 2;
  return counts.map((c, i) => [i * step, pad + (1 - c / max) * usable] as [number, number]);
}

function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function smoothTrend(counts: number[], width: number, height: number): string {
  return smoothPath(trendCoords(counts, width, height));
}

// ---------- Rendu des lignes HTML (réutilise la structure .person-row de la maquette) ----------

async function conversationHtml(leadId: string): Promise<string> {
  const history = await listMessagesByLead(leadId);
  if (history.length === 0) return "<div><i>Aucun échange pour l'instant.</i></div>";
  return history
    .map((m) => {
      const who = m.direction === "in" ? "Client" : "Agent One";
      return `<div><b>${who} (${formatTime(m.createdAt)}) :</b> ${escapeHtml(m.body)}</div>`;
    })
    .join("");
}

async function renderCallbackRow(lead: typeof leads.$inferSelect, forOverview: boolean): Promise<string> {
  const detail = `${lead.clientPhone}${lead.problemType ? " · " + escapeHtml(lead.problemType) : ""}`;
  if (forOverview) {
    return `
      <div class="person-row" id="ov-cbrow-${lead.id}"><div class="person-summary" onclick="showView('callbacks'); openSpecificRecap('${lead.id}');">
        <div><div class="callback-name-row"><span class="dot-alert"></span><span class="callback-name">${escapeHtml(lead.name ?? "Contact")}</span></div><div class="callback-detail">${detail}</div></div>
      </div></div>`;
  }
  const recap = await conversationHtml(lead.id);
  return `
    <div class="person-row" id="cbrow-${lead.id}">
      <div class="person-summary" onclick="toggleRecap('${lead.id}')"><div class="callback-name-row"><span class="dot-alert"></span><span class="callback-name">${escapeHtml(lead.name ?? "Contact")}</span></div><span class="chevron" id="chev-${lead.id}">▾</span></div>
      <div class="recap" id="recap-${lead.id}">
        ${recap}
        <div class="action-row">
          <button class="btn-call">Rappeler ${lead.clientPhone}</button>
          <button class="btn-confirm" onclick="confirmCallback('${lead.id}')">Confirmé</button>
          <button class="btn-trash" onclick="deleteCallback('${lead.id}')" title="Supprimer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg></button>
        </div>
      </div>
    </div>`;
}

async function renderAppointmentRow(params: {
  leadId: string;
  name: string;
  problemType: string | null;
  confirmedLabel: string;
  timeLabel: string;
  revenueCents: number | null;
}): Promise<string> {
  const recap = await conversationHtml(params.leadId);
  const caRow = params.revenueCents
    ? `<span><b>CA généré :</b> ${formatEuros(params.revenueCents)}</span>`
    : `<span><b>CA généré :</b> —</span><button class="btn-add-ca" onclick="showView('revenue'); openAddCaForm();">Ajouter chiffre d'affaire</button>`;
  return `
    <div class="person-row">
      <div class="person-summary" onclick="toggleRecap('${params.leadId}')">
        <div class="callback-name-row"><span class="callback-name">${escapeHtml(params.name)}</span></div>
        <span class="chevron" id="chev-${params.leadId}">▾</span>
      </div>
      <div class="recap" id="recap-${params.leadId}">
        <div><b>Chantier :</b> ${escapeHtml(params.problemType ?? "—")}</div>
        <div><b>Heure :</b> ${params.timeLabel}</div>
        <div><b>Confirmé par :</b> ${params.confirmedLabel}</div>
        ${recap}
        <div class="recap-row">${caRow}</div>
      </div>
    </div>`;
}

function renderRevenueRow(rev: typeof import("../db/schema").revenues.$inferSelect): string {
  return `
    <div class="person-row">
      <div class="person-summary" onclick="toggleRecap('rev-${rev.id}')"><div class="callback-name-row"><span class="callback-name">${escapeHtml(rev.clientName)}</span></div><div style="display:flex;align-items:center;gap:8px;"><span class="settings-value">${formatEuros(rev.amountCents)}</span><span class="chevron" id="chev-rev-${rev.id}">▾</span></div></div>
      <div class="recap" id="recap-rev-${rev.id}">
        <div><b>Date de réalisation :</b> ${formatDateShort(rev.completedAt)}</div>
        <div><b>Type de chantier :</b> ${escapeHtml(rev.jobType)}</div>
      </div>
    </div>`;
}

function renderReminderRow(reminder: typeof import("../db/schema").reminders.$inferSelect, leadName: string): string {
  const label = REMINDER_TYPE_LABELS[reminder.type] ?? reminder.type;
  return `
    <div class="person-row">
      <div class="person-summary" onclick="toggleRecap('rem-${reminder.id}')">
        <div><span class="settings-value" style="margin-right:10px;">${formatTime(reminder.scheduledFor)}</span><span class="callback-name">${escapeHtml(leadName)}</span> <span class="panel-tag" style="margin-left:6px;">${label}</span></div>
        <span class="chevron" id="chev-rem-${reminder.id}">▾</span>
      </div>
      <div class="recap" id="recap-rem-${reminder.id}">
        <div><b>Message prévu :</b> ${escapeHtml(reminder.messageBody)}</div>
      </div>
    </div>`;
}

function statBlock(label: string, value: number | string, sub: string): string {
  return `<div class="conv-stat"><div class="conv-stat-value">${value}</div><div class="conv-stat-label">${sub}</div></div>`;
}

// ---------- Assemblage complet ----------

export async function renderDashboard(artisan: Artisan): Promise<string> {
  const template = readFileSync(TEMPLATE_PATH, "utf-8");

  const today = startOfDay();
  const tomorrow = addDays(today, 1);
  const weekStart = addDays(today, -6);
  const monthStart = startOfMonth();
  const lastMonthStart = startOfMonth(addDays(monthStart, -1));

  // --- À rappeler ---
  const callbackLeads = await listCallbackLeads(artisan.id);
  const callbackRowsHtml = (await Promise.all(callbackLeads.map((l) => renderCallbackRow(l, false)))).join("");
  const overviewCallbackAll = await Promise.all(callbackLeads.slice(0, 3).map((l) => renderCallbackRow(l, true)));
  const overviewCallbackExtra = await Promise.all(callbackLeads.slice(3).map((l) => renderCallbackRow(l, true)));
  const overviewCallbackHtml =
    overviewCallbackAll.join("") +
    (overviewCallbackExtra.length > 0
      ? `<div class="sublist" id="more-callbacks">${overviewCallbackExtra.join("")}</div>
         <div class="toggle-link" onclick="toggleSublist('more-callbacks', this)">+ ${overviewCallbackExtra.length} autres ▾</div>`
      : "");

  // --- Rendez-vous confirmés (appointments réels + confirmations manuelles) ---
  const confirmedAppointments = await listConfirmedAppointmentsByArtisan(artisan.id);
  const manuallyConfirmed = await listManuallyConfirmedLeads(artisan.id);
  const revenueByLead = new Map<string, number>();
  const allRevenues = await listRevenuesByArtisan(artisan.id);
  for (const r of allRevenues) {
    if (r.leadId) revenueByLead.set(r.leadId, (revenueByLead.get(r.leadId) ?? 0) + r.amountCents);
  }

  const todayRows: string[] = [];
  const weekRows: string[] = [];
  const monthRows: string[] = [];

  for (const { appointment, lead } of confirmedAppointments) {
    const html = await renderAppointmentRow({
      leadId: lead.id,
      name: lead.name ?? "Contact",
      problemType: lead.problemType,
      confirmedLabel: "Agent One",
      timeLabel: formatDateTime(appointment.startTime),
      revenueCents: revenueByLead.get(lead.id) ?? null,
    });
    if (appointment.startTime >= today && appointment.startTime < tomorrow) todayRows.push(html);
    else if (appointment.startTime >= today && appointment.startTime < addDays(today, 7)) weekRows.push(html);
    else if (appointment.startTime >= monthStart && appointment.startTime < addDays(monthStart, 31)) monthRows.push(html);
  }
  for (const lead of manuallyConfirmed) {
    const html = await renderAppointmentRow({
      leadId: lead.id,
      name: lead.name ?? "Contact",
      problemType: lead.problemType,
      confirmedLabel: "l'entreprise",
      timeLabel: lead.confirmedAt ? formatDateTime(lead.confirmedAt) : "—",
      revenueCents: revenueByLead.get(lead.id) ?? null,
    });
    todayRows.push(html);
  }

  const rdvMonthCount = todayRows.length + weekRows.length + monthRows.length;

  // --- Chiffre d'affaires ---
  const revenueTotalCents = await sumRevenueByArtisan(artisan.id);
  const revenueRowsHtml = allRevenues.map(renderRevenueRow).join("") || "<div><i>Aucun chiffre d'affaires enregistré pour l'instant.</i></div>";

  // --- Relances ---
  const todayReminders = await listTodayReminders(artisan.id);
  const upcomingReminders = await listUpcomingReminders(artisan.id);
  const remindersTodayHtml =
    todayReminders.map(({ reminder, lead }) => renderReminderRow(reminder, lead.name ?? "Contact")).join("") ||
    `<div class="settings-row" style="border:none;"><span class="settings-label">Aucune relance aujourd'hui.</span></div>`;
  const remindersUpcomingHtml =
    upcomingReminders.map(({ reminder, lead }) => renderReminderRow(reminder, lead.name ?? "Contact")).join("") ||
    `<div class="settings-row" style="border:none;"><span class="settings-label">Aucune relance programmée au-delà d'aujourd'hui pour l'instant.</span></div>`;

  // --- SMS / statistiques ---
  const smsToday = await countMessages(artisan.id, "out", today, tomorrow);
  const smsWeek = await countMessages(artisan.id, "out", weekStart, tomorrow);
  const smsMonth = await countMessages(artisan.id, "out", monthStart, tomorrow);
  const dailyCounts7 = await dailyOutboundCounts(artisan.id, 7);
  const smsSparklinePath = smoothTrend(dailyCounts7, 200, 60);
  const smsDetailCurvePath = smoothTrend(dailyCounts7, 300, 60);
  const sms7DayTotal = dailyCounts7.reduce((a, b) => a + b, 0);
  const sms7DayAvg = Math.round((sms7DayTotal / dailyCounts7.length) * 10) / 10;
  const sms7DayBest = Math.max(0, ...dailyCounts7);
  const smsDetailStatsHtml = `<div class="conv-stat-row">
    ${statBlock("", sms7DayTotal, "SMS envoyés sur 7 jours")}
    ${statBlock("", sms7DayAvg, "Moyenne quotidienne")}
    ${statBlock("", sms7DayBest, "Meilleur jour")}
  </div>`;

  const missedCallsToday = await countLeadsCreated(artisan.id, today, tomorrow);

  const confirmedThisMonth = await countConfirmedLeads(artisan.id, monthStart, tomorrow);
  const totalLeadsThisMonth = await countLeadsCreated(artisan.id, monthStart, tomorrow);
  const confirmedLastMonth = await countConfirmedLeads(artisan.id, lastMonthStart, monthStart);
  const totalLeadsLastMonth = await countLeadsCreated(artisan.id, lastMonthStart, monthStart);
  const conversionRate = totalLeadsThisMonth > 0 ? Math.round((confirmedThisMonth / totalLeadsThisMonth) * 100) : 0;
  const conversionRateLastMonth =
    totalLeadsLastMonth > 0 ? Math.round((confirmedLastMonth / totalLeadsLastMonth) * 100) : 0;
  const conversionDeltaValue = conversionRate - conversionRateLastMonth;
  const conversionDelta = `${conversionDeltaValue >= 0 ? "+" : ""}${conversionDeltaValue}%`;

  // Délai moyen d'envoi (raccroché -> SMS) : première réponse "out" après création du lead.
  const recentLeadsWithMessage = callbackLeads.concat(manuallyConfirmed).slice(0, 3);
  let avgDelayLabel = "Aucune donnée pour l'instant";
  const examples: string[] = [];
  const delaysMs: number[] = [];
  for (const lead of recentLeadsWithMessage) {
    const history = await listMessagesByLead(lead.id);
    const firstOut = history.find((m) => m.direction === "out");
    if (firstOut) {
      const delayMs = firstOut.createdAt.getTime() - lead.createdAt.getTime();
      delaysMs.push(Math.max(0, delayMs));
      examples.push(
        `<div class="settings-row"><span class="settings-label">${escapeHtml(lead.name ?? "Contact")}</span><span class="settings-value">Appel manqué ${formatTime(lead.createdAt)} → SMS envoyé ${formatTime(firstOut.createdAt)}</span></div>`,
      );
    }
  }
  if (delaysMs.length > 0) {
    const avgMs = delaysMs.reduce((a, b) => a + b, 0) / delaysMs.length;
    avgDelayLabel = formatDelay(avgMs);
  }
  const smsExamplesHtml = examples.join("") || `<div class="settings-row"><span class="settings-label">Aucun exemple pour l'instant.</span></div>`;

  // --- Entonnoir de conversion (mêmes comptages réels réutilisés pour les 3 onglets) ---
  function funnelBlock(id: string, sent: number, replied: number, confirmed: number, display: string): string {
    const repliedPct = sent > 0 ? Math.round((replied / sent) * 100) : 0;
    const confirmedPct = sent > 0 ? Math.round((confirmed / sent) * 100) : 0;
    return `<div class="funnel-content" id="funnel-${id}" style="display:${display};">
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:var(--sp-3);">
        <div><div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;"><span>SMS envoyés</span><span style="font-weight:600;">${sent} · 100%</span></div><div style="background:var(--bg); border-radius:100px; height:10px;"><div style="width:100%; background:var(--accent); height:10px; border-radius:100px;"></div></div></div>
        <div><div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;"><span>Réponses obtenues</span><span style="font-weight:600;">${replied} · ${repliedPct}%</span></div><div style="background:var(--bg); border-radius:100px; height:10px;"><div style="width:${repliedPct}%; background:var(--accent); height:10px; border-radius:100px;"></div></div></div>
        <div><div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;"><span>Rendez-vous confirmés</span><span style="font-weight:600;">${confirmed} · ${confirmedPct}%</span></div><div style="background:var(--bg); border-radius:100px; height:10px;"><div style="width:${confirmedPct}%; background:var(--positive); height:10px; border-radius:100px;"></div></div></div>
      </div>
    </div>`;
  }
  const repliedToday = await countDistinctLeadsWithInboundMessage(artisan.id, today, tomorrow);
  const repliedWeek = await countDistinctLeadsWithInboundMessage(artisan.id, weekStart, tomorrow);
  const repliedMonth = await countDistinctLeadsWithInboundMessage(artisan.id, monthStart, tomorrow);
  const confirmedToday = await countConfirmedLeads(artisan.id, today, tomorrow);
  const confirmedWeek = await countConfirmedLeads(artisan.id, weekStart, tomorrow);

  const funnelHtml =
    funnelBlock("today", smsToday, repliedToday, confirmedToday, "block") +
    funnelBlock("week", smsWeek, repliedWeek, confirmedWeek, "none") +
    funnelBlock("month", smsMonth, repliedMonth, confirmedThisMonth, "none");

  function evolutionBlock(id: string, sent: number, replied: number, confirmed: number, curvePath: string, display: string): string {
    return `<div class="conv-tab-content" id="conv-${id}" style="display:${display};">
      <svg width="100%" height="60" viewBox="0 0 300 60" preserveAspectRatio="none"><path d="${curvePath}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/></svg>
      <div class="conv-stat-row">
        ${statBlock("", sent, "SMS envoyés")}
        ${statBlock("", replied, "SMS ayant obtenu une réponse")}
        ${statBlock("", confirmed, "Discussions ayant conclu à un rendez-vous")}
        ${statBlock("", conversionDelta, "vs période précédente")}
      </div>
    </div>`;
  }
  // Même tendance sur 7 jours réutilisée pour les 3 onglets (approximation
  // simple — pas d'historique horaire/hebdomadaire dédié pour l'instant).
  // Cette même tendance alimente aussi la mini-courbe de la carte "Taux de
  // conversion" en vue d'ensemble, pour que la courbe résumée et la courbe
  // détaillée racontent toujours la même histoire.
  const evolutionTrend = smoothTrend(dailyCounts7, 300, 60);
  const conversionSparklinePath = smoothTrend(dailyCounts7, 200, 60);
  const evolutionHtml =
    evolutionBlock("today", smsToday, repliedToday, confirmedToday, evolutionTrend, "block") +
    evolutionBlock("week", smsWeek, repliedWeek, confirmedWeek, evolutionTrend, "none") +
    evolutionBlock("month", smsMonth, repliedMonth, confirmedThisMonth, evolutionTrend, "none");

  // --- Assemblage final : remplacement des marqueurs ---
  const replacements: Record<string, string> = {
    DASHBOARD_TOKEN: artisan.dashboardToken,
    CALLBACK_COUNT: String(callbackLeads.length),
    CONTACT_FIRST_NAME: escapeHtml(artisan.contactFirstName ?? artisan.name),
    MISSED_CALLS_TODAY: String(missedCallsToday),
    SMS_TODAY: String(smsToday),
    SMS_WEEK: String(smsWeek),
    SMS_MONTH: String(smsMonth),
    SMS_SPARKLINE_PATH: smsSparklinePath,
    SMS_DETAIL_CURVE_PATH: smsDetailCurvePath,
    SMS_DETAIL_STATS: smsDetailStatsHtml,
    CONVERSION_SPARKLINE_PATH: conversionSparklinePath,
    RDV_MONTH_COUNT: String(rdvMonthCount),
    CONVERSION_RATE: String(conversionRate),
    CONVERSION_DELTA: conversionDelta,
    REMINDERS_TODAY_COUNT: String(todayReminders.length),
    OVERVIEW_CALLBACK_ROWS: overviewCallbackHtml || "<div><i>Aucun contact à rappeler.</i></div>",
    REVENUE_TOTAL: formatEuros(revenueTotalCents),
    AVG_DELAY_LABEL: avgDelayLabel,
    SMS_EXAMPLES_ROWS: smsExamplesHtml,
    FUNNEL_CONTENT: funnelHtml,
    EVOLUTION_CONTENT: evolutionHtml,
    RDV_TODAY_TAG_COUNT: String(todayRows.length),
    RDV_TODAY_ROWS: todayRows.join("") || "<div><i>Aucun rendez-vous aujourd'hui.</i></div>",
    RDV_WEEK_TAG_COUNT: String(weekRows.length),
    RDV_WEEK_ROWS: weekRows.join("") || "<div><i>Aucun rendez-vous cette semaine.</i></div>",
    RDV_MONTH_TAG_COUNT: String(monthRows.length),
    RDV_MONTH_ROWS: monthRows.join("") || "<div><i>Aucun rendez-vous ce mois-ci (au-delà de cette semaine).</i></div>",
    CALLBACK_ROWS: callbackRowsHtml || "<div><i>Aucun contact à rappeler.</i></div>",
    REVENUE_ROWS: revenueRowsHtml,
    REMINDERS_TODAY_ROWS: remindersTodayHtml,
    REMINDERS_UPCOMING_ROWS: remindersUpcomingHtml,
    ARTISAN_TWILIO_NUMBER: artisan.twilioNumber,
    NOTIFICATION_EMAIL: escapeHtml(artisan.notificationEmail ?? "—"),
    SUBSCRIPTION_LABEL: escapeHtml(
      artisan.subscriptionStatus
        ? `${artisan.subscriptionStatus}${artisan.subscriptionRenewsOn ? " — renouvellement le " + formatDateShort(artisan.subscriptionRenewsOn) : ""}`
        : "—",
    ),
  };

  let html = template;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  return html;
}

// ---------- Actions d'écriture ----------

export async function confirmCallbackAction(leadId: string) {
  await confirmLeadManually(leadId);
  await cancelPendingRemindersForLead(leadId);
}

export async function deleteCallbackAction(leadId: string) {
  await markLeadLost(leadId);
  await cancelPendingRemindersForLead(leadId);
}

export async function addRevenueAction(params: {
  artisanId: string;
  clientName: string;
  jobType: string;
  amountEuros: number;
  completedAt: Date;
}) {
  return createRevenue({
    artisanId: params.artisanId,
    clientName: params.clientName,
    jobType: params.jobType,
    amountCents: Math.round(params.amountEuros * 100),
    completedAt: params.completedAt,
  });
}
