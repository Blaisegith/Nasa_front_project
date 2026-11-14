/**
 * Accès `localStorage` tolérant aux pannes.
 *
 * Un `JSON.parse` non protégé sur `nasa-profile` faisait planter l'application
 * au démarrage (bug B1 de l'audit). Tout passe désormais par ces helpers.
 */

export const STORAGE_KEYS = {
  profile: 'nasa-profile',
  theme: 'nasa-theme',
  draft: 'nasa-chat-draft',
  settings: 'nasa-settings',
  cachedConversations: 'nasa-conversations-cache',
};

export function readJSON(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    // Valeur corrompue : on isole la panne au lieu de casser le rendu.
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* stockage indisponible */
    }
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'stockage indisponible';
    return `Échec de l’enregistrement : ${reason}`;
  }
}

export function readString(key, fallback = null) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeString(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    return error instanceof Error ? error.message : 'stockage indisponible';
  }
}

export function remove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* stockage indisponible */
  }
}