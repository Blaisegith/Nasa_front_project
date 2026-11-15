/**
 * Avatar par défaut, déterministe — logique pure, sans JSX.
 *
 * L'avatar est engendré à partir d'une graine stable (identifiant utilisateur,
 * à défaut l'e-mail). La même personne retrouve donc toujours le même avatar,
 * y compris après rechargement, sur un autre appareil ou après reconnexion.
 *
 * Le vocabulaire graphique reste sobre : dégradé duotone, un motif géométrique
 * (orbite, grille, onde, prisme…), jamais de personnage ni d'illustration
 * enfantine. Le dessin lui-même vit dans `avatar-motif.jsx`.
 */

/** FNV-1a 32 bits : petit, rapide, suffisant pour choisir un dégradé. */
export function hashString(input) {
  const text = String(input ?? '');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Duotones alignés sur la palette de la plateforme : bleu, cyan, violet,
 * sarcelle, ambre. Assortis pour rester lisibles avec un texte blanc.
 */
export const AVATAR_PALETTES = [
  { from: '#1f5fd0', to: '#0b2f6b', accent: '#7fb2ff' },
  { from: '#0f6f8c', to: '#083b52', accent: '#6fd3e8' },
  { from: '#4b3fa8', to: '#241c5c', accent: '#a99bff' },
  { from: '#1a6b5a', to: '#0a3229', accent: '#6fd6b6' },
  { from: '#8a4a2f', to: '#40200f', accent: '#f0a882' },
  { from: '#2a5f9e', to: '#122c4d', accent: '#8ec2f5' },
  { from: '#6a3f8f', to: '#2c1740', accent: '#c79ae8' },
  { from: '#146b7a', to: '#062b33', accent: '#79d7e2' },
];

/** Motifs géométriques : aucun n'évoque un personnage. */
export const AVATAR_MOTIFS = ['orbite', 'grille', 'onde', 'prisme', 'ciblage', 'noyau'];

export function avatarSeed(profile) {
  if (!profile) return 'invite';
  return String(profile.user_id ?? profile.email ?? profile.display_name ?? 'invite');
}

export function buildAvatar(profile) {
  const seed = avatarSeed(profile);
  const hash = hashString(seed);
  const palette = AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
  const motif = AVATAR_MOTIFS[Math.floor(hash / AVATAR_PALETTES.length) % AVATAR_MOTIFS.length];
  const rotation = (hash % 60) - 30;

  return {
    seed,
    from: palette.from,
    to: palette.to,
    accent: palette.accent,
    motif,
    rotation,
    // Sert de clé React stable et d'identifiant de dégradé unique.
    id: `av${(hash % 0xffffff).toString(36)}`,
  };
}