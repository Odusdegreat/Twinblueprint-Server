import app from "./src/app.ts";
import { startSequenceWorker } from "./src/services/sequence-worker.service.ts";

const PORT = Number(process.env.PORT) || 5000;

const stopSequenceWorker = process.env.OUTREACH_SCHEDULER_ENABLED === "true" ? startSequenceWorker() : async () => {};

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
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
