// The security headers every response carries. next.config.ts sends them; they're built here so
// they can be unit-tested. This file runs when the config loads, so it imports nothing from the app.

export interface SecurityHeaderOptions {
  /** `next dev` needs eval for React's debugging and stack traces. A production build doesn't. */
  dev: boolean;
  /** NEXT_PUBLIC_SNAPSHOT_CDN_URL. The browser fetches manifests and files from it directly. */
  snapshotCdnUrl?: string;
}

export interface Header {
  key: string;
  value: string;
}

/** The origin of the snapshot CDN, or null when snapshots come from this server's /snapshots route. */
export function snapshotCdnOrigin(snapshotCdnUrl: string | undefined): string | null {
  const raw = (snapshotCdnUrl ?? "").trim();
  if (raw === "") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`NEXT_PUBLIC_SNAPSHOT_CDN_URL isn't a URL: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`NEXT_PUBLIC_SNAPSHOT_CDN_URL must be http or https: ${raw}`);
  }
  return url.origin;
}

/**
 * The Content Security Policy.
 *
 * Scripts allow 'unsafe-inline' because Next.js streams each page's data in inline scripts, and a
 * header set in next.config can't carry a per-request nonce. A nonce would make every page dynamic,
 * including the static landing page. Everything else is locked to this origin: no other host can
 * serve scripts, no plugins, no <base> rewriting, no forms to other hosts, and no framing.
 *
 * Styles allow 'unsafe-inline' because Monaco injects <style> elements, mermaid puts a <style> in
 * each SVG, and React writes style attributes. Monaco's worker is a bundled file on this origin.
 */
export function contentSecurityPolicy({ dev, snapshotCdnUrl }: SecurityHeaderOptions): string {
  const cdn = snapshotCdnOrigin(snapshotCdnUrl);
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    ["script-src", "'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:"],
    ["font-src", "'self'", "data:"],
    ["connect-src", "'self'", ...(cdn ? [cdn] : [])],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  // Over plain HTTP, as on localhost, this would point every request at an https:// URL that
  // isn't there.
  if (!dev) directives.push(["upgrade-insecure-requests"]);
  return directives.map((parts) => parts.join(" ")).join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions): Header[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    // Two years. Browsers ignore it over plain HTTP, so it's harmless on localhost. Not preloaded:
    // getting onto the preload list is hard to undo, so that's a separate decision.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // frame-ancestors above does this for current browsers; this is for older ones.
    { key: "X-Frame-Options", value: "DENY" },
  ];
}
