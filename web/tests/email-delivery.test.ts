import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The SMTP adapter is checked against a stand-in for nodemailer: what it connects with, what it
// sends, and that a failure never carries the server's reply (which can name the recipient).
const nodemailer = vi.hoisted(() => ({
  options: [] as unknown[],
  sent: [] as unknown[],
  closed: 0,
  failWith: null as Error | null,
}));

vi.mock("nodemailer", () => ({
  createTransport: (options: unknown) => {
    nodemailer.options.push(options);
    return {
      sendMail: async (mail: unknown) => {
        if (nodemailer.failWith) throw nodemailer.failWith;
        nodemailer.sent.push(mail);
        return {};
      },
      close: () => {
        nodemailer.closed += 1;
      },
    };
  },
}));

const { EmailDeliveryError, emailSender, setEmailSenderForTests, smtpConfig } = await import("@/lib/server/email-delivery");

const GMAIL = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_USER: "codebases.site@gmail.com",
  SMTP_PASSWORD: "abcd efgh ijkl mnop",
};

describe("email delivery", () => {
  beforeEach(() => {
    setEmailSenderForTests(undefined);
    for (const name of ["RESEND_API_KEY", "EMAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"]) {
      vi.stubEnv(name, "");
    }
    nodemailer.options = [];
    nodemailer.sent = [];
    nodemailer.closed = 0;
    nodemailer.failWith = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stub(values: Record<string, string>) {
    for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
  }

  it("uses SMTP when its host, user and password are set", () => {
    stub(GMAIL);
    expect(emailSender()?.kind).toBe("smtp");
  });

  it("prefers Resend when both are configured", () => {
    stub({ ...GMAIL, RESEND_API_KEY: "re_test", EMAIL_FROM: "codebases <noreply@mail.example.com>" });
    expect(emailSender()?.kind).toBe("resend");
  });

  it("ignores incomplete SMTP settings", () => {
    stub({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "codebases.site@gmail.com" });
    expect(smtpConfig()).toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect(emailSender()).toBeNull();
  });

  it("refuses a port that isn't a number in range", () => {
    for (const port of ["smtp", "0", "70000", "465.5"]) {
      stub({ ...GMAIL, SMTP_PORT: port });
      expect(smtpConfig()).toBeNull();
    }
  });

  it("defaults to port 465 and sends as the SMTP user, without the app password's spaces", () => {
    stub(GMAIL);
    expect(smtpConfig()).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      user: "codebases.site@gmail.com",
      password: "abcdefghijklmnop",
      from: "codebases.site@gmail.com",
    });
    stub({ EMAIL_FROM: "codebases <codebases.site@gmail.com>" });
    expect(smtpConfig()?.from).toBe("codebases <codebases.site@gmail.com>");
  });

  it("connects with TLS on 465 and sends the message", async () => {
    stub({ ...GMAIL, EMAIL_FROM: "codebases <codebases.site@gmail.com>" });
    await emailSender()?.send({ to: "someone@example.com", subject: "Confirm", text: "Link" });
    expect(nodemailer.options).toEqual([
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        requireTLS: false,
        auth: { user: "codebases.site@gmail.com", pass: "abcdefghijklmnop" },
      }),
    ]);
    expect(nodemailer.sent).toEqual([
      { from: "codebases <codebases.site@gmail.com>", to: "someone@example.com", subject: "Confirm", text: "Link" },
    ]);
    expect(nodemailer.closed).toBe(1);
  });

  it("requires STARTTLS on other ports", async () => {
    stub({ ...GMAIL, SMTP_PORT: "587" });
    await emailSender()?.send({ to: "someone@example.com", subject: "Confirm", text: "Link" });
    expect(nodemailer.options).toEqual([expect.objectContaining({ port: 587, secure: false, requireTLS: true })]);
  });

  it("reports a failure by its code only, never the server's reply", async () => {
    stub(GMAIL);
    const failure = Object.assign(new Error("550 5.1.1 someone@example.com: no such user"), { code: "EENVELOPE" });
    nodemailer.failWith = failure;
    const sending = emailSender()?.send({ to: "someone@example.com", subject: "Confirm", text: "Link" });
    await expect(sending).rejects.toBeInstanceOf(EmailDeliveryError);
    await expect(sending).rejects.toThrow("SMTP send failed (EENVELOPE)");
    await expect(sending).rejects.not.toThrow(/example\.com/);
    expect(nodemailer.closed).toBe(1);
  });
});
