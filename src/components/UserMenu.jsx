import { useEffect, useId, useRef, useState } from 'react';
import {
  ChevronDown, LogOut, Settings, UserRound,
} from 'lucide-react';
import UserAvatar from './UserAvatar.jsx';
import { useAuth } from '../state/AuthProvider.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

/**
 * Menu de compte.
 *
 * Affiche l'avatar (photo enregistrée ou avatar généré stable), puis au clic :
 * identité du compte, accès au profil, aux paramètres, et déconnexion.
 *
 * Ne touche pas à l'authentification : `signOut` vient d'`AuthProvider`.
 * Fermeture au clic extérieur, à la touche Échap, et déplacement du focus
 * dans le panneau à l'ouverture.
 */
export default function UserMenu({ onNavigate }) {
  const { t } = useI18n();
  const { status, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const firstItemRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    firstItemRef.current?.focus();

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const isLoading = status === 'loading';
  const displayName = profile?.display_name ?? t('user.guest');
  const email = profile?.email ?? '';

  const go = (page) => {
    setOpen(false);
    onNavigate?.(page);
  };

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        type="button"
        className={`user-chip user-menu-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        <UserAvatar profile={profile} size="sm" decorative />
        <span className="user-menu-label">
          {isLoading ? t('topbar.checking') : displayName}
        </span>
        <ChevronDown size={14} className="user-menu-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="user-menu-panel" id={panelId} role="menu" aria-label={t('user.menu')}>
          <div className="user-menu-identity">
            <UserAvatar profile={profile} size="md" decorative />
            <div className="user-menu-identity-copy">
              <strong>{isLoading ? t('topbar.checking') : displayName}</strong>
              {email ? (
                <span title={email}>{email}</span>
              ) : (
                <span className="user-menu-muted">{t('user.noEmail')}</span>
              )}
            </div>
          </div>

          <div className="user-menu-separator" role="none" />

          <button
            type="button"
            role="menuitem"
            className="user-menu-item"
            ref={firstItemRef}
            onClick={() => go('profile')}
          >
            <UserRound size={15} aria-hidden="true" />
            <span>{t('user.profile')}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="user-menu-item"
            onClick={() => go('settings')}
          >
            <Settings size={15} aria-hidden="true" />
            <span>{t('user.settings')}</span>
          </button>

          {profile && (
            <>
              <div className="user-menu-separator" role="none" />
              <button
                type="button"
                role="menuitem"
                className="user-menu-item is-danger"
                onClick={async () => {
                  setOpen(false);
                  await signOut();
                  onNavigate?.('home');
                }}
              >
                <LogOut size={15} aria-hidden="true" />
                <span>{t('user.signOut')}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}