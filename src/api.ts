import { coerceGameState, type GameState } from "./gameState";

const AUTH_EVENT = "hockey-auth-changed";

export function notifyAuthChanged() {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function onAuthChanged(fn: () => void) {
  window.addEventListener(AUTH_EVENT, fn);
  return () => window.removeEventListener(AUTH_EVENT, fn);
}

let cachedBase: string | null = null;

export function resetApiBaseCache() {
  cachedBase = null;
}

export async function resolveApiBase(): Promise<string> {
  if (cachedBase) return cachedBase;
  cachedBase =
    typeof window !== "undefined" ? window.location.origin : "";
  return cachedBase;
}

export function sessionVmixUrl(base: string, sessionId: string): string {
  return `${base.replace(/\/$/, "")}/api/sessions/${sessionId}/vmix`;
}

export function sessionStateUrl(base: string, sessionId: string): string {
  return `${base.replace(/\/$/, "")}/api/sessions/${sessionId}/state`;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = await resolveApiBase();
  return fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
  });
}

export type SessionRow = { id: string; name: string; created_at: number };

export type Me = { id: number; username: string; role: string };

export type UserRow = {
  id: number;
  username: string;
  role: string;
  session_ids: string[];
};

/** Текущий пользователь; 401 — не авторизован. */
export async function fetchMe(): Promise<Me> {
  const r = await apiFetch("/api/me");
  if (r.status === 401) throw new Error("401");
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as Me;
}

export async function listUsers(): Promise<UserRow[]> {
  const r = await apiFetch("/api/users");
  if (r.status === 401) throw new Error("401");
  if (r.status === 403) throw new Error("403");
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as UserRow[];
}

export async function createUser(
  username: string,
  password: string,
  role: "admin" | "operator",
): Promise<UserRow> {
  const r = await apiFetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, role }),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as UserRow;
}

export async function deleteUser(userId: number): Promise<void> {
  const r = await apiFetch(`/api/users/${userId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
}

export async function putUserSessions(
  userId: number,
  sessionIds: string[],
): Promise<UserRow> {
  const r = await apiFetch(`/api/users/${userId}/sessions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_ids: sessionIds }),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as UserRow;
}

export async function loginRequest(
  username: string,
  password: string,
): Promise<void> {
  const r = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error(await r.text());
  notifyAuthChanged();
}

export async function logoutRequest(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
  notifyAuthChanged();
}

export async function fetchSessions(): Promise<SessionRow[]> {
  const r = await apiFetch("/api/sessions");
  if (r.status === 401) throw new Error("401");
  if (r.status === 403) throw new Error("403");
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as SessionRow[];
}

export async function createSession(
  name?: string,
  fieldCount: 1 | 2 = 2,
): Promise<SessionRow> {
  const r = await apiFetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name ?? "", field_count: fieldCount }),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as SessionRow;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const r = await apiFetch(`/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function fetchGameState(sessionId: string): Promise<GameState> {
  const r = await apiFetch(`/api/sessions/${sessionId}/state`);
  if (r.status === 401) throw new Error("401");
  if (r.status === 403) throw new Error("403");
  if (!r.ok) throw new Error(await r.text());
  return coerceGameState(await r.json());
}

export async function patchGameState(
  sessionId: string,
  patch: Partial<GameState> | Record<string, unknown>,
): Promise<GameState> {
  const r = await apiFetch(`/api/sessions/${sessionId}/state`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(await r.text());
  return coerceGameState(await r.json());
}

export async function postResetGameState(
  sessionId: string,
): Promise<GameState> {
  const r = await apiFetch(`/api/sessions/${sessionId}/reset`, {
    method: "POST",
  });
  if (!r.ok) throw new Error(await r.text());
  return coerceGameState(await r.json());
}
