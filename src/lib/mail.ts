import nodemailer from "nodemailer";
import { config } from "./config";

const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      // Fail fast: hosts that block outbound SMTP (e.g. Railway Hobby) would otherwise hang the
      // request for minutes, making forms like "Add employee" appear broken.
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 15000,
    })
  : null;

/** Fire-and-forget notification. Logs to console when SMTP isn't configured. */
export async function notify(to: string | string[], subject: string, lines: string[], path = "/") {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) return;
  const link = config.appUrl + path;
  const text = [...lines, "", `Open: ${link}`].join("\n");
  if (!transport) {
    console.log(`[mail:disabled] to=${recipients.join(",")} subject="${subject}"\n${text}`);
    return;
  }
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || `${config.appName} <no-reply@localhost>`,
      to: recipients,
      subject: `[${config.appName}] ${subject}`,
      text,
    });
  } catch (e) {
    console.error("mail failed", e);
  }
}
