import type {
  EmailStatus,
  ProfileDetails,
  ProfileLinks,
  SettingsResponse,
  ActivityPeriodKey,
  ActivityResponse,
  ApiError,
  HistoryFilters,
  HistoryPage,
  MeResponse,
  OutlineResponse,
  SearchResponse,
  SolutionResponse,
  Submission,
  SubmitResponse,
  SymbolAtPositionResponse,
} from "@/lib/api-types";
import type { CheckResponse, HintResponse, LearnAnswer, RevealResponse, RubricResponse } from "@/lib/learn/types";

/** A failed request. `status` is 0 when the server couldn't be reached at all. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Per-field messages from a validation failure, keyed by field name. */
    readonly fields: Record<string, string> = {},
    /** A machine-readable reason, such as "reauth" or "expired". */
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiRequestError(0, "Couldn't reach the server. Check that it's running and try again.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | (ApiError & { fields?: Record<string, string>; code?: string })
      | null;
    throw new ApiRequestError(
      response.status,
      body?.error ?? `Request failed (${response.status})`,
      body?.fields && typeof body.fields === "object" ? body.fields : {},
      typeof body?.code === "string" ? body.code : null,
    );
  }
  return (await response.json()) as T;
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const puzzlePath = (slug: string) => `/api/puzzles/${encodeURIComponent(slug)}`;

function send<T>(url: string, method: "PUT" | "POST" | "DELETE", body?: unknown): Promise<T> {
  return request<T>(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const learnPath = (slug: string, action: string) => `/api/learn/${encodeURIComponent(slug)}/${action}`;

export const api = {
  learnCheck: (slug: string, revision: number, exerciseId: string, answer: LearnAnswer) =>
    post<CheckResponse>(learnPath(slug, "check"), { revision, exerciseId, answer }),
  learnHint: (slug: string, revision: number, exerciseId: string, level: number) =>
    post<HintResponse>(learnPath(slug, "hint"), { revision, exerciseId, level }),
  learnReveal: (slug: string, revision: number, exerciseId: string) =>
    post<RevealResponse>(learnPath(slug, "reveal"), { revision, exerciseId }),
  learnRubric: (slug: string, revision: number) => post<RubricResponse>(learnPath(slug, "rubric"), { revision }),
  settings: () => request<SettingsResponse>("/api/me/settings"),
  saveDetails: (details: ProfileDetails) => send<ProfileDetails>("/api/me/details", "PUT", details),
  saveLinks: (links: Record<string, unknown>) => send<ProfileLinks>("/api/me/links", "PUT", links),
  uploadAvatar: (file: Blob, crop: { x: number; y: number; size: number }) =>
    request<{ version: string }>(
      `/api/me/avatar?${new URLSearchParams({ x: String(crop.x), y: String(crop.y), size: String(crop.size) })}`,
      { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file },
    ),
  deleteAvatar: () => send<{ version: null }>("/api/me/avatar", "DELETE"),
  requestEmail: (email: string) => send<EmailStatus>("/api/me/email", "POST", { email }),
  resendEmail: () => send<EmailStatus>("/api/me/email/resend", "POST"),
  cancelEmail: () => send<EmailStatus>("/api/me/email", "DELETE"),
  verifyEmail: (token: string) => send<EmailStatus>("/api/me/email/verify", "POST", { token }),
  me: () => request<MeResponse>("/api/me"),
  /** A page of history. Filters apply to the whole history; `before` continues the same list. */
  history: (query: HistoryFilters & { before?: string }, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, String(value));
    const search = params.toString();
    return request<HistoryPage>(`/api/me/history${search ? `?${search}` : ""}`, { signal });
  },
  activity: (period: ActivityPeriodKey, signal?: AbortSignal) =>
    request<ActivityResponse>(`/api/me/activity?${new URLSearchParams({ period })}`, { signal }),
  devLogin: (login: string) => post<MeResponse>("/api/dev/login", { login }),
  devLogout: () => post<MeResponse>("/api/dev/logout"),
  submit: (slug: string, submission: Submission, signal?: AbortSignal) =>
    request<SubmitResponse>(`${puzzlePath(slug)}/submit`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submission), signal,
    }),
  solution: (slug: string) => request<SolutionResponse>(`${puzzlePath(slug)}/solution`),
  symbolAt: (snapshotId: number, file: string, line: number, col: number) => {
    const query = new URLSearchParams({ file, line: String(line), col: String(col) });
    return request<SymbolAtPositionResponse>(`/api/snapshots/${snapshotId}/symbols?${query}`);
  },
  outline: (snapshotId: number, file: string) => {
    const query = new URLSearchParams({ file });
    return request<OutlineResponse>(`/api/snapshots/${snapshotId}/symbols/outline?${query}`);
  },
  search: (snapshotId: number, q: string) => {
    const query = new URLSearchParams({ q });
    return request<SearchResponse>(`/api/snapshots/${snapshotId}/search?${query}`);
  },
};
