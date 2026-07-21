import { NextFunction, Request, Response, Router } from "express";
import { requireEnv } from "../config/env";
import { createSessionToken, verifyPassword, verifySessionToken } from "../services/adminAuth";
import { renderAdminShell, renderLoginPage } from "../services/adminPageService";
import {
  addClientNote,
  addClientTask,
  createPendingClient,
  deleteClient,
  getClientProfile,
  listClientsForLabo,
  toggleClientTask,
  updateClientProfile,
} from "../services/adminService";
import { findArtisanById } from "../db/repositories/artisansRepo";
import {
  INITIAL_CONVERSATION_STATE,
  simulateReply,
  type ConversationState,
} from "../services/leadService";

const router = Router();
const SESSION_COOKIE = "fenn_admin_session";

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

function parseCookies(header?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const maxAge = 30 * 24 * 60 * 60;
  const secure = req.secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}

function clearSessionCookie(req: Request, res: Response) {
  const secure = req.secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`);
}

function getSession(req: Request): { email: string } | null {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  return token ? verifySessionToken(token) : null;
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const session = getSession(req);
  if (!session) {
    if (req.path.startsWith("/api/")) {
      res.status(401).json({ error: "unauthorized" });
    } else {
      res.redirect("/admin/login");
    }
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

router.get("/login", (req, res) => {
  if (getSession(req)) {
    res.redirect("/admin");
    return;
  }
  res.type("text/html").send(renderLoginPage(false));
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    const adminEmail = requireEnv("ADMIN_EMAIL");
    const adminPasswordHash = requireEnv("ADMIN_PASSWORD_HASH");

    const emailMatches = typeof email === "string" && email.trim().toLowerCase() === adminEmail.toLowerCase();
    const passwordMatches = emailMatches && typeof password === "string" && (await verifyPassword(password, adminPasswordHash));

    if (!passwordMatches) {
      res.status(401).type("text/html").send(renderLoginPage(true));
      return;
    }

    const token = createSessionToken(adminEmail);
    setSessionCookie(req, res, token);
    res.redirect("/admin");
  }),
);

router.get("/logout", (req, res) => {
  clearSessionCookie(req, res);
  res.redirect("/admin/login");
});

// ---------------------------------------------------------------------------
// Application (protégée)
// ---------------------------------------------------------------------------

router.use(requireAdminAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const session = getSession(req)!;
    const html = await renderAdminShell(session.email);
    res.type("text/html").send(html);
  }),
);

router.get(
  "/api/clients/:id",
  asyncHandler(async (req, res) => {
    const profile = await getClientProfile(req.params.id);
    if (!profile) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(profile);
  }),
);

router.post(
  "/api/clients",
  asyncHandler(async (req, res) => {
    const { name, metier } = req.body ?? {};
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "missing_name" });
      return;
    }
    const artisan = await createPendingClient(name.trim(), typeof metier === "string" && metier.trim() ? metier.trim() : null);
    res.json({ id: artisan.id });
  }),
);

router.post(
  "/api/clients/:id",
  asyncHandler(async (req, res) => {
    const { name, metier, twilioNumber, forwardingNumber, subscriptionStatus } = req.body ?? {};
    const artisan = await updateClientProfile(req.params.id, {
      ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
      ...(metier !== undefined ? { metier } : {}),
      ...(twilioNumber !== undefined ? { twilioNumber } : {}),
      ...(forwardingNumber !== undefined ? { forwardingNumber } : {}),
      ...(typeof subscriptionStatus === "string" ? { subscriptionStatus } : {}),
    });
    if (!artisan) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  }),
);

router.post(
  "/api/clients/:id/delete",
  asyncHandler(async (req, res) => {
    await deleteClient(req.params.id);
    res.json({ ok: true });
  }),
);

router.post(
  "/api/clients/:id/notes",
  asyncHandler(async (req, res) => {
    const { body } = req.body ?? {};
    if (!body || typeof body !== "string") {
      res.status(400).json({ error: "missing_body" });
      return;
    }
    await addClientNote(req.params.id, body.trim());
    res.json({ ok: true });
  }),
);

router.post(
  "/api/clients/:id/tasks",
  asyncHandler(async (req, res) => {
    const { body } = req.body ?? {};
    if (!body || typeof body !== "string") {
      res.status(400).json({ error: "missing_body" });
      return;
    }
    await addClientTask(req.params.id, body.trim());
    res.json({ ok: true });
  }),
);

router.post(
  "/api/tasks/:taskId/toggle",
  asyncHandler(async (req, res) => {
    const { done } = req.body ?? {};
    await toggleClientTask(req.params.taskId, Boolean(done));
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Labo Agent One — simulation uniquement, jamais d'effet réel (voir
// src/services/leadService.ts, simulateReply()).
// ---------------------------------------------------------------------------

router.get(
  "/api/labo/clients",
  asyncHandler(async (_req, res) => {
    const clients = await listClientsForLabo();
    res.json(clients);
  }),
);

router.post(
  "/api/labo/simulate",
  asyncHandler(async (req, res) => {
    const { artisanId, state, history, message } = req.body ?? {};
    if (!artisanId || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const artisan = await findArtisanById(artisanId);
    if (!artisan) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const conversationState: ConversationState = state
      ? {
          ...state,
          proposedSlot: state.proposedSlot
            ? { start: new Date(state.proposedSlot.start), end: new Date(state.proposedSlot.end) }
            : null,
        }
      : INITIAL_CONVERSATION_STATE;

    const decision = await simulateReply(artisan, conversationState, typeof history === "string" ? history : "", message.trim());
    res.json(decision);
  }),
);

export default router;
