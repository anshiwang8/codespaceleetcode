import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { EmailStatus } from "@/lib/api-types";
import type { CurrentUser, HeaderReader } from "@/lib/server/auth";
import { getPool, withTransaction } from "@/lib/server/db";
import { EmailDeliveryError, emailSender } from "@/lib/server/email-delivery";
import { consumeRateLimit, type RateLimit } from "@/lib/server/rate-limit";
import { siteOrigin } from "@/lib/server/site";

// The verified contact email. It lives in user_emails, apart from Better Auth's auth_users.email,
// which stays a placeholder made from the GitHub id (migration 0005) because Better Auth needs a
// unique email per user. Signing in stays GitHub-only: this address can't be used to sign in,
// recover an account or link accounts.
//
// Setting or changing it sends a link with a random 256-bit token; only its SHA-256 hash is
// stored. A token works once, within 30 minutes, for the same signed-in user and purpose. The
// current verified address stays active until a new one is verified, and is told about the change.
// Changing a verified address needs a GitHub sign-in from the last 15 minutes.

export const VERIFY_TTL_MS = 30 * 60_000;
export const RECENT_SIGN_IN_MS = 15 * 60_000;
export const EMAIL_REQUEST_LIMIT: RateLimit = { limit: 5, windowMs: 60 * 60_000 };
export const EMAIL_VERIFY_LIMIT: RateLimit = { limit: 20, windowMs: 10 * 60_000 };

export const emailAddress = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email()
  .refine((value) => !/[\s<>"]/.test(value));

const hashToken = (token: string) => createHash("sha256").update(token).digest();

export type EmailResult =
  | { ok: true; status: EmailStatus }
  | { ok: false; status: number; error: string; code?: "reauth" | "expired" | "unavailable" | "invalid" };

/** True when this session may change a verified address. Dev logins exist only on localhost. */
export function hasRecentSignIn(user: CurrentUser, now: Date = new Date()): boolean {
  if (user.via === "dev") return true;
  return user.sessionCreatedAt !== null && now.getTime() - user.sessionCreatedAt.getTime() <= RECENT_SIGN_IN_MS;
}

export interface VerifiedEmailRow {
  email: string;
  verified_at: Date;
}

export interface PendingEmailRow {
  email: string;
  purpose: "setup" | "change";
  expires_at: Date;
}

/** The status the owner sees, from their user_emails row and newest unconsumed verification. */
export function emailStatusFrom(
  user: CurrentUser,
  verified: VerifiedEmailRow | undefined,
  waiting: PendingEmailRow | undefined,
  now: Date = new Date(),
): EmailStatus {
  return {
    address: verified?.email ?? null,
    verifiedAt: verified ? verified.verified_at.toISOString() : null,
    pending: waiting
      ? {
          address: waiting.email,
          purpose: waiting.purpose,
          expiresAt: waiting.expires_at.toISOString(),
          expired: waiting.expires_at.getTime() <= now.getTime(),
        }
      : null,
    deliveryAvailable: emailSender() !== null,
    localOutbox: emailSender()?.kind === "dev-outbox",
    recentSignIn: hasRecentSignIn(user, now),
  };
}

export async function getEmailStatus(user: CurrentUser, now: Date = new Date()): Promise<EmailStatus> {
  const [current, pending] = await Promise.all([
    getPool().query<VerifiedEmailRow>("select email, verified_at from user_emails where user_id = $1", [user.id]),
    // The newest unconsumed verification: the one link that can still be used.
    getPool().query<PendingEmailRow>(
      `select email, purpose, expires_at from email_verifications
        where user_id = $1 and consumed_at is null order by created_at desc limit 1`,
      [user.id],
    ),
  ]);
  return emailStatusFrom(user, current.rows[0], pending.rows[0], now);
}

/** The origin verification links point at: the configured site, or this loopback dev server. */
export function linkOrigin(headers: HeaderReader): string {
  if (process.env.BETTER_AUTH_URL?.trim() || process.env.NODE_ENV === "production") return siteOrigin();
  const host = headers.get("host") ?? "";
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i.test(host) ? `http://${host}` : siteOrigin();
}

function verificationText(link: string, purpose: "setup" | "change"): string {
  return [
    purpose === "setup"
      ? "Confirm this address to finish setting up your codebases account."
      : "Confirm this address to make it your codebases contact email.",
    "",
    "Open this link while signed in to codebases. It works once and expires in 30 minutes:",
    link,
    "",
    "If you didn't ask for this, ignore this email. Nothing changes unless the link is opened.",
  ].join("\n");
}

const IN_USE_TEXT = [
  "Someone tried to add this address to a codebases account, but it's already the contact email of",
  "another codebases account. No change was made.",
  "",
  "If that was you, sign in with the GitHub account that already uses this address. If it wasn't, you",
  "can ignore this email.",
].join("\n");

/**
 * Starts setting (or changing) the contact email: records a pending verification and emails the
 * link. If the address already belongs to another account, the requester sees the same pending
 * state, and that address gets a notice instead of a link, so nobody learns whose address it is.
 */
export async function requestEmail(user: CurrentUser, rawAddress: string, origin: string, now: Date = new Date()): Promise<EmailResult> {
  const parsed = emailAddress.safeParse(rawAddress);
  if (!parsed.success) return { ok: false, status: 400, error: "Enter a valid email address.", code: "invalid" };
  const address = parsed.data;
  const sender = emailSender();
  if (!sender) {
    return {
      ok: false,
      status: 503,
      error: "This server can't send email yet, so an address can't be verified. Nothing was changed.",
      code: "unavailable",
    };
  }
  const limit = await consumeRateLimit(`email:user:${user.id}`, EMAIL_REQUEST_LIMIT, now);
  if (limit.limited) return { ok: false, status: 429, error: "Too many email requests. Try again in an hour." };

  const current = await getPool().query<{ email: string }>("select email from user_emails where user_id = $1", [user.id]);
  const existing = current.rows[0]?.email ?? null;
  if (existing && existing.toLowerCase() === address.toLowerCase()) {
    return { ok: false, status: 400, error: "That's already your verified email.", code: "invalid" };
  }
  const purpose = existing ? "change" : "setup";
  if (purpose === "change" && !hasRecentSignIn(user, now)) {
    return {
      ok: false,
      status: 403,
      error: "For your security, sign in with GitHub again before changing your email.",
      code: "reauth",
    };
  }

  const token = randomBytes(32).toString("base64url");
  const { id, inUse } = await withTransaction(async (client) => {
    // One pending change at a time: any earlier link stops working.
    await client.query("delete from email_verifications where user_id = $1 and consumed_at is null", [user.id]);
    const taken = await client.query<{ taken: boolean }>(
      "select exists (select 1 from user_emails where lower(email) = lower($1) and user_id <> $2) as taken",
      [address, user.id],
    );
    const inserted = await client.query<{ id: string }>(
      `insert into email_verifications (user_id, email, purpose, token_hash, expires_at)
       values ($1, $2, $3, $4, $5) returning id`,
      [user.id, address, purpose, hashToken(token), new Date(now.getTime() + VERIFY_TTL_MS)],
    );
    return { id: inserted.rows[0]?.id, inUse: taken.rows[0]?.taken === true };
  });

  try {
    if (inUse) {
      await sender.send({ to: address, subject: "This address is already used on codebases", text: IN_USE_TEXT });
    } else {
      const link = `${origin}/settings/email/verify?token=${encodeURIComponent(token)}`;
      await sender.send({ to: address, subject: "Confirm your codebases email", text: verificationText(link, purpose) });
    }
  } catch (error) {
    // Not sent, so not pending: the user can try again.
    await getPool().query("delete from email_verifications where id = $1", [id]);
    console.error("[email] delivery failed", deliveryReason(error));
    return { ok: false, status: 502, error: "The email couldn't be sent. Try again in a moment." };
  }
  return { ok: true, status: await getEmailStatus(user, now) };
}

/** Sends a new link for the pending address. The old link stops working. */
export async function resendEmail(user: CurrentUser, origin: string, now: Date = new Date()): Promise<EmailResult> {
  const status = await getEmailStatus(user, now);
  if (!status.pending) return { ok: false, status: 400, error: "There's no email waiting for confirmation." };
  return requestEmail(user, status.pending.address, origin, now);
}

/** Drops a pending change. The verified address, if any, is unaffected. */
export async function cancelPendingEmail(user: CurrentUser): Promise<void> {
  await getPool().query("delete from email_verifications where user_id = $1 and consumed_at is null", [user.id]);
}

/**
 * Confirms an address from its link. The token must be this signed-in user's, unused, unexpired,
 * and its address must still be free. Every refusal looks the same from outside, except expiry,
 * which says to ask for a new link.
 */
export async function verifyEmail(user: CurrentUser, token: string, now: Date = new Date()): Promise<EmailResult> {
  const limit = await consumeRateLimit(`email-verify:user:${user.id}`, EMAIL_VERIFY_LIMIT, now);
  if (limit.limited) return { ok: false, status: 429, error: "Too many attempts. Try again in a few minutes." };
  const invalid: EmailResult = {
    ok: false,
    status: 400,
    error: "This link isn't valid. It may have been used already, or be for a different account.",
    code: "invalid",
  };
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return invalid;

  const outcome = await withTransaction(async (client) => {
    const found = await client.query<{ id: string; user_id: string; email: string; purpose: string; expires_at: Date; consumed_at: Date | null }>(
      "select id, user_id, email, purpose, expires_at, consumed_at from email_verifications where token_hash = $1 for update",
      [hashToken(token)],
    );
    const row = found.rows[0];
    if (!row || row.user_id !== user.id || row.consumed_at) return { kind: "invalid" as const };
    if (row.expires_at.getTime() <= now.getTime()) return { kind: "expired" as const };
    const taken = await client.query<{ taken: boolean }>(
      "select exists (select 1 from user_emails where lower(email) = lower($1) and user_id <> $2) as taken",
      [row.email, user.id],
    );
    await client.query("update email_verifications set consumed_at = $2 where id = $1", [row.id, now]);
    if (taken.rows[0]?.taken) return { kind: "invalid" as const };
    const previous = await client.query<{ email: string }>("select email from user_emails where user_id = $1", [user.id]);
    // Two accounts confirming the same address at once both pass the check above, and the second
    // insert breaks the unique index. Its error detail quotes the address, so it must never reach
    // the logs: treat it as taken, keeping the token consumed.
    await client.query("savepoint claim_address");
    try {
      await client.query(
        `insert into user_emails (user_id, email, verified_at) values ($1, $2, $3)
         on conflict (user_id) do update set email = excluded.email, verified_at = excluded.verified_at`,
        [user.id, row.email, now],
      );
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        await client.query("rollback to savepoint claim_address");
        return { kind: "invalid" as const };
      }
      throw error;
    }
    await client.query("delete from email_verifications where user_id = $1 and consumed_at is null", [user.id]);
    return { kind: "verified" as const, previous: previous.rows[0]?.email ?? null, address: row.email };
  });

  if (outcome.kind === "expired") {
    return { ok: false, status: 410, error: "This link has expired. Send a new one from Settings.", code: "expired" };
  }
  if (outcome.kind === "invalid") return invalid;
  if (outcome.previous && outcome.previous.toLowerCase() !== outcome.address.toLowerCase()) {
    const sender = emailSender();
    try {
      await sender?.send({
        to: outcome.previous,
        subject: "Your codebases email was changed",
        text: [
          `The contact email on your codebases account was changed to ${maskAddress(outcome.address)}.`,
          "",
          "If you didn't make this change, sign in to codebases with GitHub and change it back in Settings.",
        ].join("\n"),
      });
    } catch (error) {
      console.error("[email] change notice failed", deliveryReason(error));
    }
  }
  return { ok: true, status: await getEmailStatus(user, now) };
}

/** Why a send failed, for the server log: only a reason the sender vouches has no address in it. */
function deliveryReason(error: unknown): string {
  return error instanceof EmailDeliveryError ? error.message : "unexpected error";
}

/** "j***@example.com": enough to recognize, not enough to copy. */
export function maskAddress(address: string): string {
  const [local = "", domain = ""] = address.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}
