import { ArrowRight, Send, Sparkles } from 'lucide-react';
import PageHeading from '../../components/PageHeading.jsx';
import { ResearchInsights } from './ResearchInsights.jsx';

export default function HomePage({
  setActivePage, articles, draft, setDraft, ask, greeting,
}) {
  const quickAsk = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await ask(text);
    setActivePage('chat');
  };

  return (
    <div className="home-page">
      <PageHeading
        title={<>{greeting} <span className="wave">✳</span></>}
        subtitle="Découvrez comment la NASA étudie le comportement du feu en microgravité."
      />
      <section className="feature-grid">
        <div className="feature-copy">
          <span className="feature-kicker"><span className="live-pulse" /> À LA UNE · SCIENCE EN ORBITE</span>
          <h2>Le feu ne monte pas.<br /><em>Il se transforme.</em></h2>
          <p>Sans gravité, la combustion révèle des comportements surprenants. Les comprendre, c’est mieux protéger les équipages et préparer les missions de demain.</p>
          <button className="button-primary" onClick={() => setActivePage('explore')}>Explorer la recherche <ArrowRight size={15} /></button>
          <div className="feature-index"><span>01</span><span className="index-line" /><span>RECHERCHE EN MICROGRAVITÉ</span></div>
        </div>
        <div
          className="feature-image"
          style={articles[0]?.image ? { backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(4, 23, 51, .66)), url("${articles[0].image}")` } : undefined}
        >
          {!articles[0]?.image && (
            <div className="flame-scene">
              <span className="scene-orbit orbit-one" />
              <span className="scene-orbit orbit-two" />
              <span className="scene-core"><i /></span>
              <span className="scene-grid" />
            </div>
          )}
          <div className="image-label"><span>EXPÉRIENCE DE COMBUSTION</span><span>ISS · ORBITE TERRESTRE</span></div>
          <span className="image-coordinate">45° N / 122° W</span>
        </div>
      </section>

      <ResearchInsights />

      <form className="quick-question" onSubmit={quickAsk}>
        <Sparkles className="quick-question-icon" size={21} />
        <div className="quick-question-field">
          <span>POSEZ VOTRE QUESTION</span>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Que voulez-vous découvrir sur le feu dans l’espace ?"
            aria-label="Question rapide"
          />
        </div>
        <button className="quick-question-submit" type="submit" aria-label="Envoyer la question">
          <Send size={19} />
        </button>
      </form>
    </div>
  );
}