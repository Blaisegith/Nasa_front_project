/** Utilitaires de formatage partagés. */

export function formatTime(isoOrDate) {
  const date = isoOrDate ? new Date(isoOrDate) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatDateTime(isoOrDate) {
  const date = new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function profileInitials(name) {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function displayNameFromEmail(email) {
  if (!email) return 'Explorateur';
  const localPart = email.split('@')[0] ?? '';
  const cleaned = localPart.replace(/[._-]+/g, ' ').trim();
  if (!cleaned) return 'Explorateur';
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function previewOf(text, maxLength = 140) {
  if (!text) return '';
  const clean = String(text).trim();
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1)}…`;
}