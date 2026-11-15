import { useMemo, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import PageHeading from '../../components/PageHeading.jsx';
import QuestionComposer from '../../components/QuestionComposer.jsx';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useConversations } from '../../state/ConversationProvider.jsx';
import HomeAnswerPanel from './HomeAnswerPanel.jsx';
import { ResearchInsights } from './ResearchInsights.jsx';

/**
 * Accueil.
 *
 * Deux états :
 *
 *  1. **Accueil** — identité de la plateforme, mise en avant, barre de question
 *     flottante. C'est le point d'entrée de la découverte.
 *  2. **Tableau de bord** — dès qu'une question est prise en charge, la page
 *     se transforme : la barre d'accueil disparaît de son emplacement, la
 *     question et ses résultats occupent la page, et une barre compacte prend
 *     le relais pour les questions complémentaires.
 *
 * La question est envoyée au backend et la réponse s'affiche **sur cette page**
 * (aucune redirection vers le Chat). L'échange est persisté : il reste
 * consultable dans le Chat, avec le même identifiant de conversation.
 */
export default function HomePage({
  setActivePage, articles, draft, setDraft, greeting,
}) {
  const { t } = useI18n();
  const {
    ask, isSending, phase, messages, activeId, notice, error,
  } = useConversations();

  // Échange en cours d'envoi : on l'affiche immédiatement, avant que le store
  // ne soit synchronisé avec la réponse du serveur.
  const [pending, setPending] = useState(null);
  const [dismissedId, setDismissedId] = useState(null);
  const [resetToken, setResetToken] = useState(0);
  // Composant réellement absent, tel que le backend le déclare (`generation`,
  // `rag`, `media`, `science`). Sert à nommer précisément ce qui manque.
  const [unavailableComponent, setUnavailableComponent] = useState(null);

  const lastExchange = useMemo(() => {
    const userIndex = messages.map((message) => message.role).lastIndexOf('user');
    if (userIndex < 0) return null;
    const user = messages[userIndex];
    const assistant = messages
      .slice(userIndex + 1)
      .find((message) => message.role === 'assistant') ?? null;

    return {
      id: user.id,
      question: user.content?.text ?? '',
      attachments: user.content?.attachments ?? [],
      answer: assistant?.content?.schema_version ? assistant.content : null,
    };
  }, [messages]);

  const exchange = pending ?? lastExchange;
  const visible = exchange && exchange.id !== dismissedId ? exchange : null;
  const isUnavailable = !visible?.answer && phase === 'unavailable';
  // Le tableau de bord s'installe dès que la question est prise en charge, pas
  // avant : la barre d'accueil reste visible tant que rien n'est envoyé.
  const dashboard = Boolean(visible);
  const answerPhase = isSending ? phase : (visible?.answer ? 'done' : phase);

  const submit = async (text, attachments) => {
    setDraft('');
    setDismissedId(null);
    setUnavailableComponent(null);
    setPending({ id: `local-${Date.now()}`, question: text, attachments, answer: null });
    const result = await ask(text, attachments);
    if (result?.unavailable) setUnavailableComponent(result.component ?? 'generation');
    setPending(null);
  };

  const reset = () => {
    setPending(null);
    setDismissedId(exchange?.id ?? null);
    setUnavailableComponent(null);
    setResetToken((value) => value + 1);
  };

  if (dashboard) {
    return (
      <div className="home-page dashboard-page">
        <HomeAnswerPanel
          question={visible.question}
          attachments={visible.attachments}
          answer={visible.answer}
          phase={answerPhase}
          unavailable={isUnavailable}
          component={unavailableComponent}
          conversationId={activeId}
          notice={notice}
          error={error}
          onReset={reset}
          onOpenChat={() => setActivePage('chat')}
        />

        <div className="dashboard-dock">
          <div className="dashboard-dock-inner">
            <span className="dashboard-dock-label">
              <Sparkles size={13} aria-hidden="true" />
              {t('home.followUp')}
            </span>
            <QuestionComposer
              value={draft}
              onChange={setDraft}
              onSubmit={submit}
              isSending={isSending}
              resetToken={resetToken}
              compact
              hint={t('composer.hintFollowUp')}
              placeholder={t('home.followUpPlaceholder')}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <PageHeading
        title={<>{greeting} <span className="wave">✳</span></>}
        subtitle={t('home.intro')}
      />

      <section className="feature-grid home-hero">
        <div className="feature-copy">
          <span className="feature-kicker"><span className="live-pulse" /> {t('home.kicker')}</span>
          <h2>
            {t('home.headline').split('. ')[0]}
            {'.'}
            <br />
            <em>{t('home.headline').split('. ')[1]}</em>
          </h2>
          <p>{t('home.intro')}</p>
          <button type="button" className="button-primary" onClick={() => setActivePage('explore')}>
            {t('home.ctaExplore')} <ArrowRight size={15} />
          </button>
          <div className="feature-index">
            <span>01</span>
            <span className="index-line" />
            <span>{t('home.indexLabel')}</span>
          </div>
        </div>
        <div
          className="feature-image"
          style={articles[0]?.image
            ? { backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(4, 23, 51, .66)), url("${articles[0].image}")` }
            : undefined}
        >
          {!articles[0]?.image && (
            <div className="flame-scene">
              <span className="scene-orbit orbit-one" />
              <span className="scene-orbit orbit-two" />
              <span className="scene-core"><i /></span>
              <span className="scene-grid" />
            </div>
          )}
          <div className="image-label">
            <span>{t('home.imageLabel')}</span>
            <span>{t('home.imageOrbit')}</span>
          </div>
          <span className="image-coordinate">45° N / 122° W</span>
        </div>
      </section>

      <ResearchInsights />

      <div className="home-dock">
        <QuestionComposer
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          isSending={isSending}
          resetToken={resetToken}
        />
      </div>
    </div>
  );
}