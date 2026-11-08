import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AVATAR_MAX_BYTES, processAvatar } from "@/lib/server/avatar";

const solid = (width: number, height: number, color = "#3366cc") =>
  sharp({ create: { width, height, channels: 3, background: color } });

describe("avatar processing", () => {
  it("re-encodes JPEG, PNG and WebP as a 256×256 WebP", async () => {
    for (const input of [
      await solid(400, 300).jpeg().toBuffer(),
      await solid(300, 400).png().toBuffer(),
      await solid(500, 500).webp().toBuffer(),
    ]) {
      const result = await processAvatar(input, null);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const meta = await sharp(result.image).metadata();
      expect(meta).toMatchObject({ format: "webp", width: 256, height: 256 });
      expect(result.version).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it("strips EXIF, including location, and applies the orientation first", async () => {
    // A 200×100 image stored rotated: orientation 6 means it displays as 100×200.
    const input = await solid(200, 100)
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Make: "Camera", Model: "Model" }, IFD3: { GPSLatitudeRef: "N" } /* IFD3 is the GPS directory */ } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    // Displayed upright it's 100 wide and 200 tall, so a 100-pixel crop at y = 100 fits only
    // because the orientation was applied.
    const result = await processAvatar(input, { x: 0, y: 100, size: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.image).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("crops the chosen square", async () => {
    // Left half red, right half blue: cropping the right half gives a blue picture.
    const input = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#ff0000" } })
      .composite([{ input: await solid(100, 100, "#0000ff").png().toBuffer(), left: 100, top: 0 }])
      .png()
      .toBuffer();
    const result = await processAvatar(input, { x: 100, y: 0, size: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { data } = await sharp(result.image).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeLessThan(40); // red
    expect(data[2]).toBeGreaterThan(200); // blue
  });

  it("refuses SVG, GIF, HEIF/AVIF and other formats by their decoded contents, whatever they're called", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>');
    const gif = await solid(64, 64).gif().toBuffer();
    const tiff = await solid(64, 64).tiff().toBuffer();
    for (const [name, input] of [["svg", svg], ["gif", gif], ["tiff", tiff]] as const) {
      const result = await processAvatar(input, null);
      expect(result.ok, name).toBe(false);
    }
    const avif = await solid(64, 64).avif().toBuffer().catch(() => null);
    if (avif) expect((await processAvatar(avif, null)).ok).toBe(false);
  });

  it("refuses animated images", async () => {
    const frames = await Promise.all([solid(32, 32, "#ff0000").png().toBuffer(), solid(32, 32, "#0000ff").png().toBuffer()]);
    const animated = await sharp(frames, { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2);
    expect(await processAvatar(animated, null)).toEqual({ ok: false, error: "Animated pictures aren't supported. Use a still image." });
  });

  it("keeps the upload limit under Vercel's 4.5 MB request body limit", () => {
    // Vercel refuses a larger body before the route runs, with its own error instead of ours.
    expect(AVATAR_MAX_BYTES).toBeLessThan(4_500_000);
  });

  it("refuses empty, oversized, undecodable and too-large-dimension files, and crops that don't fit", async () => {
    expect((await processAvatar(Buffer.alloc(0), null)).ok).toBe(false);
    expect(await processAvatar(Buffer.alloc(AVATAR_MAX_BYTES + 1), null)).toEqual({ ok: false, error: "Pictures can be at most 4 MB." });
    expect((await processAvatar(Buffer.from("not an image at all"), null)).ok).toBe(false);
    const wide = await solid(8100, 10).png().toBuffer();
    expect(await processAvatar(wide, null)).toEqual({ ok: false, error: "Pictures can be at most 8000 pixels on a side." });
    const small = await solid(100, 100).png().toBuffer();
    for (const crop of [
      { x: 50, y: 50, size: 100 },
      { x: -1, y: 0, size: 50 },
      { x: 0, y: 0, size: 8 },
      { x: 0.5, y: 0, size: 50 },
    ]) {
      expect((await processAvatar(small, crop)).ok, JSON.stringify(crop)).toBe(false);
    }
  });
});
