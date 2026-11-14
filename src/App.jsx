import { useEffect, useMemo, useState } from 'react';
import {
  Menu, Moon, Settings, Sun, UserRound,
} from 'lucide-react';
import { fallbackArticles, navigation, sectionCopy } from './data/constants.js';
import { readString, writeString, STORAGE_KEYS } from './lib/storage.js';
import { profileInitials } from './lib/format.js';
import { resolveUrl } from './lib/apiClient.js';
import { useNasaArticles } from './lib/useNasaArticles.js';
import { AuthProvider, useAuth } from './state/AuthProvider.jsx';
import { ConversationProvider, useConversations } from './state/ConversationProvider.jsx';
import HomePage from './features/home/HomePage.jsx';
import ChatPage from './features/chat/ChatPage.jsx';
import LibraryPage from './features/library/LibraryPage.jsx';
import ProfilePage from './features/profile/ProfilePage.jsx';
import SettingsPage from './features/settings/SettingsPage.jsx';

function Shell() {
  const [activePage, setActivePage] = useState('home');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [articleFilter, setArticleFilter] = useState('Tous');
  const [draft, setDraft] = useState('');
  const [savedArticles, setSavedArticles] = useState([]);
  const [theme, setTheme] = useState(() => (readString(STORAGE_KEYS.theme) === 'dark' ? 'dark' : 'light'));

  const { status, profile } = useAuth();
  const nasaArticles = useNasaArticles();
  const articles = nasaArticles.length ? nasaArticles : fallbackArticles;

  useEffect(() => {
    writeString(STORAGE_KEYS.theme, theme);
  }, [theme]);

  const { ask } = useConversations();
  const activeCopy = sectionCopy[activePage] ?? sectionCopy.home;

  const filteredArticles = useMemo(() => articles.filter((article) => {
    const matchesFilter = articleFilter === 'Tous' || article.category === articleFilter;
    const searchable = `${article.title} ${article.description}`.toLocaleLowerCase('fr');
    return matchesFilter && searchable.includes(searchQuery.toLocaleLowerCase('fr'));
  }), [articles, articleFilter, searchQuery]);

  const toggleSaved = (title) => {
    setSavedArticles((current) => (current.includes(title)
      ? current.filter((item) => item !== title)
      : [...current, title]));
  };

  const avatar = resolveUrl(profile?.avatar_url);
  const greeting = profile ? `Bonjour, ${profile.display_name}` : 'Bienvenue, explorateur';

  const goTo = (page) => {
    setActivePage(page);
    setMobileNavOpen(false);
  };

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="nav-caption">VOTRE ESPACE</div>
        <nav className="main-nav" aria-label="Navigation principale">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-link ${activePage === id ? 'active' : ''}`}
              onClick={() => goTo(id)}
              aria-current={activePage === id ? 'page' : undefined}
            >
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-link settings-link ${activePage === 'settings' ? 'active' : ''}`}
            onClick={() => goTo('settings')}
            aria-current={activePage === 'settings' ? 'page' : undefined}
          >
            <Settings size={17} /><span>Paramètres</span>
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <button className="mobile-scrim" aria-label="Fermer le menu" onClick={() => setMobileNavOpen(false)} />
      )}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Ouvrir le menu" onClick={() => setMobileNavOpen(true)}>
            <Menu size={20} />
          </button>
          <a
            className="brand topbar-brand"
            href="#home"
            onClick={(event) => { event.preventDefault(); goTo('home'); }}
          >
            <span className="nasa-mark" aria-hidden="true"><span>NASA</span><i /></span>
            <span className="brand-copy">
              <strong>NASA AI Assistant</strong>
              <small>Explorez l’univers des connaissances NASA</small>
            </span>
          </a>
          <div className="topbar-actions">
            <button
              className="icon-button theme-button"
              aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
              title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="user-chip research-chip" onClick={() => goTo('profile')}>
              {avatar
                ? <img className="avatar avatar-small user-avatar-image" src={avatar} alt="" />
                : profile
                  ? <span className="avatar avatar-small">{profileInitials(profile.display_name)}</span>
                  : <UserRound size={15} />}
              <span>
                {status === 'loading'
                  ? 'Vérification…'
                  : profile?.display_name ?? 'Créer un compte'}
              </span>
            </button>
          </div>
        </header>

        <div className={`page-content ${activePage === 'chat' ? 'chat-page-content' : ''}`}>
          {activePage === 'home' && (
            <HomePage
              setActivePage={goTo}
              articles={articles}
              draft={draft}
              setDraft={setDraft}
              ask={ask}
              greeting={greeting}
            />
          )}
          {activePage === 'chat' && (
            <ChatPage draft={draft} setDraft={setDraft} onRequestSignIn={() => goTo('profile')} />
          )}
          {activePage === 'explore' && (
            <LibraryPage
              activePage={activePage}
              copy={activeCopy}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              articleFilter={articleFilter}
              setArticleFilter={setArticleFilter}
              articles={filteredArticles}
              savedArticles={savedArticles}
              toggleSaved={toggleSaved}
            />
          )}
          {activePage === 'profile' && <ProfilePage />}
          {activePage === 'settings' && <SettingsPage />}
        </div>
        {activePage !== 'chat' && (
          <footer className="page-footer">
            <span>TechLabs</span>
            <span>Explorer la science, préparer demain</span>
          </footer>
        )}
      </main>
    </div>
  );
}

/** L'Accueil et le Chat partagent le même store conversationnel. */
export default function App() {
  return (
    <AuthProvider>
      <ConversationProvider>
        <Shell />
      </ConversationProvider>
    </AuthProvider>
  );
}