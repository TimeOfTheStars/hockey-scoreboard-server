import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@tauri-apps/api/core";
import { coerceGameState, type GameState } from "./gameState";

let cachedBase: string | null = null;

/** База HTTP API (Tauri → 127.0.0.1:порт; браузер с Axum → window.location.origin). */
export async function resolveApiBase(): Promise<string> {
  if (cachedBase) return cachedBase;
  if (isTauri()) {
    cachedBase = await invoke<string>("get_http_base_url");
  } else {
    cachedBase =
      typeof window !== "undefined" ? window.location.origin : "";
  }
  return cachedBase;
}

export function externalApiUrlFromBase(base: string): string {
  return `${base.replace(/\/$/, "")}/api/vmix`;
}

export async function fetchGameState(): Promise<GameState> {
  const base = await resolveApiBase();
  const r = await fetch(`${base}/api/editor/state`);
  if (!r.ok) throw new Error(await r.text());
  return coerceGameState(await r.json());
}

export async function patchGameState(
  patch: Partial<GameState> | Record<string, unknown>,
): Promise<GameState> {
  const base = await resolveApiBase();
  const r = await fetch(`${base}/api/editor/state`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(await r.text());
  return coerceGameState(await r.json());
}

export async function postResetGameState(): Promise<GameState> {
  const base = await resolveApiBase();
  const r = await fetch(`${base}/api/editor/reset`, { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  return coerceGameState(await r.json());
}
