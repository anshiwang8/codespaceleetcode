// Validation for the optional profile details and links. Pure, so the server (which enforces it)
// and the settings form (which explains it) share one definition.

export const LIMITS = { displayName: 60, pronouns: 40, bio: 280, linkUrl: 300, linkLabel: 40, customLinks: 3 } as const;

/**
 * The largest picture upload. Vercel refuses request bodies over 4.5 MB before the route runs, so
 * this stays under that, and the app's own message is what people see.
 */
export const AVATAR_MAX_MB = 4;
export const AVATAR_MAX_BYTES = AVATAR_MAX_MB * 1024 * 1024;
export const AVATAR_TOO_LARGE = `Pictures can be at most ${AVATAR_MAX_MB} MB.`;

export const LINK_PLATFORMS = ["linkedin", "github", "website", "x", "bluesky", "mastodon"] as const;
export type LinkPlatform = (typeof LINK_PLATFORMS)[number];

export const LINK_LABELS: Record<LinkPlatform, string> = {
  linkedin: "LinkedIn",
  github: "GitHub",
  website: "Website",
  x: "X",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
};

export const LINK_EXAMPLES: Record<LinkPlatform, string> = {
  linkedin: "https://www.linkedin.com/in/your-name",
  github: "https://github.com/your-name",
  website: "https://example.com",
  x: "https://x.com/your-name",
  bluesky: "https://bsky.app/profile/your-name.bsky.social",
  mastodon: "https://mastodon.social/@your-name",
};

export type ProfileLinks = Partial<Record<LinkPlatform, string>> & { custom: { label: string; url: string }[] };

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

// Control characters other than the line breaks a bio may contain.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/;

/** A trimmed one-line text field: empty means cleared (null). */
export function oneLine(value: unknown, max: number, label: string): FieldResult<string | null> {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${label} must be text.` };
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (/[\r\n]/.test(trimmed) || CONTROL.test(trimmed)) return { ok: false, error: `${label} can't contain line breaks or control characters.` };
  if ([...trimmed].length > max) return { ok: false, error: `${label} can be at most ${max} characters.` };
  return { ok: true, value: trimmed };
}

/** The bio may have line breaks; at most two in a row. */
export function bioField(value: unknown): FieldResult<string | null> {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "Bio must be text." };
  const trimmed = value.replace(/\r\n?/g, "\n").trim().replace(/\n{3,}/g, "\n\n");
  if (trimmed === "") return { ok: true, value: null };
  if (CONTROL.test(trimmed)) return { ok: false, error: "Bio can't contain control characters." };
  if ([...trimmed].length > LIMITS.bio) return { ok: false, error: `Bio can be at most ${LIMITS.bio} characters.` };
  return { ok: true, value: trimmed };
}

/**
 * A birthday: a real calendar date, YYYY-MM-DD, from 1900 on and not in the future anywhere
 * (today in UTC+14, the earliest zone, is the latest date allowed). Feb 29 is valid only in leap
 * years. No time zone is involved: the date is stored and shown as given.
 */
export function birthdayField(value: unknown, now: Date = new Date()): FieldResult<string | null> {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: "Enter a birthday as a full date." };
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { ok: false, error: "That date doesn't exist." };
  }
  if (value < "1900-01-01") return { ok: false, error: "Enter a date from 1900 on." };
  const latest = new Date(now.getTime() + 14 * 3_600_000).toISOString().slice(0, 10);
  if (value > latest) return { ok: false, error: "A birthday can't be in the future." };
  return { ok: true, value };
}

const HOSTS: Partial<Record<LinkPlatform, readonly string[]>> = {
  linkedin: ["linkedin.com"],
  github: ["github.com"],
  x: ["x.com", "twitter.com"],
  bluesky: ["bsky.app"],
};

/** The host is `domain` or a subdomain of it: never a substring check. */
function hostIs(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

const IP_LITERAL = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;

/**
 * An optional external link: HTTPS only, no credentials, a real domain name (not an IP address
 * or localhost), at most 300 characters. A known platform must be on that platform's own domain;
 * Mastodon, which is federated, can be any domain with a /@name path.
 */
export function linkField(value: unknown, platform: LinkPlatform | "custom"): FieldResult<string | null> {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "Enter a link as text." };
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > LIMITS.linkUrl) return { ok: false, error: `A link can be at most ${LIMITS.linkUrl} characters.` };
  if (/\s/.test(trimmed) || CONTROL.test(trimmed)) return { ok: false, error: "A link can't contain spaces." };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Enter a full link starting with https://." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Links must start with https://." };
  if (url.username || url.password) return { ok: false, error: "A link can't contain a username or password." };
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host === "localhost" || IP_LITERAL.test(host) || host.endsWith(".")) {
    return { ok: false, error: "Use a link to a website's domain name." };
  }
  if (url.port) return { ok: false, error: "A link can't name a port." };
  const label = platform === "custom" ? "This" : LINK_LABELS[platform];
  const domains = platform === "custom" ? undefined : HOSTS[platform];
  if (domains && !domains.some((domain) => hostIs(host, domain))) {
    return { ok: false, error: `${label} links must be on ${domains.join(" or ")}.` };
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (platform === "linkedin" && !/^\/(in|company|pub)\/[^/]+/.test(path)) {
    return { ok: false, error: "Use your LinkedIn profile link, like linkedin.com/in/your-name." };
  }
  if ((platform === "github" || platform === "x") && !/^\/[A-Za-z0-9_.-]+$/.test(path)) {
    return { ok: false, error: `Use your ${label} profile link, like ${LINK_EXAMPLES[platform].replace("https://", "")}.` };
  }
  if (platform === "bluesky" && !/^\/profile\/[A-Za-z0-9._:-]+$/.test(path)) {
    return { ok: false, error: "Use your Bluesky profile link, like bsky.app/profile/your-name.bsky.social." };
  }
  if (platform === "mastodon" && !/^\/@[A-Za-z0-9_]+(@[A-Za-z0-9.-]+)?$/.test(path)) {
    return { ok: false, error: "Use your Mastodon profile link, like mastodon.social/@your-name." };
  }
  return { ok: true, value: url.href };
}

/** A custom link's label, shown as plain text. */
export function linkLabelField(value: unknown): FieldResult<string | null> {
  return oneLine(value, LIMITS.linkLabel, "A link label");
}

/** The parts of a link worth showing: host and path, without the scheme. */
export function displayUrl(href: string): string {
  try {
    const url = new URL(href);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")}`;
  } catch {
    return href;
  }
}
