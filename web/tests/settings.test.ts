import { makeSignature } from "better-auth/crypto";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DELETE as deleteAvatarRoute, GET as getAvatarRoute, POST as postAvatarRoute } from "@/app/api/me/avatar/route";
import { PUT as detailsRoute } from "@/app/api/me/details/route";
import { POST as emailRoute, DELETE as cancelEmailRoute } from "@/app/api/me/email/route";
import { POST as resendRoute } from "@/app/api/me/email/resend/route";
import { POST as verifyRoute } from "@/app/api/me/email/verify/route";
import { PUT as linksRoute } from "@/app/api/me/links/route";
import { PUT as preferencesRoute } from "@/app/api/me/preferences/route";
import { DELETE as deleteMe, GET as getMe } from "@/app/api/me/route";
import { GET as settingsRoute } from "@/app/api/me/settings/route";
import { GET as profileRoute } from "@/app/api/me/profile/route";
import type { EmailStatus, MeResponse, ProfileResponse, SettingsResponse } from "@/lib/api-types";
import { getAuth } from "@/lib/server/better-auth";
import { getPool } from "@/lib/server/db";
import { setEmailSenderForTests, type EmailMessage } from "@/lib/server/email-delivery";
import { seedFixtures } from "./fixtures";
import { hasDatabase, makeRequest, signIn } from "./helpers";

const ORIGIN = "http://localhost:3000";

/** A request from this site, as a browser sends it. */
function call(path: string, method: string, cookie: string | undefined, body?: unknown, raw?: Uint8Array) {
  return makeRequest(path, {
    method,
    cookie,
    headers: { origin: ORIGIN, ...(raw ? {} : { "content-type": "application/json" }) },
    ...(raw ? { rawBody: raw as unknown as string } : body === undefined ? {} : { body }),
  });
}

const json = async <T>(response: Response) => (await response.json()) as T;

/** Captures what would have been emailed. */
let outbox: EmailMessage[] = [];
const fakeSender = { kind: "test" as const, send: async (message: EmailMessage) => void outbox.push(message) };

function linkToken(message: EmailMessage | undefined): string {
  const match = /token=([A-Za-z0-9_-]+)/.exec(message?.text ?? "");
  if (!match?.[1]) throw new Error("no link in the message");
  return match[1];
}

async function githubUser(login: string, sessionAgeMinutes = 0): Promise<{ cookie: string; id: string }> {
  const context = await getAuth().$context;
  const user = await context.internalAdapter.createUser(
    { name: `${login} name`, email: `${Math.floor(Math.random() * 1e9)}@github-user.invalid`, emailVerified: false, githubLogin: login },
    { method: "oauth", oauth: { providerId: "github", profile: { login } } },
  );
  await context.internalAdapter.linkAccount({ userId: user.id, providerId: "github", accountId: String(Math.random()), accessToken: "gho_x" });
  const session = await context.internalAdapter.createSession(user.id);
  if (sessionAgeMinutes > 0) {
    await getPool().query("update auth_sessions set created_at = now() - make_interval(mins => $2) where token = $1", [
      session.token,
      sessionAgeMinutes,
    ]);
  }
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token, context.secret)}`;
  // The first request makes the users row.
  await getMe(makeRequest("/api/me", { cookie }), undefined);
  return { cookie, id: user.id };
}

async function idOf(login: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>("select id from users where github_login = $1", [login]);
  if (!rows[0]) throw new Error(`no user ${login}`);
  return rows[0].id;
}

const png = (color = "#3366cc") => sharp({ create: { width: 120, height: 80, channels: 3, background: color } }).png().toBuffer();

describe.skipIf(!hasDatabase)("settings", () => {
  beforeAll(async () => {
    await seedFixtures();
  });
  afterEach(() => {
    outbox = [];
    setEmailSenderForTests(undefined);
  });

  describe("access", () => {
    it("needs sign-in everywhere, and a same-site request to change anything", async () => {
      expect((await settingsRoute(makeRequest("/api/me/settings"), undefined)).status).toBe(401);
      expect((await getAvatarRoute(makeRequest("/api/me/avatar"), undefined)).status).toBe(401);
      const cookie = await signIn("settings-access");
      for (const [route, path, body] of [
        [detailsRoute, "/api/me/details", { displayName: "x", pronouns: null, bio: null, birthday: null }],
        [linksRoute, "/api/me/links", { linkedin: null, github: null, website: null, x: null, bluesky: null, mastodon: null, custom: [] }],
        [preferencesRoute, "/api/me/preferences", { preference: { mode: "system" } }],
        [emailRoute, "/api/me/email", { email: "a@example.com" }],
      ] as const) {
        const crossSite = makeRequest(path, { method: route === emailRoute ? "POST" : "PUT", cookie, body, headers: { origin: "https://evil.example" } });
        expect((await route(crossSite, undefined)).status, path).toBe(403);
        const signedOut = call(path, route === emailRoute ? "POST" : "PUT", undefined, body);
        expect((await route(signedOut, undefined)).status, path).toBe(401);
      }
    });
  });

  describe("details and links", () => {
    it("saves, clears, and refuses only what's invalid, without touching other fields", async () => {
      const cookie = await signIn("settings-details");
      const save = (body: Record<string, unknown>) => detailsRoute(call("/api/me/details", "PUT", cookie, body), undefined);
      const saved = await save({ displayName: "  Ada  ", pronouns: "she/her", bio: "Reads code.\nWrites tests.", birthday: "2000-02-29" });
      expect(saved.status).toBe(200);
      expect(await json(saved)).toEqual({ displayName: "Ada", pronouns: "she/her", bio: "Reads code.\nWrites tests.", birthday: "2000-02-29" });

      const links = await linksRoute(
        call("/api/me/links", "PUT", cookie, {
          linkedin: null,
          github: "https://github.com/ada",
          website: "https://ada.example",
          x: null,
          bluesky: null,
          mastodon: "https://mastodon.social/@ada",
          custom: [{ label: "Talks", url: "https://talks.example/ada" }],
        }),
        undefined,
      );
      expect(links.status).toBe(200);

      const bad = await save({ displayName: "Ada", pronouns: null, bio: null, birthday: "2999-01-01" });
      expect(bad.status).toBe(400);
      expect(await json<{ fields: Record<string, string> }>(bad)).toMatchObject({ fields: { birthday: "A birthday can't be in the future." } });
      // Unknown keys are refused, not stored.
      expect((await save({ displayName: "Ada", pronouns: null, bio: null, birthday: null, githubLogin: "someone-else" })).status).toBe(400);

      // Saving details left the links alone; clearing everything works.
      const settings = await json<SettingsResponse>(await settingsRoute(makeRequest("/api/me/settings", { cookie }), undefined));
      expect(settings.details.birthday).toBe("2000-02-29");
      expect(settings.links).toMatchObject({ github: "https://github.com/ada", custom: [{ label: "Talks", url: "https://talks.example/ada" }] });
      expect((await save({ displayName: "", pronouns: null, bio: "  ", birthday: null })).status).toBe(200);
      const cleared = await json<SettingsResponse>(await settingsRoute(makeRequest("/api/me/settings", { cookie }), undefined));
      expect(cleared.details).toEqual({ displayName: null, pronouns: null, bio: null, birthday: null });
      expect(cleared.links.website).toBe("https://ada.example/");
    });

    it("refuses unsafe links with a message per field", async () => {
      const cookie = await signIn("settings-links");
      const response = await linksRoute(
        call("/api/me/links", "PUT", cookie, {
          linkedin: "https://linkedin.com.evil.example/in/x",
          github: "javascript:alert(1)",
          website: "http://plain.example",
          x: null,
          bluesky: null,
          mastodon: null,
          custom: [{ label: "", url: "https://ok.example" }],
        }),
        undefined,
      );
      expect(response.status).toBe(400);
      const body = await json<{ fields: Record<string, string> }>(response);
      expect(Object.keys(body.fields).sort()).toEqual(["custom.0.label", "github", "linkedin", "website"]);
    });

    it("shows the profile its own details, never the birthday or GitHub's name", async () => {
      const { cookie, id } = await githubUser("settings-gh");
      await detailsRoute(call("/api/me/details", "PUT", cookie, { displayName: "Chosen Name", pronouns: null, bio: null, birthday: "1990-01-01" }), undefined);
      // A later GitHub sign-in rewrites Better Auth's own copy; it must not reach the profile.
      await getPool().query("update auth_users set name = 'GitHub Name', image = 'https://avatars.example/x' where id = $1", [id]);
      const profile = await json<ProfileResponse>(await profileRoute(makeRequest("/api/me/profile", { cookie }), undefined));
      expect(profile.identity.displayName).toBe("Chosen Name");
      expect(profile.identity.avatarVersion).toBeNull();
      const text = JSON.stringify(profile);
      expect(text).not.toContain("1990-01-01");
      expect(text).not.toContain("GitHub Name");
      expect(text).not.toContain("avatars.example");
      expect(profile.identity.login).toBe("settings-gh");
    });
  });

  describe("preferences", () => {
    it("saves a known theme and favorites, refuses unknown themes, and drops unknown favorites", async () => {
      const cookie = await signIn("settings-theme");
      const put = (body: unknown) => preferencesRoute(call("/api/me/preferences", "PUT", cookie, body), undefined);
      expect((await put({ preference: { mode: "theme", id: "no-such-theme" } })).status).toBe(400);
      expect((await put({ preference: { mode: "theme", id: "DRACULA" } })).status).toBe(400);
      const saved = await put({ preference: { mode: "theme", id: "dracula" }, favorites: ["nord", "made-up", "nord"] });
      expect(await json(saved)).toEqual({ preference: { mode: "theme", id: "dracula" }, favorites: ["nord"] });
      // Favorites alone leave the theme.
      expect(await json(await put({ favorites: [] }))).toEqual({ preference: { mode: "theme", id: "dracula" }, favorites: [] });
      const me = await json<MeResponse>(await getMe(makeRequest("/api/me", { cookie }), undefined));
      expect(me.user?.appearance).toEqual({ preference: { mode: "theme", id: "dracula" }, favorites: [] });
      // Another user doesn't get it.
      const other = await signIn("settings-theme-other");
      const theirs = await json<MeResponse>(await getMe(makeRequest("/api/me", { cookie: other }), undefined));
      expect(theirs.user?.appearance).toEqual({ preference: null, favorites: [] });
    });
  });

  describe("avatar", () => {
    it("uploads, serves only to its owner, replaces with a new version, and removes", async () => {
      const cookie = await signIn("settings-avatar");
      const upload = async (bytes: Uint8Array, crop = "x=20&y=0&size=80") =>
        postAvatarRoute(call(`/api/me/avatar?${crop}`, "POST", cookie, undefined, bytes), undefined);
      const first = await upload(new Uint8Array(await png("#ff0000")));
      expect(first.status).toBe(200);
      const { version } = await json<{ version: string }>(first);

      const mine = await getAvatarRoute(makeRequest(`/api/me/avatar?v=${version}`, { cookie }), undefined);
      expect(mine.status).toBe(200);
      expect(mine.headers.get("content-type")).toBe("image/webp");
      expect(mine.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
      const other = await signIn("settings-avatar-other");
      expect((await getAvatarRoute(makeRequest(`/api/me/avatar?v=${version}`, { cookie: other }), undefined)).status).toBe(404);

      const second = await upload(new Uint8Array(await png("#00ff00")));
      const replaced = await json<{ version: string }>(second);
      expect(replaced.version).not.toBe(version);
      const stale = await getAvatarRoute(makeRequest(`/api/me/avatar?v=${version}`, { cookie }), undefined);
      expect(stale.headers.get("cache-control")).toBe("private, no-cache");

      // A bad file or crop changes nothing.
      expect((await upload(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).status).toBe(400);
      expect((await upload(new Uint8Array(await png()), "x=100&y=0&size=80")).status).toBe(400);
      const me = await json<MeResponse>(await getMe(makeRequest("/api/me", { cookie }), undefined));
      expect(me.user?.avatarVersion).toBe(replaced.version);

      expect((await deleteAvatarRoute(call("/api/me/avatar", "DELETE", cookie), undefined)).status).toBe(200);
      expect((await getAvatarRoute(makeRequest("/api/me/avatar", { cookie }), undefined)).status).toBe(404);
    });
  });

  describe("email", () => {
    const request = (cookie: string, email: string) => emailRoute(call("/api/me/email", "POST", cookie, { email }), undefined);
    const verify = (cookie: string, token: string) => verifyRoute(call("/api/me/email/verify", "POST", cookie, { token }), undefined);

    it("gives one of two accounts confirming the same address at once a plain refusal, logging no address", async () => {
      setEmailSenderForTests(fakeSender);
      const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        for (let round = 0; round < 4; round++) {
          const address = `race-${round}@example.com`;
          const first = await signIn(`email-race-a${round}`);
          const second = await signIn(`email-race-b${round}`);
          outbox = [];
          await request(first, address);
          const firstToken = linkToken(outbox.at(-1));
          await request(second, address);
          const secondToken = linkToken(outbox.at(-1));
          const statuses = (await Promise.all([verify(first, firstToken), verify(second, secondToken)])).map((r) => r.status);
          expect(statuses.sort()).toEqual([200, 400]);
        }
        expect(JSON.stringify(errors.mock.calls)).not.toContain("example.com");
      } finally {
        errors.mockRestore();
      }
    });

    it("sets an address only after its link is opened, once, by the same user", async () => {
      setEmailSenderForTests(fakeSender);
      const cookie = await signIn("email-setup");
      const pending = await request(cookie, "Setup.User@Example.com");
      expect(pending.status).toBe(200);
      expect(await json<EmailStatus>(pending)).toMatchObject({ address: null, pending: { address: "Setup.User@Example.com", purpose: "setup", expired: false } });
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.to).toBe("Setup.User@Example.com");
      expect(outbox[0]?.text).toContain("http://localhost:3000/settings/email/verify?token=");
      const token = linkToken(outbox[0]);
      // The stored token is a hash, never the token itself.
      const stored = await getPool().query<{ token_hash: Buffer }>("select token_hash from email_verifications");
      expect(stored.rows.map((row) => row.token_hash.toString("base64url"))).not.toContain(token);

      // Another account can't use it.
      const other = await signIn("email-setup-other");
      expect((await verify(other, token)).status).toBe(400);
      const done = await verify(cookie, token);
      expect(done.status).toBe(200);
      expect(await json<EmailStatus>(done)).toMatchObject({ address: "Setup.User@Example.com", pending: null });
      // Used once only.
      expect((await verify(cookie, token)).status).toBe(400);
      // A malformed token never reaches the database.
      expect((await verify(cookie, "../../etc/passwd")).status).toBe(400);

      const me = await json<MeResponse>(await getMe(makeRequest("/api/me", { cookie }), undefined));
      expect(me.user?.needsEmail).toBe(false);
      expect(JSON.stringify(me)).not.toContain("Example.com");
    });

    it("keeps the old address until the new one is confirmed, then tells the old one", async () => {
      setEmailSenderForTests(fakeSender);
      const cookie = await signIn("email-change");
      await request(cookie, "old@example.com");
      await verify(cookie, linkToken(outbox.at(-1)));
      outbox = [];
      const pending = await json<EmailStatus>(await request(cookie, "new@example.com"));
      expect(pending).toMatchObject({ address: "old@example.com", pending: { address: "new@example.com", purpose: "change" } });
      // Resending replaces the link: the first one stops working.
      const firstToken = linkToken(outbox.at(-1));
      expect((await resendRoute(call("/api/me/email/resend", "POST", cookie), undefined)).status).toBe(200);
      const secondToken = linkToken(outbox.at(-1));
      expect((await verify(cookie, firstToken)).status).toBe(400);
      expect((await verify(cookie, secondToken)).status).toBe(200);
      const notice = outbox.find((message) => message.to === "old@example.com");
      expect(notice?.subject).toBe("Your codebases email was changed");
      expect(notice?.text).toContain("n***@example.com");
      expect(notice?.text).not.toContain("new@example.com");
    });

    it("canceling a change keeps the verified address", async () => {
      setEmailSenderForTests(fakeSender);
      const cookie = await signIn("email-cancel");
      await request(cookie, "keep@example.com");
      await verify(cookie, linkToken(outbox.at(-1)));
      await request(cookie, "drop@example.com");
      const token = linkToken(outbox.at(-1));
      const canceled = await json<EmailStatus>(await cancelEmailRoute(call("/api/me/email", "DELETE", cookie), undefined));
      expect(canceled).toMatchObject({ address: "keep@example.com", pending: null });
      expect((await verify(cookie, token)).status).toBe(400);
    });

    it("refuses an expired link and says to ask for a new one", async () => {
      setEmailSenderForTests(fakeSender);
      const cookie = await signIn("email-expired");
      await request(cookie, "late@example.com");
      await getPool().query("update email_verifications set expires_at = now() - interval '1 second' where email = 'late@example.com'");
      const response = await verify(cookie, linkToken(outbox.at(-1)));
      expect(response.status).toBe(410);
      expect(await json(response)).toMatchObject({ code: "expired" });
      const settings = await json<SettingsResponse>(await settingsRoute(makeRequest("/api/me/settings", { cookie }), undefined));
      expect(settings.email).toMatchObject({ address: null, pending: { expired: true } });
    });

    it("needs a recent GitHub sign-in to change a verified address", async () => {
      setEmailSenderForTests(fakeSender);
      const stale = await githubUser("email-stale-gh", 60);
      // Setting the first address doesn't need one.
      expect((await request(stale.cookie, "first@example.com")).status).toBe(200);
      await verify(stale.cookie, linkToken(outbox.at(-1)));
      const refused = await request(stale.cookie, "second@example.com");
      expect(refused.status).toBe(403);
      expect(await json(refused)).toMatchObject({ code: "reauth" });
      const fresh = await githubUser("email-fresh-gh", 0);
      await request(fresh.cookie, "fresh-first@example.com");
      await verify(fresh.cookie, linkToken(outbox.at(-1)));
      expect((await request(fresh.cookie, "fresh-second@example.com")).status).toBe(200);
    });

    it("doesn't reveal that an address belongs to another account", async () => {
      setEmailSenderForTests(fakeSender);
      const owner = await signIn("email-owner");
      await request(owner, "taken@example.com");
      await verify(owner, linkToken(outbox.at(-1)));
      outbox = [];
      const asker = await signIn("email-asker");
      const response = await request(asker, "TAKEN@example.com");
      // The same answer as for a free address...
      expect(response.status).toBe(200);
      expect(await json(response)).toMatchObject({ address: null, pending: { address: "TAKEN@example.com", purpose: "setup" } });
      // ...but the address gets a notice, not a link, so it can't be confirmed.
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.subject).toBe("This address is already used on codebases");
      expect(outbox[0]?.text).not.toContain("token=");
    });

    it("is honest when email can't be sent: nothing pending, nothing verified", async () => {
      setEmailSenderForTests(null);
      const cookie = await signIn("email-unavailable");
      const unavailable = await request(cookie, "nobody@example.com");
      expect(unavailable.status).toBe(503);
      expect(await json(unavailable)).toMatchObject({ code: "unavailable" });
      setEmailSenderForTests({ kind: "test", send: async () => Promise.reject(new Error("provider down")) });
      expect((await request(cookie, "nobody@example.com")).status).toBe(502);
      const settings = await json<SettingsResponse>(await settingsRoute(makeRequest("/api/me/settings", { cookie }), undefined));
      expect(settings.email).toMatchObject({ address: null, pending: null });
    });

    it("rate-limits requests", async () => {
      setEmailSenderForTests(fakeSender);
      const cookie = await signIn("email-limited");
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 7; attempt++) statuses.push((await request(cookie, `try${attempt}@example.com`)).status);
      expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(statuses.slice(5)).toEqual([429, 429]);
    });
  });

  it("deleting an account removes its profile, picture, preferences, email and pending verifications", async () => {
    setEmailSenderForTests(fakeSender);
    const cookie = await signIn("settings-leaving");
    const id = await idOf("settings-leaving");
    await detailsRoute(call("/api/me/details", "PUT", cookie, { displayName: "Leaving", pronouns: null, bio: null, birthday: "1999-09-09" }), undefined);
    await preferencesRoute(call("/api/me/preferences", "PUT", cookie, { preference: { mode: "system" } }), undefined);
    await postAvatarRoute(call("/api/me/avatar?x=0&y=0&size=80", "POST", cookie, undefined, new Uint8Array(await png())), undefined);
    await emailRoute(call("/api/me/email", "POST", cookie, { email: "leaving@example.com" }), undefined);
    await verifyRoute(call("/api/me/email/verify", "POST", cookie, { token: linkToken(outbox.at(-1)) }), undefined);
    await emailRoute(call("/api/me/email", "POST", cookie, { email: "pending@example.com" }), undefined);

    const count = async (table: string) =>
      Number((await getPool().query<{ n: string }>(`select count(*) as n from ${table} where user_id = $1`, [id])).rows[0]?.n);
    for (const table of ["user_profiles", "user_preferences", "user_avatars", "user_emails", "email_verifications"]) {
      expect(await count(table), table).toBeGreaterThan(0);
    }
    const response = await deleteMe(call("/api/me", "DELETE", cookie, { confirm: "DELETE" }), undefined);
    expect(response.status).toBe(200);
    for (const table of ["user_profiles", "user_preferences", "user_avatars", "user_emails", "email_verifications"]) {
      expect(await count(table), table).toBe(0);
    }
    const limits = await getPool().query<{ n: string }>("select count(*) as n from rate_limits where key like '%user:' || $1", [id]);
    expect(Number(limits.rows[0]?.n)).toBe(0);
  });
});
