import {
  CheckCircle2, Loader2, TriangleAlert,
} from 'lucide-react';
import AnswerRenderer from '../../components/AnswerRenderer.jsx';
import AnalysisHeader from './AnalysisHeader.jsx';
import { useI18n } from '../../i18n/I18nProvider.jsx';

const COMPONENT_LABELS = {
  generation: 'answer.componentGeneration',
  rag: 'answer.componentRag',
  media: 'answer.componentMedia',
  science: 'answer.componentScience',
};

/**
 * Tableau de bord d'analyse — réponse d'une question posée depuis l'Accueil.
 *
 * Le contenu provient exclusivement du backend : réponse structurée, ou état
 * « service non branché » avec la question persistée. Aucune donnée, aucun
 * graphique et aucune image ne sont fabriqués.
 *
 * L'ordre des sections suit le parcours de lecture : question et état,
 * réponse argumentée, visuels, données, sources, limites.
 */
export default function HomeAnswerPanel({
  question,
  attachments = [],
  answer = null,
  phase = 'idle',
  unavailable = false,
  component,
  conversationId,
  notice,
  error,
  onReset,
  onOpenChat,
}) {
  const { t } = useI18n();
  const isWorking = phase === 'sending' || phase === 'waiting';
  const hasAnswer = Boolean(answer);

  return (
    <section
      className={`answer-panel dashboard ${unavailable ? 'is-unavailable' : ''}`}
      aria-live="polite"
      aria-busy={isWorking}
      aria-label={t('answer.analysisTitle')}
    >
      <AnalysisHeader
        question={question}
        attachments={attachments}
        answer={answer}
        phase={isWorking ? phase : (hasAnswer ? 'done' : phase)}
        conversationId={conversationId}
        onNewAnalysis={onReset}
        onOpenChat={onOpenChat}
      />

      {isWorking && (
        <div className="answer-status" role="status">
          <Loader2 size={15} className="spin" aria-hidden="true" />
          <span>{phase === 'sending' ? t('home.phaseSending') : t('home.phaseWaiting')}</span>
          <span className="answer-status-note">{t('answer.savedQuestion')}</span>
        </div>
      )}

      {error && !isWorking && (
        <div className="answer-alert is-error" role="alert">
          <TriangleAlert size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {unavailable && !isWorking && (
        <div className="answer-alert" role="status">
          <TriangleAlert size={15} aria-hidden="true" />
          <div>
            <strong>{t('answer.unavailableTitle')}</strong>
            <p>{notice ?? t('answer.serviceUnavailable')}</p>
            <span className="answer-alert-meta">
              {t('answer.componentNotConnected', {
                component: t(COMPONENT_LABELS[component] ?? 'answer.componentGeneration'),
              })}
            </span>
          </div>
        </div>
      )}

      {!unavailable && !error && hasAnswer && (
        <>
          {notice && (
            <div className="answer-alert is-info" role="status">
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>{notice}</span>
            </div>
          )}
          <AnswerRenderer answer={answer} />
        </>
      )}

      {!unavailable && !error && !hasAnswer && !isWorking && notice && (
        <div className="answer-alert is-info" role="status">
          <CheckCircle2 size={15} aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}
    </section>
  );
}