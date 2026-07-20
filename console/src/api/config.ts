declare const VITE_API_BASE_URL: string;
declare const TOKEN: string;

const AUTH_TOKEN_KEY = "qwenpaw_auth_token";
const AUTH_TOKEN_SESSION_KEY = "qwenpaw_auth_token_session";
/** Legacy AIWork keys — still read for QW2 upgrade compat */
const AUTH_TOKEN_KEY_LEGACY = "aiwork_auth_token";
const AUTH_TOKEN_SESSION_KEY_LEGACY = "aiwork_auth_token_session";
export const AUTH_USER_KEY = "qwenpaw.auth.user_key";
export const AUTH_USER_KEY_LEGACY = "aiwork.auth.user_key";

/**
 * Get the full API URL with /api prefix
 * @param path - API path (e.g., "/models", "/skills")
 * @returns Full API URL (e.g., "http://localhost:8088/api/models" or "/api/models")
 */
export function getApiUrl(path: string): string {
  const base = VITE_API_BASE_URL || "";
  const apiPrefix = "/api";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${apiPrefix}${normalizedPath}`;
}

/**
 * Get the API token - checks sessionStorage (non-remembered login) first,
 * then localStorage (remember-me), then build-time TOKEN constant.
 * @returns API token string or empty string
 */
export function getApiToken(): string {
  const sessionToken =
    sessionStorage.getItem(AUTH_TOKEN_SESSION_KEY) ||
    sessionStorage.getItem(AUTH_TOKEN_SESSION_KEY_LEGACY);
  if (sessionToken) return sessionToken;

  const stored =
    localStorage.getItem(AUTH_TOKEN_KEY) ||
    localStorage.getItem(AUTH_TOKEN_KEY_LEGACY);
  if (stored) return stored;
  return typeof TOKEN !== "undefined" ? TOKEN : "";
}

/**
 * Store the auth token after login.
 * @param remember - when true, persist across browser restarts (localStorage);
 *                   when false, session-only (sessionStorage).
 */
export function setAuthToken(token: string, remember = true): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY_LEGACY);
  sessionStorage.removeItem(AUTH_TOKEN_SESSION_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_SESSION_KEY_LEGACY);

  if (remember) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_TOKEN_KEY_LEGACY, token);
  } else {
    sessionStorage.setItem(AUTH_TOKEN_SESSION_KEY, token);
    sessionStorage.setItem(AUTH_TOKEN_SESSION_KEY_LEGACY, token);
  }
}

/**
 * Remove the auth token from all storages (logout / 401).
 */
export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY_LEGACY);
  sessionStorage.removeItem(AUTH_TOKEN_SESSION_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_SESSION_KEY_LEGACY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_USER_KEY_LEGACY);
  if (typeof window !== "undefined") {
    window.currentUserId = undefined;
  }
}
