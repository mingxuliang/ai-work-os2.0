/**
 * Storage key compat for AIWork Console on QwenPaw 2.0 kernel.
 * Reads AIWork keys first, then QwenPaw / CoPaw legacy keys.
 */

const PREFIX_CANDIDATES = ["aiwork", "qwenpaw", "copaw", "AIWork", "QwenPaw"];

export function readCompatItem(suffix: string): string | null {
  if (typeof localStorage === "undefined") return null;
  for (const prefix of PREFIX_CANDIDATES) {
    const key = `${prefix}:${suffix}`;
    const v = localStorage.getItem(key);
    if (v != null && v !== "") return v;
  }
  // Also try bare suffix and historical keys
  const bare = localStorage.getItem(suffix);
  if (bare != null && bare !== "") return bare;
  return null;
}

export function writeCompatItem(suffix: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  // Prefer AIWork brand key; mirror to qwenpaw for kernel tools
  localStorage.setItem(`aiwork:${suffix}`, value);
  localStorage.setItem(`qwenpaw:${suffix}`, value);
}

export function removeCompatItem(suffix: string): void {
  if (typeof localStorage === "undefined") return;
  for (const prefix of PREFIX_CANDIDATES) {
    localStorage.removeItem(`${prefix}:${suffix}`);
  }
  localStorage.removeItem(suffix);
}

/** Auth token shared between JWT login and API client. */
export const AUTH_TOKEN_SUFFIX = "authToken";
export const LAST_AGENT_SUFFIX = "lastUsedAgent";
