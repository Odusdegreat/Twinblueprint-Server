import { Resend } from "resend";
import { env } from "../config/env.config.ts";

const resend = new Resend(env.RESEND_API_KEY);

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export const sendEmail = async ({
  to,
  subject,
  html,
  from = env.FROM_EMAIL,
}: SendEmailParams): Promise<void> => {
  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[EMAIL] Resend error:", error);
      throw Object.assign(new Error("Failed to send email"), {
        statusCode: 502,
      });
    }
  } catch (err) {
    if (err instanceof Error && "statusCode" in err) throw err;

    console.error("[EMAIL] Unexpected error:", err);
    throw Object.assign(new Error("Failed to send email"), {
      statusCode: 502,
    });
  }
};

interface LeadNotificationParams {
  to: string;
  leadName: string;
  leadEmail: string;
  company?: string;
}

export const sendLeadNotification = async ({
  to,
  leadName,
  leadEmail,
  company,
}: LeadNotificationParams): Promise<void> => {
  const html = `
    <h2>New Lead Notification</h2>
    <p>A new lead has been submitted.</p>
    <ul>
      <li><strong>Name:</strong> ${leadName}</li>
      <li><strong>Email:</strong> ${leadEmail}</li>
      ${company ? `<li><strong>Company:</strong> ${company}</li>` : ""}
    </ul>
  `;

  await sendEmail({
    to,
    subject: `New Lead: ${leadName}`,
    html,
  });
};
