import { API_BASE } from '../types';
import { getStoredToken, clearStoredToken } from '../auth/storage';

const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function parseErrorBody(text: string, status: number): string {
  try {
    const body = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (typeof body.message === 'string') return body.message;
  } catch {
    /* not JSON */
  }
  if (status === 401) return 'Session expired — please sign in again';
  return text || `HTTP ${status}`;
}

type FetchOpts = RequestInit & { skipAuth?: boolean };

export async function apiFetch<T>(path: string, init?: FetchOpts): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!init?.skipAuth) {
    const token = getStoredToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    else if (API_KEY) headers.set('X-API-Key', API_KEY);
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      `Cannot reach API at ${API_BASE}. Is the backend running? (node apps/api/dist/main.js or ./scripts/dev-backend.sh)`,
      0,
    );
  }
  if (res.status === 401 && !init?.skipAuth) {
    clearStoredToken();
    onUnauthorized?.();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(parseErrorBody(text, res.status), res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function hasApiCredentials(): boolean {
  return Boolean(getStoredToken() || API_KEY);
}
