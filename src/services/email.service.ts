import { Resend } from "resend";
import { env } from "../config/env.config.ts";

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  idempotencyKey?: string;
}

interface EmailResponse {
  success: boolean;
  message: string;
  data?: { id: string };
  error?: string;
}

class EmailService {
  private resend: Resend;
  private defaultFrom: string;

  constructor() {
    this.resend = new Resend(env.RESEND_API_KEY);
    this.defaultFrom = env.FROM_EMAIL;
  }

  async sendEmail({
    to,
    subject,
    html,
    from = this.defaultFrom,
    idempotencyKey,
  }: SendEmailParams): Promise<EmailResponse> {
    try {
      const { data, error } = await this.resend.emails.send({
        from,
        to,
        subject,
        html,
      }, idempotencyKey ? { idempotencyKey } : undefined);

      if (error) {
        console.error("[EMAIL] Resend error:", error);
        return {
          success: false,
          message: "Failed to send email",
          error: error.message,
        };
      }

      return {
        success: true,
        message: "Email sent successfully",
        data: { id: data?.id ?? "" },
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error occurred";
      console.error("[EMAIL] Unexpected error:", err);
      return {
        success: false,
        message: "Failed to send email",
        error: message,
      };
    }
  }

  async sendLeadNotification(params: {
    to: string;
    fullName: string;
  }): Promise<EmailResponse> {
    const crmLoginUrl = `${env.CLIENT_URL.replace(/\/$/, "")}/login`;

    const html = `
      <h2>New Lead Submitted</h2>
      <p>A new lead has been submitted through the TwinBlueprint website.</p>
      <br>
      <a
        href="${crmLoginUrl}"
        style="
          display:inline-block;
          padding:14px 28px;
          background:#2563eb;
          color:#ffffff;
          text-decoration:none;
          border-radius:8px;
          font-weight:600;
        "
      >
        View Lead in CRM
      </a>
    `;

    return this.sendEmail({
      to: params.to,
      subject: `New Lead: ${params.fullName}`,
      html,
    });
  }

  async sendSubmitterConfirmation(params: {
    to: string;
    fullName: string;
    source: "demo" | "lead";
  }): Promise<EmailResponse> {
    const isDemo = params.source === "demo";
    const headline = isDemo
      ? "Demo request received"
      : "We received your details";
    const intro = isDemo
      ? `Hi ${params.fullName}, thanks for requesting a demo with TwinBlueprint. Our team will reach out to you shortly.`
      : `Hi ${params.fullName}, thanks for getting in touch with TwinBlueprint. We received your details and will be in contact soon.`;

    const html = `
      <h2>${headline}</h2>
      <p>${intro}</p>
      <br>
      <p>Best,<br>TwinBlueprint Team</p>
    `;

    return this.sendEmail({
      to: params.to,
      subject: isDemo
        ? `Demo request received — ${params.fullName}`
        : `Lead received — ${params.fullName}`,
      html,
    });
  }
}

export const emailService = new EmailService();
