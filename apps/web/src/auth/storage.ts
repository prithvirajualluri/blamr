const TOKEN_KEY = 'blamr_token';

/** In-memory token so requests work immediately after login before localStorage is re-read. */
let memoryToken: string | null = null;

export function getStoredToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  memoryToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private browsing — memory token still works for this session */
  }
}

export function clearStoredToken(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function hydrateTokenFromStorage(): void {
  if (memoryToken) return;
  try {
    memoryToken = localStorage.getItem(TOKEN_KEY);
  } catch {
    memoryToken = null;
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getStoredToken()) || Boolean(import.meta.env.VITE_API_KEY);
}
