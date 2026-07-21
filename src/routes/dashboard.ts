import { NextFunction, Request, Response, Router } from "express";
import { withArtisanScope } from "../db/client";
import { findArtisanByDashboardToken } from "../db/repositories/artisansRepo";
import { findLeadById } from "../db/repositories/leadsRepo";
import {
  addRevenueAction,
  confirmCallbackAction,
  deleteCallbackAction,
  renderDashboard,
} from "../services/dashboardService";

const router = Router();

// Express 4 ne rattrape pas automatiquement les erreurs d'un handler async —
// sans ce filet, une exception (ex: base de données injoignable) ferait
// planter ou rester bloquée la requête au lieu de renvoyer une erreur propre.
function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

/** Charge l'artisan à partir du jeton, 404 générique si absent (pas d'indice sur la validité du jeton). */
async function requireArtisan(token: string) {
  return findArtisanByDashboardToken(token);
}

router.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const artisan = await requireArtisan(req.params.token);
    if (!artisan) {
      res.status(404).send("Page introuvable.");
      return;
    }
    const html = await withArtisanScope(artisan.id, () => renderDashboard(artisan));
    res.type("text/html").send(html);
  }),
);

/**
 * Vérifie que le lead visé appartient bien à l'artisan du jeton — jamais
 * seulement l'id passé en paramètre. Le lookup se fait déjà à l'intérieur
 * du scope RLS de l'artisan : si le lead appartient à quelqu'un d'autre,
 * la base elle-même ne renvoie aucune ligne (pas seulement ce check).
 */
async function requireOwnedLead(artisanId: string, leadId: string) {
  const lead = await findLeadById(leadId);
  if (!lead || lead.artisanId !== artisanId) return null;
  return lead;
}

router.post(
  "/:token/callbacks/:leadId/confirm",
  asyncHandler(async (req, res) => {
    const artisan = await requireArtisan(req.params.token);
    if (!artisan) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const ok = await withArtisanScope(artisan.id, async () => {
      const lead = await requireOwnedLead(artisan.id, req.params.leadId);
      if (!lead) return false;
      await confirmCallbackAction(lead.id);
      return true;
    });
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  }),
);

router.post(
  "/:token/callbacks/:leadId/delete",
  asyncHandler(async (req, res) => {
    const artisan = await requireArtisan(req.params.token);
    if (!artisan) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const ok = await withArtisanScope(artisan.id, async () => {
      const lead = await requireOwnedLead(artisan.id, req.params.leadId);
      if (!lead) return false;
      await deleteCallbackAction(lead.id);
      return true;
    });
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  }),
);

router.post(
  "/:token/revenue",
  asyncHandler(async (req, res) => {
    const artisan = await requireArtisan(req.params.token);
    if (!artisan) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const { clientName, jobType, amount, completedAt } = req.body ?? {};
    if (!clientName || !jobType || !amount || !completedAt) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const amountEuros = Number(amount);
    const completedAtDate = new Date(completedAt);
    if (!Number.isFinite(amountEuros) || Number.isNaN(completedAtDate.getTime())) {
      res.status(400).json({ error: "invalid_fields" });
      return;
    }
    await withArtisanScope(artisan.id, () =>
      addRevenueAction({
        artisanId: artisan.id,
        clientName: String(clientName),
        jobType: String(jobType),
        amountEuros,
        completedAt: completedAtDate,
      }),
    );
    res.json({ ok: true });
  }),
);

export default router;
