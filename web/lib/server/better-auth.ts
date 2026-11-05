import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getPool } from "@/lib/server/db";

/** GitHub sign-in is on only when the OAuth app's credentials are set. */
export function isGitHubAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?$/i;

/**
 * Dev only. A loopback Host is required as well, so a DNS-rebinding page on another name, whose
 * Origin and Host would match each other, still isn't trusted.
 */
function sameHostOrigins(request: Request | undefined): string[] {
  const host = request?.headers.get("host");
  if (!host || !LOOPBACK_HOST.test(host)) return [];
  return [`http://${host}`, `https://${host}`];
}

/**
 * The Better Auth options, kept apart from the instance so tests and the schema check can read
 * them. Table and column names are snake_case to match the rest of the database. Migration 0005
 * creates these tables; change both together.
 */
export function betterAuthOptions() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (process.env.NODE_ENV === "production") {
    if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
    // Behind a proxy the request's own URL can be internal, so production names its origin.
    if (!baseURL) throw new Error("BETTER_AUTH_URL is not set");
  }
  return {
    appName: "codebases",
    ...(baseURL ? { baseURL } : {}),
    ...(secret ? { secret } : {}),
    // Better Auth refuses a POST whose Origin isn't trusted, which stops cross-site requests. With
    // BETTER_AUTH_URL set, that origin is trusted. Without it (local dev on any host and port), the
    // only trusted origin is the request's own Host, so a same-origin request passes. A browser
    // always sends the real Host and Origin, so a page on another site can't make them match.
    // Next reports `request.url` as localhost even when the site is on 127.0.0.1, so it can't be used.
    ...(baseURL ? {} : { trustedOrigins: (request?: Request) => sameHostOrigins(request) }),
    database: getPool(),
    telemetry: { enabled: false },
    advanced: {
      database: { generateId: "uuid" as const },
      // Better Auth skips its origin and CSRF checks when NODE_ENV is "test". Keeping them on
      // everywhere means the tests prove they work.
      disableOriginCheck: false,
    },
    user: {
      modelName: "auth_users",
      fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
      additionalFields: {
        // The GitHub username, from the OAuth profile. It can't be `input: false`, because Better
        // Auth then drops it from the profile mapping too. Users still can't set it: /update-user,
        // the only route that would take it from a request body, is disabled below.
        githubLogin: { type: "string" as const, required: false, fieldName: "github_login" },
      },
    },
    session: {
      modelName: "auth_sessions",
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        userId: "user_id",
      },
    },
    account: {
      modelName: "auth_accounts",
      // Off, so a second GitHub account with the same verified email can't join an existing user.
      // Emails are made from the GitHub id below anyway, so two accounts never share one.
      accountLinking: { enabled: false },
      // The app never uses the GitHub token, so it's stored encrypted and never handed out.
      encryptOAuthTokens: true,
      fields: {
        accountId: "account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      modelName: "auth_verifications",
      fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
    },
    socialProviders: isGitHubAuthConfigured()
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID ?? "",
            clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
            // Keeps github_login current if someone renames their GitHub account.
            overrideUserInfoOnSignIn: true,
            mapProfileToUser: (profile: { id: string | number; login: string }) => ({
              githubLogin: profile.login,
              // The app never emails anyone, so it doesn't keep the GitHub email. A placeholder
              // made from GitHub's numeric id is unique per account, never changes, and works for
              // accounts whose email is private.
              email: `${profile.id}@github-user.invalid`,
              emailVerified: false,
            }),
          },
        }
      : {},
    // Routes the app doesn't use, closed so they can't be misused: editing the user (which would
    // let someone set githubLogin), email changes, account linking, and reading GitHub tokens.
    disabledPaths: [
      "/update-user",
      "/change-email",
      "/delete-user",
      "/link-social",
      "/unlink-account",
      "/list-accounts",
      "/account-info",
      "/get-access-token",
      "/refresh-token",
    ],
    // Must stay last: it lets server actions set Better Auth's cookies.
    plugins: [nextCookies()],
  };
}

function createAuth() {
  return betterAuth(betterAuthOptions());
}

type Auth = ReturnType<typeof createAuth>;

// Created on first use, like the pool, and kept on globalThis so dev hot reloads reuse it.
const holder = globalThis as typeof globalThis & { codebasesAuth?: Auth };

export function getAuth(): Auth {
  holder.codebasesAuth ??= createAuth();
  return holder.codebasesAuth;
}

function isSchemaMismatch(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "SCHEMA_MISMATCH";
}

/**
 * Runs `work` with the auth instance. Better Auth checks the tables once per instance and keeps a
 * mismatch until its own migrate command clears it, which never runs here. So an instance that
 * saw the database before migration 0005 is dropped, and the next request builds a fresh one.
 */
export async function withAuth<T>(work: (auth: Auth) => Promise<T>): Promise<T> {
  const auth = getAuth();
  try {
    return await work(auth);
  } catch (error) {
    if (isSchemaMismatch(error) && holder.codebasesAuth === auth) holder.codebasesAuth = undefined;
    throw error;
  }
}
