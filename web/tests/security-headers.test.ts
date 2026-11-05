import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders, snapshotCdnOrigin } from "@/lib/security-headers";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((part) => {
      const [name = "", ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

function headerMap(options: Parameters<typeof securityHeaders>[0]): Record<string, string> {
  return Object.fromEntries(securityHeaders(options).map(({ key, value }) => [key, value]));
}

describe("security headers", () => {
  it("sends CSP, HSTS, nosniff, Referrer-Policy and X-Frame-Options", () => {
    const headers = headerMap({ dev: false });
    expect(Object.keys(headers).sort()).toEqual([
      "Content-Security-Policy",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ]);
    expect(headers["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("locks the page down: no framing, plugins, base rewriting or forms to other hosts", () => {
    const csp = directives(contentSecurityPolicy({ dev: false }));
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.get("worker-src")).toEqual(["'self'"]);
  });

  it("allows eval only in development", () => {
    expect(directives(contentSecurityPolicy({ dev: false })).get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directives(contentSecurityPolicy({ dev: true })).get("script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
    ]);
  });

  it("upgrades insecure requests only in production, since localhost is plain HTTP", () => {
    expect(directives(contentSecurityPolicy({ dev: false })).has("upgrade-insecure-requests")).toBe(true);
    expect(directives(contentSecurityPolicy({ dev: true })).has("upgrade-insecure-requests")).toBe(false);
  });

  it("lets the browser fetch from the snapshot CDN's origin and nowhere else", () => {
    expect(directives(contentSecurityPolicy({ dev: false })).get("connect-src")).toEqual(["'self'"]);
    const withCdn = directives(
      contentSecurityPolicy({ dev: false, snapshotCdnUrl: "https://cdn.example.com/some/prefix/" }),
    );
    expect(withCdn.get("connect-src")).toEqual(["'self'", "https://cdn.example.com"]);
    // The CDN only serves data the page fetches; it can't serve scripts or styles.
    expect(withCdn.get("script-src")).not.toContain("https://cdn.example.com");
    expect(withCdn.get("style-src")).not.toContain("https://cdn.example.com");
  });

  it("reads the CDN origin, and refuses a CDN URL that isn't http or https", () => {
    expect(snapshotCdnOrigin(undefined)).toBeNull();
    expect(snapshotCdnOrigin("  ")).toBeNull();
    expect(snapshotCdnOrigin("https://pub-abc.r2.dev")).toBe("https://pub-abc.r2.dev");
    expect(snapshotCdnOrigin("http://127.0.0.1:9000/bucket")).toBe("http://127.0.0.1:9000");
    expect(() => snapshotCdnOrigin("cdn.example.com")).toThrow(/isn't a URL/);
    expect(() => snapshotCdnOrigin("javascript:alert(1)")).toThrow(/http or https/);
  });

  it("never has a stray semicolon or empty directive", () => {
    for (const dev of [true, false]) {
      const policy = contentSecurityPolicy({ dev, snapshotCdnUrl: "https://cdn.example.com" });
      for (const part of policy.split("; ")) expect(part.trim()).not.toBe("");
      expect(policy).not.toMatch(/;\s*$/);
    }
  });
});
