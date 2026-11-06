import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { ApiError } from "@/lib/api-types";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_INT4 = 2_147_483_647;

export function jsonResponse<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(status: number, error: string): NextResponse<ApiError> {
  return jsonResponse<ApiError>({ error }, status);
}

/** Unexpected errors are logged here and never reach the client. */
export function route<C = unknown>(
  name: string,
  handler: (request: NextRequest, context: C) => Promise<Response>,
): (request: NextRequest, context: C) => Promise<Response> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      console.error(`[api] ${name} failed:`, error);
      return errorResponse(500, "Something went wrong");
    }
  };
}

/**
 * The body's bytes, or undefined once it passes `max` bytes. A chunked body has no Content-Length,
 * so this counts bytes as they arrive rather than reading the whole body first.
 */
export async function readBytes(request: Request, max: number): Promise<Uint8Array | undefined> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return undefined;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** The body as text, or undefined once it passes `max` bytes. */
async function readCapped(request: Request, max: number): Promise<string | undefined> {
  const bytes = await readBytes(request, max);
  return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
}

/** Returns undefined for a body that's too large or isn't JSON. */
export async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return undefined;
  const text = await readCapped(request, MAX_BODY_BYTES);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

// Postgres rejects NUL in text, which would otherwise surface as a 500.
export const textValue = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !value.includes("\0"));

/** A positive integer query parameter that fits an int4 column. */
export const positiveIntParam = z
  .string()
  .regex(/^[1-9][0-9]{0,9}$/)
  .transform(Number)
  .refine((value) => value <= MAX_INT4);

export function queryParams(request: NextRequest): Record<string, string> {
  return Object.fromEntries(request.nextUrl.searchParams);
}

export function parseSlug(slug: string): string | null {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(slug) ? slug : null;
}

export function parseSnapshotId(id: string): number | null {
  if (!/^[1-9][0-9]{0,15}$/.test(id)) return null;
  const value = Number(id);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Whether a state-changing request came from this site. Browsers always send Origin on a fetch
 * that isn't a simple GET, and a page on another site can't make it match this site's Host. Behind
 * a proxy that rewrites Host, BETTER_AUTH_URL names the site's real origin.
 */
export function isSameOriginRequest(headers: Pick<Headers, "get">): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (configured) {
    try {
      if (new URL(configured).origin === originUrl.origin) return true;
    } catch {
      // A malformed BETTER_AUTH_URL trusts nothing extra.
    }
  }
  const host = headers.get("host");
  return host !== null && originUrl.host.toLowerCase() === host.toLowerCase();
}
