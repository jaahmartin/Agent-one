import path from "path";
import express from "express";
import healthRouter from "./routes/health";
import voiceRouter from "./routes/voice";
import smsRouter from "./routes/sms";
import dashboardRouter from "./routes/dashboard";

export function createApp() {
  const app = express();

  // Nécessaire derrière le reverse proxy de Render : sans ça, req.protocol
  // vaut "http" et la vérification de signature Twilio (qui valide contre
  // l'URL https réelle) échoue systématiquement.
  app.set("trust proxy", true);

  // Twilio envoie ses webhooks en application/x-www-form-urlencoded, pas en JSON.
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  app.use("/dashboard-assets", express.static(path.join(__dirname, "public", "dashboard-assets")));
  app.use("/legal", express.static(path.join(__dirname, "public", "legal")));

  app.use("/health", healthRouter);
  app.use("/webhooks/voice", voiceRouter);
  app.use("/webhooks/sms", smsRouter);
  app.use("/dashboard", dashboardRouter);

  // Filet de sécurité final : n'importe quelle erreur non gérée plus haut
  // (ex: base de données injoignable) renvoie une réponse propre plutôt que
  // de faire planter le serveur ou de laisser la requête sans réponse.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Erreur non gérée :", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error" });
    }
  });

  return app;
}
