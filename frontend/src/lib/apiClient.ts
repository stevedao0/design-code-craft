const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    method: options.method || "GET",
    headers,
    body: options.body == null ? undefined : JSON.stringify(options.body),
    signal: options.signal ?? undefined,
  });

  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      if (text && contentType.includes("application/json")) {
        const data = JSON.parse(text);
        if (typeof data?.detail === "string") message = data.detail;
        else if (typeof data?.error === "string") message = data.error;
        else if (typeof data?.message === "string") message = data.message;
        else message = JSON.stringify(data);
      } else if (text) {
        message = text;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  if (res.status === 204 || !text) {
    return null as T;
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(text) as T;
  }

  return text as unknown as T;
}

export const apiBaseUrl = API_BASE_URL;
