import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Sending email. One adapter is chosen per request:
//
// - Tests install a fake with setEmailSenderForTests and read what it captured.
// - With RESEND_API_KEY and EMAIL_FROM set, messages go through Resend's HTTP API.
// - Outside production with neither, messages are written as JSON files to DEV_OUTBOX_DIR
//   (default web/.dev-outbox/, ignored by git), so local development can follow a link without an
//   account. Nothing is sent anywhere.
// - In production without Resend configured, there is no sender: the email flow says delivery
//   isn't available, and nothing is ever marked verified.
//
// Addresses and links are never logged.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  /** Where messages go, for the settings page to explain ("resend" never shows the key). */
  kind: "resend" | "dev-outbox" | "test";
  send(message: EmailMessage): Promise<void>;
}

const holder = globalThis as typeof globalThis & { codebasesTestEmailSender?: EmailSender | null };

/** Tests only: replace the sender, or pass undefined to restore the normal choice. */
export function setEmailSenderForTests(sender: EmailSender | null | undefined): void {
  holder.codebasesTestEmailSender = sender;
}

const resendSender = (apiKey: string, from: string): EmailSender => ({
  kind: "resend",
  async send(message) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Email provider refused the message (${response.status})`);
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
  if (process.env.NODE_ENV !== "production") return devOutbox(devOutboxDir());
  return null;
}
