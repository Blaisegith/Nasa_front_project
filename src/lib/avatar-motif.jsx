import { AVATAR_MOTIFS } from './avatar.js';

/**
 * Dessin du motif d'avatar dans un repère 48 × 48.
 *
 * Chaque motif est un jeu de traits et de points : aucun personnage, aucune
 * illustration. Les couleurs viennent du jeton d'avatar (`accent`) pour rester
 * cohérent avec le dégradé engendré.
 */
export default function avatarMotif(motif, accent) {
  const stroke = {
    stroke: accent, fill: 'none', strokeWidth: 1.4, strokeLinecap: 'round',
  };

  const known = AVATAR_MOTIFS.includes(motif) ? motif : AVATAR_MOTIFS[0];

  switch (known) {
    case 'grille':
      return (
        <>
          {[10, 18, 26, 34].map((offset) => (
            <line key={`v${offset}`} x1={offset} y1="6" x2={offset} y2="42" {...stroke} opacity="0.35" />
          ))}
          {[10, 18, 26, 34].map((offset) => (
            <line key={`h${offset}`} x1="6" y1={offset} x2="42" y2={offset} {...stroke} opacity="0.35" />
          ))}
          <circle cx="26" cy="18" r="2.4" fill={accent} />
        </>
      );
    case 'onde':
      return (
        <>
          <path d="M4 30c5-9 9-9 14 0s9 9 14 0 8-7 12-3" {...stroke} opacity="0.75" />
          <path d="M4 22c5-9 9-9 14 0s9 9 14 0 8-7 12-3" {...stroke} opacity="0.4" />
          <circle cx="32" cy="30" r="2" fill={accent} />
        </>
      );
    case 'prisme':
      return (
        <>
          <path d="M24 9 39 36H9z" {...stroke} opacity="0.55" />
          <path d="M24 17v14" {...stroke} opacity="0.8" />
          <circle cx="24" cy="35" r="2.2" fill={accent} />
        </>
      );
    case 'ciblage':
      return (
        <>
          <circle cx="24" cy="24" r="12" {...stroke} opacity="0.5" />
          <path d="M24 6v7M24 35v7M6 24h7M35 24h7" {...stroke} opacity="0.8" />
          <circle cx="24" cy="24" r="2.6" fill={accent} />
        </>
      );
    case 'noyau':
      return (
        <>
          <circle cx="24" cy="24" r="6.5" {...stroke} opacity="0.7" />
          <ellipse cx="24" cy="24" rx="16" ry="6.5" {...stroke} opacity="0.45" />
          <ellipse cx="24" cy="24" rx="16" ry="6.5" {...stroke} opacity="0.3" transform="rotate(60 24 24)" />
          <circle cx="24" cy="24" r="2.2" fill={accent} />
        </>
      );
    case 'orbite':
    default:
      return (
        <>
          <path d="M9 34c6-16 16-22 30-20" {...stroke} opacity="0.5" strokeDasharray="2 4" />
          <circle cx="33" cy="30" r="4.4" fill={accent} opacity="0.9" />
          <circle cx="33" cy="30" r="8" {...stroke} opacity="0.35" />
        </>
      );
  }
}