import "dotenv/config";
import { env } from "./config/env";
import { createApp } from "./app";
import { startReminderCron } from "./jobs/reminderCron";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Agent ONE écoute sur le port ${env.PORT}`);
  startReminderCron();
});
