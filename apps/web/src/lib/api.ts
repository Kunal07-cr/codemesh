import type { ApiFailure, ApiSuccess } from "@codemesh/shared";

const runtimeOrigin = typeof window === "undefined" ? "http://localhost:4200" : window.location.origin;
export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:4200" : runtimeOrigin);
export const AUTH_EXPIRED_EVENT = "codemesh:auth-expired";

const AUTH_REFRESH_PATH = "/api/auth/refresh";
const AUTH_PATH_PREFIX = "/api/auth/";
let refreshInFlight: Promise<boolean> | null = null;

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await request(path, init);

  if (response.status === 401 && !path.startsWith(AUTH_PATH_PREFIX)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await request(path, init);
    } else {
      notifyAuthExpired();
      throw new ApiClientError(401, "SESSION_EXPIRED", "Your session expired. Sign in again, then retry the import.");
    }
  }

  const payload = (await response.json().catch(() => ({}))) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || "error" in payload) {
    const error = "error" in payload ? payload.error : { code: "HTTP_ERROR", message: response.statusText };
    throw new ApiClientError(response.status, error.code, error.message, error.details);
  }
  return payload.data;
}

export async function streamApi(
  path: string,
  init: RequestInit,
  onEvent: (event: string, data: unknown) => void
) {
  let response = await request(path, init);

  if (response.status === 401 && !path.startsWith(AUTH_PATH_PREFIX)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await request(path, init);
    } else {
      notifyAuthExpired();
      throw new ApiClientError(401, "SESSION_EXPIRED", "Your session expired. Sign in again, then retry.");
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as Partial<ApiFailure>;
    const error = payload.error ?? { code: "HTTP_ERROR", message: response.statusText };
    throw new ApiClientError(response.status, error.code, error.message, error.details);
  }

  if (!response.body) throw new ApiClientError(0, "STREAM_UNAVAILABLE", "The assistant stream was not available.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const deliverFrames = () => {
    while (true) {
      const delimiter = buffer.match(/\r?\n\r?\n/);
      if (!delimiter || delimiter.index === undefined) return;
      const frame = buffer.slice(0, delimiter.index);
      buffer = buffer.slice(delimiter.index + delimiter[0].length);
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length === 0) continue;
      const raw = data.join("\n");
      try {
        onEvent(event, JSON.parse(raw));
      } catch {
        onEvent(event, raw);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    deliverFrames();
    if (done) break;
  }
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value);
}

export function getCookie(name: string) {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

async function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = request(AUTH_REFRESH_PATH, { method: "POST" })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function request(path: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (!headers.has("content-type") && init.body && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = getCookie("cm_csrf");
    if (csrf) headers.set("x-csrf-token", csrf);
  }

  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      method,
      headers,
      credentials: "include"
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network request failed.";
    throw new ApiClientError(
      0,
      "API_UNAVAILABLE",
      `CodeMesh API is not reachable at ${API_URL}. Deploy the API and set VITE_API_URL for public sign-in. (${detail})`
    );
  }
}

function notifyAuthExpired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}
