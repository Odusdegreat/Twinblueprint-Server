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
    fullName: string;
    email: string;
    company?: string;
    jobTitle?: string;
    phone?: string;
    category?: string;
    dateSubmitted?: Date;
  }): Promise<EmailResponse> {
    const dateStr = params.dateSubmitted
      ? new Date(params.dateSubmitted).toLocaleString("en-US", {
          dateStyle: "full",
          timeStyle: "short",
        })
      : new Date().toLocaleString("en-US", {
          dateStyle: "full",
          timeStyle: "short",
        });

    const html = `
      <h2>New Lead Submitted</h2>
      <p>A new lead has been submitted through the TwinBlueprint website.</p>
      <table>
        <tr>
          <td><strong>Name:</strong></td>
          <td>${params.fullName}</td>
        </tr>
        <tr>
          <td><strong>Email:</strong></td>
          <td>${params.email}</td>
        </tr>
        ${params.company ? `<tr><td><strong>Company:</strong></td><td>${params.company}</td></tr>` : ""}
        ${params.jobTitle ? `<tr><td><strong>Job Title:</strong></td><td>${params.jobTitle}</td></tr>` : ""}
        ${params.phone ? `<tr><td><strong>Phone:</strong></td><td>${params.phone}</td></tr>` : ""}
        ${params.category ? `<tr><td><strong>Industry:</strong></td><td>${params.category}</td></tr>` : ""}
      </table>
      <br>
      <a
        href="https://crm.twinblueprint.com/login"
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
}

export const emailService = new EmailService();
