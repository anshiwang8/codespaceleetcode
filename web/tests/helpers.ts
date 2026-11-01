import { NextRequest } from "next/server";
import { expect, inject } from "vitest";
import { POST as devLoginRoute } from "@/app/api/dev/login/route";

export const hasDatabase = inject("testDatabaseUrl") !== null;

export const LOCAL_HOST = "localhost:3000";

interface RequestOptions {
  method?: string;
  body?: unknown;
  rawBody?: string;
  cookie?: string;
  host?: string;
  headers?: Record<string, string>;
}

export function makeRequest(path: string, options: RequestOptions = {}): NextRequest {
  const headers = new Headers(options.headers);
  headers.set("host", options.host ?? LOCAL_HOST);
  if (options.cookie) headers.set("cookie", options.cookie);
  const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  return new NextRequest(`http://localhost:3000${path}`, {
    method: options.method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body,
  });
}

export function params<P>(value: P): { params: Promise<P> } {
  return { params: Promise.resolve(value) };
}

/** Signs in through the real route and returns the cookie to send on later requests. */
export async function signIn(login: string): Promise<string> {
  const response = await devLoginRoute(makeRequest("/api/dev/login", { body: { login } }), undefined);
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error("Dev login set no cookie");
  return cookie.split(";")[0] ?? "";
}

/** Every string that exists only in answer keys and solutions, or names a key's fields. */
const FORBIDDEN_IN_RESPONSES = [
  "KEYTOKEN",
  "SOLUTIONTOKEN",
  "answer_json",
  "answerJson",
  "accept",
  "anchor",
  "window",
  "\"correct\"",
  "\"option\"",
];

export function expectNoAnswerData(text: string): void {
  for (const forbidden of FORBIDDEN_IN_RESPONSES) expect(text).not.toContain(forbidden);
}
