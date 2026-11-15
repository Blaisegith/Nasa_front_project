import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { endpoints, isServiceUnavailable } from '../lib/endpoints.js';
import { dataUrlToFile } from '../lib/photo.js';
import { STORAGE_KEYS, readJSON, remove, writeJSON } from '../lib/storage.js';
import { UNAUTHORIZED_EVENT } from '../lib/apiClient.js';
import { displayNameFromEmail } from '../lib/format.js';

const AuthContext = createContext(null);

const ANONYMOUS_CAPABILITIES = {
  rag: { connected: false },
  media: { connected: false },
  science: { connected: false },
  generation: { connected: false },
};

/**
 * Session utilisateur.
 *
 * L'identité vient exclusivement du cookie HttpOnly posé par le backend : le
 * frontend ne choisit jamais son `user_id`.
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [profile, setProfile] = useState(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [capabilities, setCapabilities] = useState(ANONYMOUS_CAPABILITIES);
  const [error, setError] = useState('');

  const applySession = useCallback((payload) => {
    setProfile(payload.profile);
    setSessionExpiresAt(payload.session_expires_at);
    setStatus('authenticated');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const payload = await endpoints.getSession();
      applySession(payload);
    } catch (caught) {
      if (isServiceUnavailable(caught)) return;
      setProfile(null);
      setSessionExpiresAt(null);
      setStatus('anonymous');
    }
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const payload = await endpoints.getSession();
        if (!cancelled) applySession(payload);
      } catch {
        if (!cancelled) setStatus('anonymous');
      }

      try {
        const caps = await endpoints.capabilities();
        if (!cancelled) setCapabilities(caps.capabilities ?? ANONYMOUS_CAPABILITIES);
      } catch {
        /* les capacités restent inconnues : l'interface ne s'affiche pas en erreur */
      }
    }

    boot();

    const onUnauthorized = () => {
      setProfile(null);
      setSessionExpiresAt(null);
      setStatus('anonymous');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);

    return () => {
      cancelled = true;
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    };
  }, [applySession]);

  /** Reprise du profil local (travail existant) vers le serveur. */
  const migrateLocalProfile = useCallback(async () => {
    const local = readJSON(STORAGE_KEYS.profile, null);
    if (!local) return;

    const payload = {
      display_name: local.name?.trim() || undefined,
      bio: local.bio?.trim() || undefined,
    };
    if (payload.display_name || payload.bio) {
      try {
        await endpoints.updateProfile(payload);
      } catch {
        /* la migration ne doit jamais bloquer la connexion */
      }
    }

    if (typeof local.photo === 'string' && local.photo.startsWith('data:')) {
      try {
        const file = await dataUrlToFile(local.photo, 'avatar.jpg');
        const { avatar_url: avatarUrl } = await endpoints.uploadAvatar(file, file.name);
        if (avatarUrl) {
          setProfile((current) => (current ? { ...current, avatar_url: avatarUrl } : current));
        }
      } catch {
        /* photo ignorée si le format n'est pas accepté */
      }
    }

    // Le serveur est la source de vérité : on ne conserve qu'un cache d'affichage.
    writeJSON(STORAGE_KEYS.profile, {
      name: local.name ?? '',
      email: local.email ?? '',
      bio: local.bio ?? '',
      photo: '',
    });
  }, []);

  const signIn = useCallback(
    async (email, displayName) => {
      setError('');
      const response = await endpoints.createSession(email, displayName);
      applySession(response);
      await migrateLocalProfile();
      const payload = await endpoints.getSession();
      applySession(payload);
      return payload;
    },
    [applySession, migrateLocalProfile],
  );

  const signOut = useCallback(async () => {
    try {
      await endpoints.deleteSession();
    } catch {
      /* la déconnexion locale reste effective */
    }
    setProfile(null);
    setSessionExpiresAt(null);
    setStatus('anonymous');
    remove(STORAGE_KEYS.profile);
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const updated = await endpoints.updateProfile(payload);
    setProfile((current) => (current ? { ...current, ...updated } : updated));
    return updated;
  }, []);

  const setAvatar = useCallback(async (file) => {
    const { avatar_url: avatarUrl } = await endpoints.uploadAvatar(file, file.name);
    setProfile((current) => (current ? { ...current, avatar_url: avatarUrl } : current));
    return avatarUrl;
  }, []);

  const value = useMemo(
    () => ({
      status,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      profile,
      sessionExpiresAt,
      capabilities,
      error,
      signIn,
      signOut,
      refresh,
      updateProfile,
      setAvatar,
      offlineDisplayName: (email) => displayNameFromEmail(email),
    }),
    [status, profile, sessionExpiresAt, capabilities, error, signIn, signOut, refresh, updateProfile, setAvatar],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return context;
}

export { ANONYMOUS_CAPABILITIES };