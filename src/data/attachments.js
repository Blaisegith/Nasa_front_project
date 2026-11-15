/**
 * Règles d'import de fichiers — miroir exact du backend
 * (`backend/app/core/config.py` : `ATTACHMENT_*`).
 *
 * Le frontend valide pour éviter un aller-retour inutile ; le backend reste
 * seul juge (type MIME, taille, unicité).
 */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/** Type MIME -> extension. L'ordre définit l'ordre du sélecteur de fichiers. */
export const ATTACHMENT_TYPES = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
};

export const ACCEPT_ATTRIBUTE = Object.values(ATTACHMENT_TYPES).join(',');

export const MAX_BYTES_LABEL = `${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} Mo`;

export function mediaTypeOf(mime) {
  if (mime === 'application/pdf') return 'document';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

export function isSupportedType(mime) {
  return Object.prototype.hasOwnProperty.call(ATTACHMENT_TYPES, mime);
}

export function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** Erreurs renvoyées sous forme de clé i18n + paramètres. */
export function validateFile(file) {
  if (!file) return { code: 'empty' };
  if (!isSupportedType(file.type)) return { code: 'unsupported', name: file.name };
  if (file.size <= 0) return { code: 'empty', name: file.name };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { code: 'tooLarge', name: file.name, max: MAX_BYTES_LABEL };
  }
  return null;
}