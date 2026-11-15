import {
  BarChart3, FileText, ImageIcon, Library, MessageSquarePlus, Table2,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { formatFileSize } from '../../data/attachments.js';

/**
 * En-tête du tableau de bord d'analyse.
 *
 * Affiche la question, l'état du traitement, les pièces jointes et un
 * décompte **réel** des éléments renvoyés par le backend. Aucune valeur n'est
 * estimée : un compteur à zéro signifie « absent de la réponse ».
 */

const PHASE_LABELS = {
  idle: 'answer.phaseIdle',
  sending: 'home.phaseSending',
  waiting: 'home.phaseWaiting',
  done: 'answer.phaseDone',
  unavailable: 'answer.phaseUnavailable',
  error: 'answer.phaseError',
};

function countBlocks(answer) {
  const blocks = answer?.blocks ?? [];
  return {
    tables: blocks.filter((block) => block.kind === 'table')
      .reduce((sum, block) => sum + (block.items?.length ?? 0), 0),
  };
}

export default function AnalysisHeader({
  question,
  attachments = [],
  answer = null,
  phase = 'idle',
  conversationId,
  onNewAnalysis,
  onOpenChat,
}) {
  const { t } = useI18n();
  const references = answer?.references?.length ?? 0;
  const media = answer?.media?.length ?? 0;
  const charts = answer?.charts?.length ?? 0;
  const { tables } = countBlocks(answer);

  const metrics = [
    { icon: BarChart3, value: charts, label: t('answer.countCharts') },
    { icon: ImageIcon, value: media, label: t('answer.countMedia') },
    { icon: Table2, value: tables, label: t('answer.countTables') },
    { icon: Library, value: references, label: t('answer.countReferences') },
  ].filter((metric) => metric.value > 0);

  const phaseKey = PHASE_LABELS[phase] ?? PHASE_LABELS.idle;

  return (
    <header className={`analysis-header phase-${phase}`}>
      <div className="analysis-header-top">
        <span className="analysis-eyebrow">
          <span className="analysis-pulse" aria-hidden="true" />
          {t('answer.analysisTitle')}
        </span>
        <span className={`analysis-status phase-${phase}`} role="status">
          {t(phaseKey)}
        </span>
      </div>

      <h2 className="analysis-question">{question}</h2>

      {attachments.length > 0 && (
        <ul className="composer-attachments" aria-label={t('composer.attachmentsLabel')}>
          {attachments.map((item) => (
            <li key={item.attachment_id} className="composer-chip is-static">
              <FileText size={13} aria-hidden="true" />
              <span className="composer-chip-name" title={item.filename}>{item.filename}</span>
              <span className="composer-chip-size">{formatFileSize(item.size_bytes)}</span>
            </li>
          ))}
        </ul>
      )}

      {metrics.length > 0 && (
        <dl className="analysis-metrics" aria-label={t('answer.availableEvidence')}>
          {metrics.map(({ icon: Icon, value, label }) => (
            <div className="analysis-metric" key={label}>
              <Icon size={14} aria-hidden="true" />
              <dd>{value}</dd>
              <dt>{label}</dt>
            </div>
          ))}
        </dl>
      )}

      <div className="analysis-actions">
        {answer && (
          <button type="button" className="button-secondary" onClick={onOpenChat}>
            <MessageSquarePlus size={13} aria-hidden="true" /> {t('home.openInChat')}
          </button>
        )}
        <button type="button" className="button-secondary" onClick={onNewAnalysis}>
          <MessageSquarePlus size={13} aria-hidden="true" /> {t('home.newAnalysis')}
        </button>
        {conversationId && (
          <span className="analysis-ref" title={t('answer.conversationRef', { id: conversationId })}>
            {t('answer.conversationSaved')}
          </span>
        )}
      </div>
    </header>
  );
}