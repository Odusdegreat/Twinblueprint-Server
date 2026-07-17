import { Resend } from "resend";

const resend = new Resend("re_YS6Tr1kx_CyPMbLx5iRqmpHHrRM7aTNYR");

const { data, error } = await resend.emails.send({
  from: "onboarding@resend.dev",
  to: "twinblueprints@gmail.com",
  subject: "Hello World",
  html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
});

if (error) {
  console.error("Error:", error);
} else {
  console.log("Email sent:", data);
}
