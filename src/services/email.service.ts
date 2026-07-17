import { Resend } from "resend";
import { env } from "../config/env.config.ts";

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
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
  }: SendEmailParams): Promise<EmailResponse> {
    try {
      const { data, error } = await this.resend.emails.send({
        from,
        to,
        subject,
        html,
      });

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
    leadName: string;
    leadEmail: string;
    company?: string;
  }): Promise<EmailResponse> {
    const html = `
      <h2>New Lead Notification</h2>
      <p>A new lead has been submitted.</p>
      <ul>
        <li><strong>Name:</strong> ${params.leadName}</li>
        <li><strong>Email:</strong> ${params.leadEmail}</li>
        ${params.company ? `<li><strong>Company:</strong> ${params.company}</li>` : ""}
      </ul>
    `;

    return this.sendEmail({
      to: params.to,
      subject: `New Lead: ${params.leadName}`,
      html,
    });
  }
}

export const emailService = new EmailService();
