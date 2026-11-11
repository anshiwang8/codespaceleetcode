import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createTransport } from "nodemailer";

// Sending email. One adapter is chosen per request:
//
// - Tests install a fake with setEmailSenderForTests and read what it captured.
// - With RESEND_API_KEY and EMAIL_FROM set, messages go through Resend's HTTP API.
// - Otherwise, with SMTP_HOST, SMTP_USER and SMTP_PASSWORD set, messages go through that SMTP server
//   (for example Gmail with an app password, which needs no domain of our own). EMAIL_FROM defaults
//   to SMTP_USER, since Gmail only sends as the signed-in account or its verified aliases.
// - Outside production with none of these, messages are written as JSON files to DEV_OUTBOX_DIR
//   (default web/.dev-outbox/, ignored by git), so local development can follow a link without an
//   account. Nothing is sent anywhere.
// - In production without a provider, there is no sender: the email flow says delivery isn't
//   available, and nothing is ever marked verified.
//
// Addresses and links are never logged. A failed send throws EmailDeliveryError, whose message
// names only the provider and its status or error code, so callers may log it.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  /** Where messages go, for the settings page to explain (never shows a key or password). */
  kind: "resend" | "smtp" | "dev-outbox" | "test";
  send(message: EmailMessage): Promise<void>;
}

/** A send that failed. Its message is safe to log: no address, link or credential. */
export class EmailDeliveryError extends Error {
  override name = "EmailDeliveryError";
}

const holder = globalThis as typeof globalThis & { codebasesTestEmailSender?: EmailSender | null };

/** Tests only: replace the sender, or pass undefined to restore the normal choice. */
export function setEmailSenderForTests(sender: EmailSender | null | undefined): void {
  holder.codebasesTestEmailSender = sender;
}

const SEND_TIMEOUT_MS = 10_000;

const resendSender = (apiKey: string, from: string): EmailSender => ({
  kind: "resend",
  async send(message) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) throw new EmailDeliveryError(`Resend refused the message (${response.status})`);
  },
});

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

/** The SMTP settings from the environment, or null when they're incomplete or the port is invalid. */
export function smtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  // App passwords are shown in groups of four; spaces are never part of one.
  const password = env.SMTP_PASSWORD?.replace(/\s+/g, "");
  if (!host || !user || !password) return null;
  const rawPort = env.SMTP_PORT?.trim() || "465";
  if (!/^\d{1,5}$/.test(rawPort)) return null;
  const port = Number(rawPort);
  if (port < 1 || port > 65_535) return null;
  return { host, port, user, password, from: env.EMAIL_FROM?.trim() || user };
}

const smtpSender = (config: SmtpConfig): EmailSender => ({
  kind: "smtp",
  async send(message) {
    const transport = createTransport({
      host: config.host,
      port: config.port,
      // 465 is TLS from the start; other ports must upgrade with STARTTLS or fail.
      secure: config.port === 465,
      requireTLS: config.port !== 465,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
    try {
      await transport.sendMail({ from: config.from, to: message.to, subject: message.subject, text: message.text });
    } catch (error) {
      // nodemailer's own messages can quote the server's reply, which may name the recipient.
      const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "unknown";
      throw new EmailDeliveryError(`SMTP send failed (${code.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "unknown"})`);
    } finally {
      transport.close();
    }
  },
});

const devOutbox = (directory: string): EmailSender => ({
  kind: "dev-outbox",
  async send(message) {
    await mkdir(directory, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(16).slice(2, 8)}.json`;
    await writeFile(path.join(directory, name), JSON.stringify(message, null, 2));
  },
});

export function devOutboxDir(): string {
  return process.env.DEV_OUTBOX_DIR?.trim() || path.join(process.cwd(), ".dev-outbox");
}

/** The sender to use now, or null when this server can't send email. */
export function emailSender(): EmailSender | null {
  if (holder.codebasesTestEmailSender !== undefined) return holder.codebasesTestEmailSender;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (apiKey && from) return resendSender(apiKey, from);
  const smtp = smtpConfig();
  if (smtp) return smtpSender(smtp);
  if (process.env.NODE_ENV !== "production") return devOutbox(devOutboxDir());
  return null;
}
