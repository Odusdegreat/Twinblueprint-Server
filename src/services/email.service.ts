import nodemailer from "nodemailer";

export const sendDemoEmail = async (data: {
  fullName: string;
  workEmail: string;
  company?: string;
}) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"TwinBlueprint" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_USER, // you receive it
    subject: "📩 New Demo Request",
    html: `
      <h2>New Demo Request</h2>
      <p><strong>Name:</strong> ${data.fullName}</p>
      <p><strong>Email:</strong> ${data.workEmail}</p>
      <p><strong>Company:</strong> ${data.company || "N/A"}</p>
    `,
  };

  await transporter.sendMail(mailOptions);
};