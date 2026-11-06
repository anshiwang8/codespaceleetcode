import { describe, expect, it } from "vitest";
import { bioField, birthdayField, displayUrl, linkField, linkLabelField, oneLine } from "@/lib/profile-fields";

const ok = (result: { ok: boolean; value?: unknown }) => (result.ok ? result.value : undefined);
const fails = (result: { ok: boolean }) => !result.ok;

describe("links", () => {
  it("accepts each platform's own profile links, normalized", () => {
    expect(ok(linkField("https://www.linkedin.com/in/ada-lovelace", "linkedin"))).toBe("https://www.linkedin.com/in/ada-lovelace");
    expect(ok(linkField("https://linkedin.com/company/codebases/", "linkedin"))).toBe("https://linkedin.com/company/codebases/");
    expect(ok(linkField("https://github.com/octocat", "github"))).toBe("https://github.com/octocat");
    expect(ok(linkField("https://x.com/someone", "x"))).toBe("https://x.com/someone");
    expect(ok(linkField("https://twitter.com/someone", "x"))).toBe("https://twitter.com/someone");
    expect(ok(linkField("https://bsky.app/profile/someone.bsky.social", "bluesky"))).toBe("https://bsky.app/profile/someone.bsky.social");
    expect(ok(linkField("  https://example.com/portfolio  ", "website"))).toBe("https://example.com/portfolio");
    expect(ok(linkField("https://blog.example.co.uk", "custom"))).toBe("https://blog.example.co.uk/");
  });

  it("accepts Mastodon on any server, since it's federated", () => {
    expect(ok(linkField("https://mastodon.social/@someone", "mastodon"))).toBe("https://mastodon.social/@someone");
    expect(ok(linkField("https://hachyderm.io/@some_one", "mastodon"))).toBe("https://hachyderm.io/@some_one");
    expect(fails(linkField("https://hachyderm.io/users/someone", "mastodon"))).toBe(true);
  });

  it("treats empty as cleared", () => {
    expect(linkField("", "website")).toEqual({ ok: true, value: null });
    expect(linkField("   ", "github")).toEqual({ ok: true, value: null });
    expect(linkField(null, "github")).toEqual({ ok: true, value: null });
  });

  it("refuses scripts, data, plain HTTP, credentials, ports, IPs, localhost and malformed links", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://example.com",
      "ftp://example.com",
      "https://user:pass@example.com",
      "https://user@example.com",
      "https://example.com:8443/",
      "https://127.0.0.1/",
      "https://[::1]/",
      "https://localhost/",
      "https://intranet/",
      "https://exa mple.com",
      "https://example.com/a b",
      "example.com",
      "//example.com",
      `https://example.com/${"a".repeat(300)}`,
      "https://example.com/‮",
    ]) {
      expect(fails(linkField(bad, "website")), bad).toBe(true);
    }
  });

  it("checks platform hosts exactly, never by substring", () => {
    for (const [bad, platform] of [
      ["https://github.com.evil.example/octocat", "github"],
      ["https://evilgithub.com/octocat", "github"],
      ["https://notlinkedin.com/in/someone", "linkedin"],
      ["https://linkedin.com.example/in/someone", "linkedin"],
      ["https://x.com.example/someone", "x"],
      ["https://example.com/bsky.app/profile/a", "bluesky"],
      ["https://gist.github.com/octocat/abc", "github"],
    ] as const) {
      expect(fails(linkField(bad, platform)), bad).toBe(true);
    }
    // A subdomain of the platform itself is fine.
    expect(ok(linkField("https://uk.linkedin.com/in/someone", "linkedin"))).toBe("https://uk.linkedin.com/in/someone");
  });

  it("wants a profile, not a platform's home page", () => {
    expect(fails(linkField("https://github.com/", "github"))).toBe(true);
    expect(fails(linkField("https://www.linkedin.com/", "linkedin"))).toBe(true);
    expect(fails(linkField("https://bsky.app/", "bluesky"))).toBe(true);
  });

  it("keeps labels to one plain line", () => {
    expect(ok(linkLabelField("  My talks  "))).toBe("My talks");
    expect(fails(linkLabelField("Line\nbreak"))).toBe(true);
    expect(fails(linkLabelField("x".repeat(41)))).toBe(true);
    expect(ok(linkLabelField("<b>bold</b>"))).toBe("<b>bold</b>"); // stored as text, rendered as text
  });

  it("shows a link without its scheme", () => {
    expect(displayUrl("https://www.example.com/me/")).toBe("example.com/me");
    expect(displayUrl("https://github.com/octocat")).toBe("github.com/octocat");
  });
});

describe("birthday", () => {
  const now = new Date("2026-11-06T12:00:00Z");

  it("accepts a real past date, and clears on empty", () => {
    expect(ok(birthdayField("1990-05-17", now))).toBe("1990-05-17");
    expect(birthdayField("", now)).toEqual({ ok: true, value: null });
    expect(birthdayField(null, now)).toEqual({ ok: true, value: null });
  });

  it("accepts Feb 29 only in a leap year", () => {
    expect(ok(birthdayField("2000-02-29", now))).toBe("2000-02-29");
    expect(ok(birthdayField("2024-02-29", now))).toBe("2024-02-29");
    expect(fails(birthdayField("1900-02-29", now))).toBe(true); // 1900 wasn't a leap year
    expect(fails(birthdayField("2023-02-29", now))).toBe(true);
  });

  it("refuses impossible, malformed, too-early and future dates", () => {
    for (const bad of ["2026-13-01", "2026-04-31", "1990-5-17", "17/05/1990", "1899-12-31", "2026-11-08", "2030-01-01", "not a date"]) {
      expect(fails(birthdayField(bad, now)), bad).toBe(true);
    }
  });

  it("allows today anywhere on Earth: up to today's date in UTC+14", () => {
    // At 12:00 UTC it's already Nov 7 in UTC+14, so Nov 7 is allowed and Nov 8 isn't.
    expect(ok(birthdayField("2026-11-07", now))).toBe("2026-11-07");
    expect(fails(birthdayField("2026-11-08", now))).toBe(true);
  });
});

describe("text fields", () => {
  it("trims, clears on empty, and enforces limits counting characters, not bytes", () => {
    expect(ok(oneLine("  Ada  ", 60, "Display name"))).toBe("Ada");
    expect(oneLine("   ", 60, "Display name")).toEqual({ ok: true, value: null });
    expect(ok(oneLine("é".repeat(60), 60, "Display name"))).toBe("é".repeat(60));
    expect(fails(oneLine("é".repeat(61), 60, "Display name"))).toBe(true);
  });

  it("refuses line breaks and control or direction-override characters in one-line fields", () => {
    expect(fails(oneLine("Ada\nLovelace", 60, "Display name"))).toBe(true);
    expect(fails(oneLine("Ada\u0007", 60, "Display name"))).toBe(true);
    expect(fails(oneLine("Ada‮ecalevol", 60, "Display name"))).toBe(true);
  });

  it("lets a bio have line breaks, collapsing long runs of them", () => {
    expect(ok(bioField("Line one\r\n\r\n\r\n\r\nLine two"))).toBe("Line one\n\nLine two");
    expect(fails(bioField("x".repeat(281)))).toBe(true);
    expect(bioField("")).toEqual({ ok: true, value: null });
  });
});
