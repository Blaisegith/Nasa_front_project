/**
 * Client HTTP unique du frontend.
 *
 * Règles :
 *  - le frontend ne connaît que des contrats HTTP (aucun accès direct à
 *    ChromaDB, Supabase ou Groq) ;
 *  - `credentials: 'include'` : le cookie de session HttpOnly circule ;
 *  - aucune clé secrète n'est présente côté client ;
 *  - les erreurs sont normalisées en `ApiError` avec un code stable.
 */

const DEFAULT_TIMEOUT_MS = 20000;
const LONG_TIMEOUT_MS = 120000;

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network_error', detail = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function baseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return String(configured).replace(/\/$/, '');
  // Repli : même origine que le frontend (proxy Vite en développement).
  return '';
}

export const API_BASE_URL = baseUrl();

/** Rend une URL renvoyée par le backend utilisable par `<img>` / `<video>`. */
export function resolveUrl(path) {
  if (!path) return null;
  if (/^(https?:)?\/\//.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}

export const UNAUTHORIZED_EVENT = 'techlabs:unauthorized';

async function parseBody(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }
  const text = await response.text().catch(() => '');
  return text ? { message: text } : null;
}

async function request(path, { method = 'GET', body, headers = {}, timeout = DEFAULT_TIMEOUT_MS, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    });

    if (response.status === 204) return null;

    const payload = await parseBody(response);

    if (!response.ok) {
      const error = payload?.error ?? {};
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
      throw new ApiError(
        error.message ?? 'La requête a échoué.',
        { status: response.status, code: error.code ?? 'http_error', detail: error.detail ?? null },
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') {
      throw new ApiError('Le serveur ne répond pas.', { code: 'timeout' });
    }
    throw new ApiError(
      'Connexion au serveur impossible. Vérifiez que le backend est démarré.',
      { code: 'network_error' },
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  del: (path, options) => request(path, { ...options, method: 'DELETE' }),
  upload: (path, formData, options) => request(path, { ...options, method: 'POST', body: formData }),
};