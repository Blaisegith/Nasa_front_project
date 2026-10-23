import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight,
  CircleHelp, Compass, ExternalLink, Flame, House, Mail, Menu,
  Moon, Pencil, Paperclip, Rocket, Search, Send, Settings, Sparkles,
  Sun, UserRound, X,
} from 'lucide-react';

const navigation = [
  { id: 'home', label: 'Accueil', icon: House },
  { id: 'chat', label: 'Chat', icon: CircleHelp },
  { id: 'explore', label: 'Explorer', icon: Compass },
  
  { id: 'profile', label: 'Profil', icon: UserRound },
];

const topics = [
  { label: 'Combustion', count: '12 ressources', color: 'blue' },
  { label: 'Sécurité à bord', count: '8 ressources', color: 'coral' },
  { label: 'Station spatiale', count: '6 ressources', color: 'green' },
];

const fallbackArticles = [
  {
    title: 'Étude de la combustion des flammes en microgravité',
    description: 'Comment les flammes se propagent et produisent de la suie loin de la gravité terrestre.',
    date: '12 avr. 2025',
    category: 'Articles',
    image: null,
  },
  {
    title: 'La recherche sur le feu en microgravité avance à bord de l’ISS',
    description: 'Les expériences menées sur la Station spatiale apportent de nouvelles données sur la combustion.',
    date: '28 mars 2025',
    category: 'Actualités',
    image: null,
  },
  {
    title: 'Microgravity Fire Safety : nouvelles perspectives',
    description: 'Des recherches pour améliorer la sécurité incendie des futurs vaisseaux spatiaux.',
    date: '15 févr. 2025',
    category: 'Recherche',
    image: null,
  },
];

const sectionCopy = {
  home: { eyebrow: 'CENTRE DE RECHERCHE · ISS', title: 'Le feu, autrement.', subtitle: 'Comprendre la combustion en microgravité pour mieux préparer les missions de demain.' },
  chat: { eyebrow: 'ASSISTANT DE RECHERCHE', title: 'Une question ?', subtitle: 'Explorez les recherches NASA sur la combustion dans l’espace.' },
  explore: { eyebrow: 'PARCOURS THÉMATIQUES', title: 'Suivez votre curiosité.', subtitle: 'Parcourez les sujets qui font avancer la sécurité spatiale.' },
  profile: { eyebrow: 'ESPACE PERSONNEL', title: 'Votre profil.', subtitle: 'Gérez vos informations et vos centres d’intérêt.' },
};

function formatTime() {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}

function assistantReply(text) {
  const normalized = text.toLocaleLowerCase('fr');
  if (normalized.includes('flamme') || normalized.includes('forme')) {
    return 'En microgravité, la convection naturelle disparaît : les gaz chauds ne montent plus. La flamme prend une forme presque sphérique et l’oxygène arrive surtout par diffusion. Elle brûle souvent plus lentement, à une température différente, ce qui aide les chercheurs à mieux comprendre la combustion.';
  }
  if (normalized.includes('sécurité') || normalized.includes('danger') || normalized.includes('risque')) {
    return 'À bord de l’ISS, la prévention repose sur la détection précoce, la limitation des matériaux inflammables et des procédures d’extinction dédiées. Les expériences de combustion aident à affiner ces protocoles pour les futures missions, où un équipage sera plus loin de la Terre.';
  }
  return 'Les expériences de la NASA en microgravité permettent d’isoler des phénomènes que la gravité masque sur Terre. En étudiant la forme des flammes, leur propagation et la production de suie, les équipes améliorent à la fois la science de la combustion et la sécurité des astronautes.';
}

function App() {
  const [activePage, setActivePage] = useState('home');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [articleFilter, setArticleFilter] = useState('Tous');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [articles, setArticles] = useState(fallbackArticles);
  const [profile, setProfile] = useState({ name: 'Alex Martin', email: 'alex.martin@monapp.com', bio: 'Passionné par la recherche spatiale et la science.' });
  const [editingProfile, setEditingProfile] = useState(false);
  const [savedArticles, setSavedArticles] = useState([]);
  const [theme, setTheme] = useState(() => window.localStorage.getItem('nasa-theme') === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    window.localStorage.setItem('nasa-theme', theme);
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('https://images-api.nasa.gov/search?q=SoFIE%20Growth%20Extinction%20Limits&media_type=image&page_size=8', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('NASA image search unavailable')))
      .then((data) => {
        const items = data.collection?.items ?? [];
        const images = items.flatMap((item) => {
          const href = item.links?.find((link) => link.render === 'image' || link.rel === 'preview')?.href;
          return href ? [{ href, title: item.data?.[0]?.title, description: item.data?.[0]?.description }] : [];
        });
        if (!images.length) return;
        const flameImage = images.find((image) => image.href.includes('jsc2023e002281'));
        const orderedImages = flameImage ? [flameImage, ...images.filter((image) => image !== flameImage)] : images;
        setArticles((current) => current.map((article, index) => ({ ...article, image: orderedImages[index % orderedImages.length].href })));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const filteredArticles = useMemo(() => articles.filter((article) => {
    const matchesFilter = articleFilter === 'Tous' || article.category === articleFilter;
    const searchable = `${article.title} ${article.description}`.toLocaleLowerCase('fr');
    return matchesFilter && searchable.includes(searchQuery.toLocaleLowerCase('fr'));
  }), [articles, articleFilter, searchQuery]);

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const time = formatTime();
    setMessages((current) => [...current, { role: 'user', text, time }, { role: 'assistant', text: assistantReply(text), time }]);
    setDraft('');
  }

  function toggleSaved(title) {
    setSavedArticles((current) => current.includes(title) ? current.filter((item) => item !== title) : [...current, title]);
  }

  const activeCopy = sectionCopy[activePage];

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="nav-caption">VOTRE ESPACE</div>
        <nav className="main-nav" aria-label="Navigation principale">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-link ${activePage === id ? 'active' : ''}`} onClick={() => { setActivePage(id); setMobileNavOpen(false); }}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === 'chat' && messages.length > 1 && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className={`nav-link settings-link ${activePage === 'settings' ? 'active' : ''}`} onClick={() => setActivePage('settings')}><Settings size={17} /><span>Paramètres</span></button>
        </div>
      </aside>

      {mobileNavOpen && <button className="mobile-scrim" aria-label="Fermer le menu" onClick={() => setMobileNavOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Ouvrir le menu" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
          <a className="brand topbar-brand" href="#home" onClick={(event) => { event.preventDefault(); setActivePage('home'); setMobileNavOpen(false); }}>
            <span className="nasa-mark" aria-hidden="true"><span>NASA</span><i /></span>
            <span className="brand-copy"><strong>NASA AI Assistant</strong><small>Explorez l’univers des connaissances NASA</small></span>
          </a>
          <div className="topbar-actions">
            <button className="icon-button theme-button" aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'} title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="user-chip research-chip" onClick={() => setActivePage('profile')}><UserRound size={15} /><span>NASA Research</span></button>
          </div>
        </header>

        <div className={`page-content ${activePage === 'chat' ? 'chat-page-content' : ''}`}>
          {activePage === 'home' && <HomePage setActivePage={setActivePage} articles={articles} draft={draft} setDraft={setDraft} sendMessage={sendMessage} />}
          {activePage === 'chat' && <ChatPage messages={messages} draft={draft} setDraft={setDraft} sendMessage={sendMessage} />}
          {activePage === 'explore' && <LibraryPage activePage={activePage} copy={activeCopy} searchQuery={searchQuery} setSearchQuery={setSearchQuery} articleFilter={articleFilter} setArticleFilter={setArticleFilter} articles={filteredArticles} savedArticles={savedArticles} toggleSaved={toggleSaved} />}
          {activePage === 'profile' && <ProfilePage profile={profile} setProfile={setProfile} editing={editingProfile} setEditing={setEditingProfile} />}
          {activePage === 'settings' && <SettingsPage />}
        </div>
        {activePage !== 'chat' && <footer className="page-footer"><span>TechLabs</span><span>Explorer la science, préparer demain <ArrowUpRight size={13} /></span></footer>}
      </main>
    </div>
  );
}

function PageHeading({ eyebrow, title, subtitle, actions }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow"><span />{eyebrow}</div>}<h1>{title}</h1><p>{subtitle}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

function HomePage({ setActivePage, articles, draft, setDraft, sendMessage }) {
  return (
    <>
      <PageHeading title={<>Bonjour, Alex <span className="wave">✳</span></>} subtitle="Découvrez comment la NASA étudie le comportement du feu en microgravité." actions={<form className="quick-question" onSubmit={(event) => { sendMessage(event); setActivePage('chat'); }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Posez votre question sur le feu en microgravité…" aria-label="Question rapide" /><button className="quick-question-submit" type="submit" aria-label="Envoyer la question"><Send size={16} /></button></form>} />
      <section className="feature-grid">
        <div className="feature-copy">
          <span className="feature-kicker"><span className="live-pulse" /> À LA UNE · SCIENCE EN ORBITE</span>
          <h2>Le feu ne monte pas.<br /><em>Il se transforme.</em></h2>
          <p>Sans gravité, la combustion révèle des comportements surprenants. Les comprendre, c’est mieux protéger les équipages et préparer les missions de demain.</p>
          <button className="button-primary" onClick={() => setActivePage('explore')}>Explorer la recherche <ArrowRight size={15} /></button>
          <div className="feature-index"><span>01</span><span className="index-line" /><span>RECHERCHE EN MICROGRAVITÉ</span></div>
        </div>
        <div className="feature-image" style={{ backgroundImage: articles[0]?.image ? `linear-gradient(180deg, transparent 55%, rgba(4, 23, 51, .66)), url("${articles[0].image}")` : undefined }}>
          {!articles[0]?.image && <div className="flame-scene"><span className="scene-orbit orbit-one" /><span className="scene-orbit orbit-two" /><span className="scene-core"><i /></span><span className="scene-grid" /></div>}
          <div className="image-label"><span>EXPÉRIENCE DE COMBUSTION</span><span>ISS · ORBITE TERRESTRE</span></div>
          <span className="image-coordinate">45° N / 122° W</span>
        </div>
      </section>

      <ResearchInsights />
    </>
  );
}

function ResearchInsights() {
  return <section className="research-section">
    <div className="research-heading"><div><span className="eyebrow"><span /> COMPORTEMENT DU FEU</span><h2>Quand la gravité disparaît, la flamme change.</h2></div><span className="chart-context">MICROGRAVITÉ · ISS</span></div>
    <div className="science-stats">
      <article className="science-stat"><span className="stat-icon coral"><Flame size={17} /></span><div className="stat-value">≈ 0</div><h3>Convection naturelle</h3><p>Les gaz chauds ne montent presque plus.</p></article>
      <article className="science-stat"><span className="stat-icon blue"><Compass size={17} /></span><div className="stat-value">360°</div><h3>Diffusion autour de la flamme</h3><p>L’oxygène se répartit dans toutes les directions.</p></article>
      <article className="science-stat"><span className="stat-icon green"><Rocket size={17} /></span><div className="stat-value">2</div><h3>Modes de transfert</h3><p>Convection et diffusion, en proportions différentes.</p></article>
    </div>
    <div className="chart-grid">
      <TrendChart
        title="Le transport des gaz"
        subtitle="En microgravité, la convection s’efface."
        axis="Intensité relative"
        variant="transport"
        series={[
          { name: 'Convection · Terre', className: 'earth' },
          { name: 'Convection · microgravité', className: 'microgravity' },
          { name: 'Diffusion moléculaire', className: 'diffusion' },
        ]}
      />
      <TrendChart
        title="Température autour de la flamme"
        subtitle="Le profil devient plus diffus en microgravité."
        axis="Température relative"
        variant="temperature"
        series={[
          { name: 'Terre', className: 'earth' },
          { name: 'Microgravité', className: 'microgravity' },
        ]}
      />
    </div>
    <p className="chart-disclaimer">Courbes schématiques pour illustrer les tendances; les valeurs varient selon le combustible et l’expérience.</p>
  </section>;
}

function TrendChart({ title, subtitle, axis, variant, series }) {
  const transport = variant === 'transport';
  return <article className="chart-card">
    <div className="chart-card-heading"><div><h3>{title}</h3><p>{subtitle}</p></div><span className="chart-tag">SCHÉMA</span></div>
    <svg className="science-chart" viewBox="0 0 620 260" role="img" aria-label={`${title}, courbes schématiques`}>
      <text className="chart-axis-title" x="17" y="125" transform="rotate(-90 17 125)">{axis}</text>
      {[0, 1, 2, 3, 4].map((line) => {
        const y = 24 + line * 42;
        return <g key={line}><line className="chart-gridline" x1="62" y1={y} x2="592" y2={y} /><text className="chart-tick" x="50" y={y + 4} textAnchor="end">{100 - line * 25}</text></g>;
      })}
      <line className="chart-axis" x1="62" y1="24" x2="62" y2="192" />
      <line className="chart-axis" x1="62" y1="192" x2="592" y2="192" />
      <text className="chart-tick" x="62" y="211" textAnchor="middle">0</text>
      <text className="chart-tick" x="327" y="211" textAnchor="middle">50</text>
      <text className="chart-tick" x="592" y="211" textAnchor="middle">100</text>
      <text className="chart-x-title" x="327" y="237" textAnchor="middle">{transport ? 'Position relative autour de la flamme' : 'Position relative dans la flamme'}</text>
      {transport ? <>
        <path className="chart-line earth" d="M62 72 C120 82 155 91 208 111 S292 140 327 150 S430 170 485 178 S555 184 592 187" />
        <path className="chart-line microgravity" d="M62 186 C150 187 240 188 327 188 S500 189 592 189" />
        <path className="chart-line diffusion" d="M62 184 C125 166 165 142 208 132 S288 119 327 124 S405 145 455 159 S545 178 592 184" />
      </> : <>
        <path className="chart-line earth" d="M62 181 C110 166 148 137 194 98 S270 47 310 49 S386 82 425 119 S520 164 592 181" />
        <path className="chart-line microgravity" d="M62 183 C118 168 160 148 210 123 S290 91 330 94 S412 123 457 151 S545 174 592 184" />
      </>}
    </svg>
    <div className="chart-legend">{series.map((item) => <span key={item.name}><i className={item.className} />{item.name}</span>)}</div>
  </article>;
}

function ChatPage({ messages, draft, setDraft, sendMessage }) {
  return (
    <section className="chat-workspace">
      <div className={`chat-stream ${messages.length === 0 ? 'is-empty' : ''}`} aria-live="polite">
        {messages.length === 0 ? <div className="chat-welcome"><span className="chat-welcome-mark"><Sparkles size={19} /></span><h1>Que souhaitez-vous explorer ?</h1><p>Posez une question sur le feu en microgravité.</p></div> : messages.map((message, index) => <div className={`message-row ${message.role}`} key={`${message.time}-${index}`}>
          {message.role === 'assistant' && <div className="message-avatar"><span className="nasa-mark nasa-mark-mini"><span>NASA</span><i /></span></div>}
          <div className="message-content"><div className="message-bubble">{message.text}</div><span className="message-time">{message.time}{message.role === 'user' && <Check size={12} />}</span></div>
        </div>)}
      </div>
      <div className="chat-dock">
        {messages.length === 0 && <div className="chat-suggestions">{['Pourquoi les flammes deviennent-elles sphériques ?', 'Comment le feu se propage-t-il dans l’espace ?'].map((question) => <button key={question} onClick={() => { setDraft(question); document.querySelector('.chat-input')?.focus(); }}>{question}<ArrowUpRight size={13} /></button>)}</div>}
        <form className="chat-composer" onSubmit={sendMessage}>
          <button className="icon-button attach-button" type="button" aria-label="Joindre un document"><Paperclip size={18} /></button>
          <textarea className="chat-input" rows="1" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Posez une question" aria-label="Votre question" />
          <button className="send-button" type="submit" aria-label="Envoyer"><Send size={16} /></button>
        </form>
        <div className="chat-disclaimer">Les réponses peuvent contenir des erreurs. Vérifiez les informations importantes.</div>
      </div>
    </section>
  );
}

function LibraryPage({ activePage, copy, searchQuery, setSearchQuery, articleFilter, setArticleFilter, articles, savedArticles, toggleSaved }) {
  const filters = ['Tous', 'Articles', 'Actualités', 'Recherche'];
  return (
    <>
      <PageHeading eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle} />
      {activePage === 'explore' && <section className="topic-strip">{topics.map((topic, index) => <button className="topic-card" key={topic.label} onClick={() => { setArticleFilter(index === 1 ? 'Recherche' : 'Tous'); document.querySelector('.library-search')?.focus(); }}><span className={`topic-mark ${topic.color}`}>{['01', '02', '03'][index]}</span><span><strong>{topic.label}</strong><small>{topic.count}</small></span><ArrowUpRight size={16} /></button>)}</section>}
      <section className="library-tools"><label className="search-field"><Search size={17} /><input className="library-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Rechercher un article, un sujet, une actualité…" /><kbd>⌘ K</kbd></label><div className="filter-tabs" role="group" aria-label="Filtrer par type">{filters.map((filter) => <button key={filter} className={articleFilter === filter ? 'active' : ''} onClick={() => setArticleFilter(filter)}>{filter}{filter === 'Tous' && <span>{articles.length}</span>}</button>)}</div></section>
      <div className="library-heading"><div><span className="eyebrow">{activePage === 'explore' ? 'SÉLECTION POUR VOUS' : 'LES DERNIÈRES ACTUALITÉS'}</span><h2>{searchQuery ? 'Résultats de recherche' : activePage === 'explore' ? 'Parcours de recherche' : 'Actualités & découvertes'}</h2></div><span>{articles.length} RESSOURCES</span></div>
      <section className="article-list">{articles.length ? articles.map((article, index) => <ArticleRow key={article.title} article={article} index={index} saved={savedArticles.includes(article.title)} onSave={() => toggleSaved(article.title)} />) : <div className="empty-state"><Search size={23} /><strong>Aucun résultat</strong><span>Essayez un autre terme ou changez de filtre.</span></div>}</section>
      <div className="library-footnote"><span><BookOpen size={14} /> Ressources publiques de la NASA</span><span>Dernière mise à jour · 2025 <ExternalLink size={13} /></span></div>
    </>
  );
}

function ArticleRow({ article, index, saved, onSave }) {
  return <article className="article-row"><div className={`article-thumb thumb-${index % 3}`} style={article.image ? { backgroundImage: `url("${article.image}")` } : undefined}>{!article.image && <span className="thumb-flame"><i /></span>}<span className="thumb-index">0{index + 1}</span></div><div className="article-info"><div className="article-category"><span />{article.category.toUpperCase()} <span className="category-separator">/</span> NASA</div><h3>{article.title}</h3><p>{article.description}</p><div className="article-meta"><span>NASA</span><i /><span>{article.date}</span></div></div><div className="article-actions"><button className={`save-button ${saved ? 'saved' : ''}`} aria-label={saved ? 'Retirer des favoris' : 'Enregistrer'} onClick={onSave}>{saved ? <Check size={15} /> : <BookOpen size={15} />}</button><button className="read-button" onClick={() => window.open('https://www.nasa.gov/', '_blank', 'noopener,noreferrer')}>Lire l’article <ArrowUpRight size={13} /></button></div><ChevronRight className="article-chevron" size={16} /></article>;
}

function ProfilePage({ profile, setProfile, editing, setEditing }) {
  const [draftProfile, setDraftProfile] = useState(profile);
  function saveProfile(event) {
    event.preventDefault();
    setProfile(draftProfile);
    setEditing(false);
  }
  return <>
    <PageHeading eyebrow="ESPACE PERSONNEL" title="Votre profil." subtitle="Retrouvez vos informations et vos ressources enregistrées." />
    <section className="profile-layout"><div className="profile-card"><button className="profile-edit-button" aria-label="Modifier le profil" onClick={() => { setDraftProfile(profile); setEditing(true); }}><Pencil size={15} /></button><div className="profile-orbit"><span className="avatar avatar-large">AM</span><i className="orbit-dot" /></div><h2>{profile.name}</h2><div className="profile-email"><Mail size={15} />{profile.email}</div><p className="profile-bio">{profile.bio}</p><div className="profile-tags"><span><Rocket size={13} /> EXPLORATION SPATIALE</span><span><Flame size={13} /> COMBUSTION</span></div><div className="profile-stats"><div><strong>04</strong><span>SUJETS SUIVIS</span></div><div><strong>12</strong><span>ARTICLES LUS</span></div><div><strong>03</strong><span>ENREGISTRÉS</span></div></div></div><aside className="profile-side"><div className="side-note"><span className="side-note-icon"><Sparkles size={17} /></span><div><span>VOTRE ESPACE</span><h3>Curiosité sans frontières.</h3><p>Vos centres d’intérêt façonnent les découvertes qui vous sont proposées.</p></div></div><div className="interest-list"><div className="interest-heading"><h3>Vos centres d’intérêt</h3><button onClick={() => setEditing(true)}><Pencil size={13} /> Modifier</button></div>{topics.map((topic, index) => <div className="interest-row" key={topic.label}><span className={`interest-number ${topic.color}`}>0{index + 1}</span><span>{topic.label}</span><ArrowUpRight size={14} /></div>)}</div></aside></section>
    {editing && <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}><form className="edit-modal" onSubmit={saveProfile}><div className="modal-heading"><div><span className="eyebrow">ESPACE PERSONNEL</span><h2>Modifier le profil</h2></div><button className="icon-button" type="button" aria-label="Fermer" onClick={() => setEditing(false)}><X size={18} /></button></div><label>Nom complet<input value={draftProfile.name} onChange={(event) => setDraftProfile({ ...draftProfile, name: event.target.value })} /></label><label>Adresse e-mail<input type="email" value={draftProfile.email} onChange={(event) => setDraftProfile({ ...draftProfile, email: event.target.value })} /></label><label>À propos<textarea rows="3" value={draftProfile.bio} onChange={(event) => setDraftProfile({ ...draftProfile, bio: event.target.value })} /></label><div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setEditing(false)}>Annuler</button><button className="button-primary" type="submit">Enregistrer <Check size={15} /></button></div></form></div>}
  </>;
}

function SettingsPage() {
  const [enabled, setEnabled] = useState({ updates: true, digest: false, research: true });
  const options = [{ key: 'updates', title: 'Actualités de recherche', text: 'Recevoir les nouvelles publications NASA.' }, { key: 'digest', title: 'Résumé hebdomadaire', text: 'Un aperçu des découvertes chaque semaine.' }, { key: 'research', title: 'Nouveaux sujets', text: 'Être informé des parcours à explorer.' }];
  return <><PageHeading eyebrow="PRÉFÉRENCES" title="Vos paramètres." subtitle="Choisissez les actualités et découvertes que vous souhaitez suivre." /><section className="settings-panel"><div className="settings-section-title"><div><Settings size={17} /><h2>Notifications</h2></div><span>PRÉFÉRENCES DE RÉCEPTION</span></div>{options.map((option) => <div className="setting-row" key={option.key}><div><strong>{option.title}</strong><span>{option.text}</span></div><button role="switch" aria-checked={enabled[option.key]} className={`toggle ${enabled[option.key] ? 'on' : ''}`} onClick={() => setEnabled({ ...enabled, [option.key]: !enabled[option.key] })}><i /></button></div>)}<div className="settings-help"><span><CircleHelp size={16} /> Besoin d’aide ?</span><a href="https://www.nasa.gov/contact/" target="_blank" rel="noreferrer">Contacter la NASA <ArrowUpRight size={13} /></a></div></section></>;
}

export default App;