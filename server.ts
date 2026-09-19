import app from "./src/app.ts";
import { env } from "./src/config/env.config.ts";
import { startSequenceWorker } from "./src/services/sequence-worker.service.ts";

const stopSequenceWorker = process.env.OUTREACH_SCHEDULER_ENABLED === "true" ? startSequenceWorker() : async () => {};

const server = app.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
});

const shutdown = (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  const workerStopped = stopSequenceWorker();
  server.close(async () => {
    await workerStopped;
    console.log("Server closed.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
