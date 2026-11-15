import { useEffect, useMemo, useState } from 'react';
import {
  Globe, Menu, Moon, Settings, Sun, Users,
} from 'lucide-react';
import {
  PLATFORM_NAME, TEAM_NAME, fallbackArticles, navigation,
} from './data/constants.js';
import { readString, writeString, STORAGE_KEYS } from './lib/storage.js';
import { decodeText } from './lib/format.js';
import Logo from './components/Logo.jsx';
import UserMenu from './components/UserMenu.jsx';
import { useNasaArticles } from './lib/useNasaArticles.js';
import { AuthProvider, useAuth } from './state/AuthProvider.jsx';
import { ConversationProvider } from './state/ConversationProvider.jsx';
import { I18nProvider, useI18n } from './i18n/I18nProvider.jsx';
import HomePage from './features/home/HomePage.jsx';
import ChatPage from './features/chat/ChatPage.jsx';
import LibraryPage from './features/library/LibraryPage.jsx';
import ProfilePage from './features/profile/ProfilePage.jsx';
import SettingsPage from './features/settings/SettingsPage.jsx';

function LanguageToggle({ compact = false }) {
  const { locale, setLocale } = useI18n();
  return (
    <button
      className={`icon-button language-toggle ${compact ? 'compact' : ''}`}
      onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
      aria-label={`Langue : ${locale === 'fr' ? 'français' : 'anglais'}`}
      title={locale === 'fr' ? 'Passer en anglais' : 'Passer en français'}
    >
      <Globe size={16} />
      <span>{locale.toUpperCase()}</span>
    </button>
  );
}

function Shell() {
  const { t, locale } = useI18n();
  const [activePage, setActivePage] = useState('home');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [articleFilter, setArticleFilter] = useState('all');
  const [draft, setDraft] = useState('');
  const [savedArticles, setSavedArticles] = useState([]);
  const [theme, setTheme] = useState(() => (readString(STORAGE_KEYS.theme) === 'dark' ? 'dark' : 'light'));

  const { profile } = useAuth();
  const nasaArticles = useNasaArticles();
  const articles = nasaArticles.length ? nasaArticles : fallbackArticles;

  useEffect(() => {
    writeString(STORAGE_KEYS.theme, theme);
  }, [theme]);

  const filteredArticles = useMemo(() => articles.filter((article) => {
    const matchesFilter = articleFilter === 'all' || article.category === articleFilter;
    const haystack = `${article.titleKey ? t(article.titleKey) : decodeText(article.title ?? '')} `
      + `${article.textKey ? t(article.textKey) : decodeText(article.description ?? '')}`
      .toLocaleLowerCase(locale);
    return matchesFilter && haystack.includes(searchQuery.toLocaleLowerCase());
  }), [articles, articleFilter, searchQuery, t, locale]);

  const toggleSaved = (title) => {
    setSavedArticles((current) => (current.includes(title)
      ? current.filter((item) => item !== title)
      : [...current, title]));
  };

  const greeting = profile
    ? t('home.greeting', { name: profile.display_name })
    : t('home.welcome');

  const goTo = (page) => {
    setActivePage(page);
    setMobileNavOpen(false);
  };

  return (
    <div className="app-shell" data-theme={theme}>
      <a className="skip-link" href="#contenu">{t('nav.skipToContent')}</a>

      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <a
          className="sidebar-brand"
          href="#home"
          onClick={(event) => { event.preventDefault(); goTo('home'); }}
        >
          <span className="logo-lockup-mark"><Logo size="md" /></span>
          <span className="brand-copy">
            <strong>{PLATFORM_NAME}</strong>
            <small>{t('topbar.tagline')}</small>
          </span>
        </a>
        <div className="nav-caption">{t('nav.workspace')}</div>
        <nav className="main-nav" aria-label={t('nav.main')}>
          {navigation.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              className={`nav-link ${activePage === id ? 'active' : ''}`}
              onClick={() => goTo(id)}
              aria-current={activePage === id ? 'page' : undefined}
            >
              <Icon size={17} strokeWidth={1.8} /><span>{t(labelKey)}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-team" title={t('footer.teamTitle', { team: TEAM_NAME })}>
            <span className="sidebar-team-mark" aria-hidden="true"><Users size={15} /></span>
            <span className="sidebar-team-copy">
              <small>{t('footer.teamLabel')}</small>
              <strong>{TEAM_NAME}</strong>
            </span>
          </div>
          <button
            className={`nav-link settings-link ${activePage === 'settings' ? 'active' : ''}`}
            onClick={() => goTo('settings')}
            aria-current={activePage === 'settings' ? 'page' : undefined}
          >
            <Settings size={17} /><span>{t('nav.settings')}</span>
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <button className="mobile-scrim" aria-label={t('nav.closeMenu')} onClick={() => setMobileNavOpen(false)} />
      )}

      <main className="main-area" id="contenu">
        <header className="topbar">
          <div className="topbar-inner">
            <button className="icon-button menu-button" aria-label={t('nav.openMenu')} onClick={() => setMobileNavOpen(true)}>
              <Menu size={20} />
            </button>
            <a
              className="topbar-brand"
              href="#home"
              onClick={(event) => { event.preventDefault(); goTo('home'); }}
            >
              <span className="logo-lockup-mark"><Logo size="sm" /></span>
              <span className="brand-copy">
                <strong>{PLATFORM_NAME}</strong>
                <small>{t('topbar.tagline')}</small>
              </span>
            </a>
            <div className="topbar-actions">
              <span
                className="team-badge"
                title={t('footer.teamTitle', { team: TEAM_NAME })}
              >
                <Users size={13} aria-hidden="true" />
                {TEAM_NAME}
              </span>
              <LanguageToggle compact />
              <button
                className="icon-button theme-button"
                aria-label={theme === 'dark' ? t('topbar.toLight') : t('topbar.toDark')}
                title={theme === 'dark' ? t('topbar.toLight') : t('topbar.toDark')}
                onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <UserMenu onNavigate={goTo} />
            </div>
          </div>
        </header>

        <div className={`page-content ${activePage === 'chat' ? 'chat-page-content' : ''}`}>
          {activePage === 'home' && (
            <HomePage
              setActivePage={goTo}
              articles={articles}
              draft={draft}
              setDraft={setDraft}
              greeting={greeting}
            />
          )}
          {activePage === 'chat' && (
            <ChatPage draft={draft} setDraft={setDraft} onRequestSignIn={() => goTo('profile')} />
          )}
          {activePage === 'explore' && (
            <LibraryPage
              activePage={activePage}
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
            <span>{PLATFORM_NAME}</span>
            <span className="page-footer-meta">
              <span>{t('topbar.tagline')}</span>
              <span className="page-footer-sep" aria-hidden="true">·</span>
              <strong className="page-footer-team">
                {t('footer.team', { team: TEAM_NAME })}
              </strong>
            </span>
          </footer>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <ConversationProvider>
          <Shell />
        </ConversationProvider>
      </AuthProvider>
    </I18nProvider>
  );
}