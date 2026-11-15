import { useId } from 'react';
import { resolveUrl } from '../lib/apiClient.js';
import { profileInitials } from '../lib/format.js';
import { buildAvatar } from '../lib/avatar.js';
import avatarMotif from '../lib/avatar-motif.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

/**
 * Avatar utilisateur.
 *
 * - photo enregistrée → prioritaire, recadrée dans un cercle parfait ;
 * - sinon → avatar généré, **stable** pour un même utilisateur (voir
 *   `src/lib/avatar.js`) ;
 * - visiteur non connecté → silhouette neutre.
 *
 * Aucune requête réseau : l'avatar est du SVG local.
 */

const SIZES = { xs: 28, sm: 34, md: 44, lg: 96 };

export default function UserAvatar({
  profile,
  size = 'md',
  className = '',
  decorative = false,
}) {
  const { t } = useI18n();
  const gradientId = useId().replace(/:/g, '');
  const dimension = SIZES[size] ?? SIZES.md;
  const photo = resolveUrl(profile?.avatar_url);
  const label = profile?.display_name
    ? t('user.avatarAlt', { name: profile.display_name })
    : t('user.avatarAnonymous');
  const avatar = buildAvatar(profile);

  if (photo) {
    return (
      <img
        className={`user-avatar user-avatar-photo ${className}`.trim()}
        src={photo}
        alt={decorative ? '' : label}
        width={dimension}
        height={dimension}
        style={{ width: dimension, height: dimension }}
        loading="lazy"
        decoding="async"
        aria-hidden={decorative || undefined}
      />
    );
  }

  if (!profile) {
    return (
      <span
        className={`user-avatar user-avatar-guest ${className}`.trim()}
        style={{ width: dimension, height: dimension }}
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : label}
        aria-hidden={decorative || undefined}
      >
        <svg viewBox="0 0 48 48" width={dimension} height={dimension} aria-hidden="true" focusable="false">
          <circle cx="24" cy="19" r="7.5" fill="currentColor" opacity="0.55" />
          <path d="M10 40c2.6-7.4 7.6-11 14-11s11.4 3.6 14 11" fill="currentColor" opacity="0.55" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={`user-avatar user-avatar-generated ${className}`.trim()}
      style={{ width: dimension, height: dimension }}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      data-motif={avatar.motif}
    >
      <svg viewBox="0 0 48 48" width={dimension} height={dimension} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={avatar.from} />
            <stop offset="100%" stopColor={avatar.to} />
          </linearGradient>
        </defs>
        <rect width="48" height="48" fill={`url(#${gradientId})`} />
        <g transform={`rotate(${avatar.rotation} 24 24)`} opacity="0.55">
          {avatarMotif(avatar.motif, avatar.accent)}
        </g>
        {size !== 'xs' && (
          <text
            x="24"
            y="27"
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fill="#ffffff"
            opacity="0.92"
            style={{ fontFamily: "'Manrope', system-ui, sans-serif", letterSpacing: '0.02em' }}
          >
            {profileInitials(profile.display_name)}
          </text>
        )}
      </svg>
    </span>
  );
}