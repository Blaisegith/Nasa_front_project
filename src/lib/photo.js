/**
 * Traitement de la photo de profil.
 *
 * Le redimensionnement reste côté client (éviter d'envoyer 8 Mo), mais l'URL
 * finale est désormais fournie par le backend : plus de data URL dans le
 * localStorage (quota navigateur, 5 Mo).
 */

export const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
export const AVATAR_TARGET_SIZE = 512;

export async function fileToResizedBlob(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choisissez un fichier image.');
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('La photo doit faire moins de 8 Mo.');
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, AVATAR_TARGET_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Impossible de traiter cette photo dans le navigateur.');
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('Impossible de générer la photo.');

  const extension = file.type === 'image/png' ? 'png' : 'jpg';
  const name = file.name ? file.name.replace(/\.[^.]+$/, '') : 'avatar';
  return new File([blob], `${name}.${extension}`, { type: blob.type || 'image/jpeg' });
}

/** data URL -> File, pour migrer une photo déjà stockée localement. */
export async function dataUrlToFile(dataUrl, filename = 'avatar.jpg') {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const extension = blob.type === 'image/png' ? 'png' : 'jpg';
  return new File([blob], filename.replace(/\.[^.]+$/, `.${extension}`), { type: blob.type });
}