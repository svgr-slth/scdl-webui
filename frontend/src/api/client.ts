// In Wails mode (wails:// protocol), WebKit2GTK only supports GET through the
// custom scheme handler. Bypass it by calling the Python backend directly.
export const BASE_URL = window.location.protocol === "wails:"
  ? "http://127.0.0.1:8000/api"
  : "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    const message =
      typeof error.detail === "string" ? error.detail : (error.detail?.message ?? res.statusText);
    const err = new Error(message) as Error & { detail: unknown };
    err.detail = error.detail;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path: string) => request(path, { method: "DELETE" }),
};
