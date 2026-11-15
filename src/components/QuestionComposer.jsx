import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import {
  ArrowUp, FileText, Film, ImageIcon, Loader2, Paperclip, X,
} from 'lucide-react';
import { endpoints } from '../lib/endpoints.js';
import { useAuth } from '../state/AuthProvider.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import {
  ACCEPT_ATTRIBUTE, MAX_ATTACHMENTS_PER_MESSAGE, formatFileSize, mediaTypeOf, validateFile,
} from '../data/attachments.js';

const TYPE_ICONS = {
  document: FileText,
  image: ImageIcon,
  video: Film,
};

/**
 * Barre de question — Accueil et Chat partagent ce composant.
 *
 * - champ qui grandit avec le texte (1 → 8 lignes) ;
 * - import réel de fichiers (PDF, images, vidéos) validé côté client puis
 *   téléversé sur `POST /api/v1/chat/attachments` ;
 * - puces de fichiers avec nom, taille et retrait avant envoi ;
 * - état d'envoi explicite, jamais simulé.
 */
export default function QuestionComposer({
  value,
  onChange,
  onSubmit,
  isSending = false,
  placeholder,
  ariaLabel,
  resetToken = 0,
  disabled = false,
  hint,
  compact = false,
  autoFocus = false,
}) {
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const canAttach = isAuthenticated && !disabled;
  const canSend = value.trim().length > 0 && !isSending && !uploading && !disabled;

  // Le champ suit la hauteur du texte, dans une plage bornée.
  useLayoutEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = 'auto';
    const max = compact ? 132 : 168;
    node.style.height = `${Math.min(node.scrollHeight, max)}px`;
  }, [value, compact]);

  useEffect(() => {
    if (resetToken > 0) {
      setAttachments([]);
      setError('');
      setUploading(false);
    }
  }, [resetToken]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const upload = useCallback(async (files) => {
    if (!files?.length) return;
    setError('');

    const room = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;
    if (room <= 0) {
      setError(t('composer.maxFiles', { count: MAX_ATTACHMENTS_PER_MESSAGE }));
      return;
    }

    const accepted = [];
    const rejected = [];
    Array.from(files).slice(0, room).forEach((file) => {
      const problem = validateFile(file);
      if (problem) rejected.push({ problem, name: file.name });
      else accepted.push(file);
    });

    if (!accepted.length) {
      const { problem } = rejected[0];
      if (problem.code === 'unsupported') setError(t('composer.unsupported', { name: problem.name }));
      else if (problem.code === 'tooLarge') setError(t('composer.tooLarge', { name: problem.name, max: problem.max }));
      else setError(t('composer.empty'));
      return;
    }

    setUploading(true);
    try {
      const uploaded = [];
      for (const file of accepted) {
        const payload = await endpoints.uploadChatAttachment(file, file.name);
        uploaded.push({
          attachment_id: payload.attachment_id,
          filename: payload.filename ?? file.name,
          media_type: payload.media_type ?? mediaTypeOf(file.type),
          size_bytes: payload.size_bytes ?? file.size,
          url: payload.url,
        });
      }
      setAttachments((current) => [...current, ...uploaded]);
      const skipped = rejected.length + (files.length - accepted.length - rejected.length);
      if (skipped > 0) setError(t('composer.someSkipped', { count: skipped, max: MAX_ATTACHMENTS_PER_MESSAGE }));
    } catch (caught) {
      setError(caught.message ?? t('composer.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [attachments.length, t]);

  const submit = (event) => {
    event?.preventDefault();
    if (!canSend) return;
    setError('');
    onSubmit(value.trim(), attachments);
  };

  const removeAttachment = (attachmentId) => {
    setAttachments((current) => current.filter((item) => item.attachment_id !== attachmentId));
  };

  return (
    <form className={`composer ${compact ? 'composer-compact' : ''}`} onSubmit={submit}>
      {attachments.length > 0 && (
        <ul className="composer-attachments" aria-label={t('composer.attachmentsLabel')}>
          {attachments.map((item) => {
            const Icon = TYPE_ICONS[item.media_type] ?? FileText;
            return (
              <li key={item.attachment_id} className="composer-chip">
                <Icon size={13} />
                <span className="composer-chip-name" title={item.filename}>{item.filename}</span>
                <span className="composer-chip-size">{formatFileSize(item.size_bytes)}</span>
                <button
                  type="button"
                  className="composer-chip-remove"
                  aria-label={t('composer.remove', { name: item.filename })}
                  onClick={() => removeAttachment(item.attachment_id)}
                >
                  <X size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="composer-shell">
        <button
          type="button"
          className="composer-attach"
          aria-label={t('composer.attach')}
          title={canAttach ? t('composer.attach') : t('composer.attachSignIn')}
          disabled={!canAttach || uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 size={17} className="spin" /> : <Paperclip size={17} />}
        </button>
        <input
          ref={fileRef}
          type="file"
          className="composer-file-input"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => upload(event.target.files)}
        />

        <label className="composer-field">
          <span className="sr-only">{ariaLabel ?? t('chat.placeholder')}</span>
          <textarea
            ref={inputRef}
            className="composer-input"
            rows={1}
            value={value}
            disabled={disabled}
            placeholder={placeholder ?? t('chat.placeholder')}
            aria-label={ariaLabel ?? t('chat.placeholder')}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit(event);
              }
            }}
          />
        </label>

        <button type="submit" className="composer-send" disabled={!canSend} aria-label={t('chat.send')}>
          {isSending ? <Loader2 size={17} className="spin" /> : <ArrowUp size={18} />}
        </button>
      </div>

      <div className="composer-meta">
        <span className="composer-hint">{hint ?? t('composer.hint')}</span>
        {!isAuthenticated && <span className="composer-note">{t('composer.signInHint')}</span>}
      </div>

      {error && <p className="composer-error" role="alert">{error}</p>}
    </form>
  );
}