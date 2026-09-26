import app from "./src/app.ts";
import { cookieConfig } from "./src/config/cookies.ts";
import { startSequenceWorker } from "./src/services/sequence-worker.service.ts";

const PORT = Number(process.env.PORT) || 5000;

// Fail loudly in logs: a deployed API that serves a Lax/insecure cookie drops the login
// session in the browser, which is hard to trace back to configuration.
if (process.env.RENDER === "true" && !(cookieConfig.secure && cookieConfig.sameSite === "none")) {
  console.warn(
    `[config] RENDER deployment with sameSite=${cookieConfig.sameSite} secure=${cookieConfig.secure}: ` +
    "cross-site cookie sessions will not persist. Set NODE_ENV=production, or both " +
    "AUTH_COOKIE_SAME_SITE=none and AUTH_COOKIE_SECURE=true.",
  );
}

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
