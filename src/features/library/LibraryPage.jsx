import {
  ArrowUpRight, BookOpen, Check, ChevronRight, Search,
} from 'lucide-react';
import PageHeading from '../../components/PageHeading.jsx';
import { articleFilterKeys, topics } from '../../data/constants.js';
import { decodeText } from '../../lib/format.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';

const FILTER_KEYS = {
  all: 'library.filterAll',
  articles: 'library.filterArticles',
  news: 'library.filterNews',
  research: 'library.filterResearch',
};

function ArticleRow({
  article, index, saved, onSave, saveLabel, unsaveLabel, readLabel,
}) {
  const title = article.title;
  const description = article.description;
  const category = article.categoryLabel;

  return (
    <article className="article-row">
      <div
        className={`article-thumb thumb-${index % 3}`}
        style={article.image ? { backgroundImage: `url("${article.image}")` } : undefined}
      >
        {!article.image && <span className="thumb-flame"><i /></span>}
        <span className="thumb-index">0{index + 1}</span>
      </div>
      <div className="article-info">
        <div className="article-category">
          <span />
          {category}
          <span className="category-separator">/</span>
          NASA
        </div>
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="article-meta"><span>NASA</span><i /><span>{article.date}</span></div>
      </div>
      <div className="article-actions">
        <button
          className={`save-button ${saved ? 'saved' : ''}`}
          aria-label={saved ? unsaveLabel : saveLabel}
          onClick={onSave}
        >
          {saved ? <Check size={15} /> : <BookOpen size={15} />}
        </button>
        <button
          className="read-button"
          onClick={() => window.open(article.url ?? 'https://www.nasa.gov/', '_blank', 'noopener,noreferrer')}
        >
          {readLabel} <ArrowUpRight size={13} />
        </button>
      </div>
      <ChevronRight className="article-chevron" size={16} />
    </article>
  );
}

export default function LibraryPage({
  activePage,
  searchQuery,
  setSearchQuery,
  articleFilter,
  setArticleFilter,
  articles,
  savedArticles,
  toggleSaved,
}) {
  const { t, locale } = useI18n();

  const headingEyebrow = searchQuery
    ? t('library.selection')
    : activePage === 'explore'
      ? t('library.exploreTitle')
      : t('library.latest');

  const headingTitle = searchQuery
    ? t('library.resultsTitle')
    : activePage === 'explore'
      ? t('library.title')
      : t('library.newsTitle');

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
        day: '2-digit', month: 'long', year: 'numeric',
      }).format(date);
  };

  return (
    <>
      <PageHeading eyebrow={t('library.eyebrow')} title={t('library.title')} subtitle={t('library.subtitle')} />

      {activePage === 'explore' && (
        <section className="topic-strip">
          {topics.map((topic, index) => (
            <button
              className="topic-card"
              key={topic.id}
              onClick={() => {
                setArticleFilter(index === 1 ? 'research' : 'all');
                document.querySelector('.library-search')?.focus();
              }}
            >
              <span className={`topic-mark ${topic.color}`}>{['01', '02', '03'][index]}</span>
              <span>
                <strong>{t(`topics.${topic.id}`)}</strong>
                <small>
                  {topic.resources}
                  {' '}
                  {t('common.resources')}
                </small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
        </section>
      )}

      <section className="library-tools">
        <label className="search-field">
          <Search size={17} />
          <input
            className="library-search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('library.searchPlaceholder')}
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="filter-tabs" role="group" aria-label={t('library.filterAll')}>
          {articleFilterKeys.map((filter) => (
            <button
              key={filter}
              className={articleFilter === filter ? 'active' : ''}
              onClick={() => setArticleFilter(filter)}
              aria-pressed={articleFilter === filter}
            >
              {t(FILTER_KEYS[filter] ?? filter)}
              {filter === 'all' && <span>{articles.length}</span>}
            </button>
          ))}
        </div>
      </section>

      <div className="library-heading">
        <div>
          <span className="eyebrow">{headingEyebrow}</span>
          <h2>{headingTitle}</h2>
        </div>
        <span>{t('library.resourcesCount', { count: articles.length })}</span>
      </div>

      <section className="article-list">
        {articles.length ? articles.map((article, index) => {
          const title = article.titleKey ? t(article.titleKey) : decodeText(article.title ?? '');
          return (
            <ArticleRow
              key={article.id ?? title}
              article={{
                ...article,
                title,
                description: article.textKey ? t(article.textKey) : decodeText(article.description ?? ''),
                date: formatDate(article.date),
                categoryLabel: article.category === 'news'
                  ? t('articles.categoryNews')
                  : article.category === 'research'
                    ? t('articles.categoryResearch')
                    : t('articles.categoryArticles'),
              }}
              index={index}
              saved={savedArticles.includes(title)}
              onSave={() => toggleSaved(title)}
              savedLabel={t('library.save')}
              unsaveLabel={t('library.unsave')}
              readLabel={t('library.read')}
            />
          );
        }) : (
          <div className="empty-state">
            <Search size={23} />
            <strong>{t('library.emptyTitle')}</strong>
            <span>{t('library.emptyText')}</span>
          </div>
        )}
      </section>

      <div className="library-footnote">
        <span><BookOpen size={14} /> {t('library.footnote')}</span>
        <span>{t('library.updated')} <ArrowUpRight size={13} /></span>
      </div>
    </>
  );
}