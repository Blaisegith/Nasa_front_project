import { useRef, useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { decodeText } from '../lib/format.js';
import { resolveUrl } from '../lib/apiClient.js';

/**
 * Figure média : légende, source, crédit, états d'erreur.
 *
 * Aucune image ou vidéo n'est inventée : si la source manque, le composant
 * affiche « média non disponible » au lieu d'un visuel de remplacement qui
 * pourrait être pris pour une photographie scientifique authentique.
 *
 * Les segments horodatés (`item.segments`) proviennent du moteur de recherche :
 * chaque bouton déplace la lecture à l'instant réel de la séquence.
 *
 * Les chemins renvoyés par le backend (`/api/v1/retrieval/files?path=…`) sont
 * des chemins relatifs : ils passent par `resolveUrl` pour fonctionner aussi
 * quand `VITE_API_BASE_URL` désigne le backend déployé.
 */
function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
export default function MediaFigure({ item }) {
  const { t } = useI18n();
  const isVideo = item.media_type === 'video';
  const rawSrc = isVideo ? item.file_url || item.source_url : item.file_url || item.thumbnail_url;
  const src = resolveUrl(rawSrc);
  const poster = resolveUrl(item.thumbnail_url);
  const [failed, setFailed] = useState(false);

  const caption = decodeText(item.caption || item.description || '');
  const title = decodeText(item.title || '');
  const meta = [
    decodeText(item.source ?? ''),
    decodeText(item.experiment ?? ''),
    item.license ? `${t('answer.license')} : ${decodeText(item.license)}` : '',
  ].filter(Boolean).join(' · ');

  // Segments horodatés renvoyés par le moteur : chaque bouton place la lecture
  // à l'instant réel de la séquence. Aucun segment n'est inventé.
  const segments = Array.isArray(item.segments) ? item.segments : [];
  const videoRef = useRef(null);
  const seek = (startSeconds) => {
    const video = videoRef.current;
    if (!video || typeof startSeconds !== 'number') return;
    video.currentTime = Math.max(startSeconds, 0);
    void video.play().catch(() => {});
  };

  return (
    <figure className="answer-media">
      <div className={`answer-media-frame ${isVideo ? 'is-video' : ''}`}>
        {!src && <p className="answer-media-missing">{t('answer.mediaUnavailable')}</p>}

        {src && isVideo && (
          <video
            ref={videoRef}
            controls
            preload="metadata"
            poster={poster ?? undefined}
            src={src}
          >
            {t('answer.mediaUnavailable')}
          </video>
        )}

        {src && !isVideo && !failed && (
          <img
            src={src}
            alt={title ? `${t('answer.illustration')} : ${title}` : t('answer.illustration')}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        )}

        {src && !isVideo && failed && (
          <p className="answer-media-missing">
            <AlertTriangle size={14} /> {t('answer.imageUnavailable')}
          </p>
        )}
      </div>

      <figcaption className="answer-media-caption">
        <strong>{title || t('common.notAvailable')}</strong>
        {caption && <span>{caption}</span>}
        {meta && <span className="answer-media-meta">{meta}</span>}
        {item.source_url && (
          <a className="answer-media-link" href={item.source_url} target="_blank" rel="noreferrer">
            {t('answer.sourceOriginal')} <ExternalLink size={12} />
          </a>
        )}

        {isVideo && segments.length > 0 && (
          <div className="answer-media-segments">
            <span className="answer-media-segments-label">{t('answer.segments')}</span>
            {segments.map((segment) => {
              const start = Number(segment.start_s);
              if (!Number.isFinite(start)) return null;
              return (
                <button
                  key={`${segment.start_s}-${segment.end_s}`}
                  type="button"
                  className="answer-media-segment"
                  onClick={() => seek(start)}
                  title={`${t('answer.jumpTo')} ${formatTimestamp(start)}`}
                >
                  {formatTimestamp(start)}
                </button>
              );
            })}
          </div>
        )}
      </figcaption>
    </figure>
  );
}