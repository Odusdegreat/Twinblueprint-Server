import { env } from "../config/env.config.ts";
import { emailService } from "./email.service.ts";
import { sequenceRpc } from "./sequence.service.ts";

export interface SequenceJob {
  id: string;
  sequence_id: string;
  lease_token: string;
  idempotency_key: string;
  first_attempt_at: string;
  payload: { from: string; to: string; subject: string; html: string };
}

// Dependencies are injected so crash recovery can be tested without sending email.
export const deliverSequenceJob = async (job: SequenceJob, dependencies = { send: emailService.sendEmail.bind(emailService), rpc: sequenceRpc }, timeoutMs = 30000) => {
  if (Date.now() - Date.parse(job.first_attempt_at) >= 23 * 3600000) {
    await dependencies.rpc("finish_outreach_email", { p_step_id: job.id, p_token: job.lease_token, p_error: "Safe idempotency window exhausted" });
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      dependencies.send({ ...job.payload, idempotencyKey: job.idempotency_key }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Email request timed out; lease retained for reconciliation")), timeoutMs); }),
    ]);
    // If this transaction fails, leave the lease intact. Recovery uses the same key and payload.
    await dependencies.rpc("finish_outreach_email", {
      p_step_id: job.id, p_token: job.lease_token,
      p_email_id: result.success && result.data?.id ? result.data.id : null,
      p_error: result.success && result.data?.id ? null : result.error ?? "Email provider returned no delivery ID",
    });
  } finally {
    clearTimeout(timer);
  }
};

export const startSequenceWorker = () => {
  let stopped = false;
  let running: Promise<void> | undefined;
  const tick = () => {
    if (stopped || running) return;
    running = (async () => {
      // No configuration means no claims or attempts are consumed.
      if (!env.RESEND_API_KEY) return;
      for (let index = 0; index < 20 && !stopped; index++) {
        const job = await sequenceRpc("claim_outreach_email", { p_from: env.FROM_EMAIL }) as SequenceJob | null;
        if (!job) break;
        await deliverSequenceJob(job);
      }
    })().catch(error => console.error("[SEQUENCES] Scheduler tick failed:", error instanceof Error ? error.message : "Unknown error"))
      .finally(() => { running = undefined; });
  };
  const timer = setInterval(tick, 15000);
  timer.unref();
  tick();
  return async () => { stopped = true; clearInterval(timer); await running; };
};
