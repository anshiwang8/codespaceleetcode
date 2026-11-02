import type {
  ApiError,
  MeResponse,
  OutlineResponse,
  SearchResponse,
  SolutionResponse,
  Submission,
  SubmitResponse,
  SymbolAtPositionResponse,
} from "@/lib/api-types";

/** A failed request. `status` is 0 when the server couldn't be reached at all. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
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
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(response.status, body?.error ?? `Request failed (${response.status})`);
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

export const api = {
  me: () => request<MeResponse>("/api/me"),
  devLogin: (login: string) => post<MeResponse>("/api/dev/login", { login }),
  devLogout: () => post<MeResponse>("/api/dev/logout"),
  submit: (slug: string, submission: Submission) =>
    post<SubmitResponse>(`${puzzlePath(slug)}/submit`, submission),
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
