import { useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';

/**
 * Figure média : légende, source, crédit, états d'erreur.
 *
 * Aucune image ou vidéo n'est inventée : si la source manque, le composant
 * affiche « média non disponible » au lieu d'un visuel de remplacement qui
 * pourrait être pris pour une photographie scientifique authentique.
 */
export default function MediaFigure({ item }) {
  const isVideo = item.media_type === 'video';
  const src = isVideo ? item.file_url || item.source_url : item.file_url || item.thumbnail_url;
  const [failed, setFailed] = useState(false);

  const caption = item.caption || item.description || '';
  const meta = [item.source, item.experiment, item.license && `Licence : ${item.license}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <figure className="answer-media">
      <div className={`answer-media-frame ${isVideo ? 'is-video' : ''}`}>
        {!src && <p className="answer-media-missing">Média non disponible.</p>}

        {src && isVideo && (
          <video
            controls
            preload="metadata"
            poster={item.thumbnail_url ?? undefined}
            src={src}
          >
            Votre navigateur ne prend pas en charge la lecture vidéo.
          </video>
        )}

        {src && !isVideo && !failed && (
          <img
            src={src}
            alt={item.title ? `Illustration : ${item.title}` : 'Illustration scientifique'}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        )}

        {src && !isVideo && failed && (
          <p className="answer-media-missing">
            <AlertTriangle size={14} /> Image indisponible (format non pris en charge ou accès refusé).
          </p>
        )}
      </div>

      <figcaption className="answer-media-caption">
        <strong>{item.title || 'Sans titre'}</strong>
        {caption && <span>{caption}</span>}
        {meta && <span className="answer-media-meta">{meta}</span>}
        {item.source_url && (
          <a className="answer-media-link" href={item.source_url} target="_blank" rel="noreferrer">
            Source originale <ExternalLink size={12} />
          </a>
        )}
      </figcaption>
    </figure>
  );
}