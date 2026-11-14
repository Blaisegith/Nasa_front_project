import {
  ArrowUpRight, BookOpen, Check, ChevronRight, Search,
} from 'lucide-react';
import PageHeading from '../../components/PageHeading.jsx';
import { articleFilters, topics } from '../../data/constants.js';

function ArticleRow({ article, index, saved, onSave }) {
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
          <span />{article.category.toUpperCase()} <span className="category-separator">/</span> NASA
        </div>
        <h3>{article.title}</h3>
        <p>{article.description}</p>
        <div className="article-meta"><span>NASA</span><i /><span>{article.date}</span></div>
      </div>
      <div className="article-actions">
        <button
          className={`save-button ${saved ? 'saved' : ''}`}
          aria-label={saved ? 'Retirer des favoris' : 'Enregistrer'}
          onClick={onSave}
        >
          {saved ? <Check size={15} /> : <BookOpen size={15} />}
        </button>
        <button
          className="read-button"
          onClick={() => window.open(article.url ?? 'https://www.nasa.gov/', '_blank', 'noopener,noreferrer')}
        >
          Lire l’article <ArrowUpRight size={13} />
        </button>
      </div>
      <ChevronRight className="article-chevron" size={16} />
    </article>
  );
}

export default function LibraryPage({
  activePage,
  copy,
  searchQuery,
  setSearchQuery,
  articleFilter,
  setArticleFilter,
  articles,
  savedArticles,
  toggleSaved,
}) {
  return (
    <>
      <PageHeading eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle} />

      {activePage === 'explore' && (
        <section className="topic-strip">
          {topics.map((topic, index) => (
            <button
              className="topic-card"
              key={topic.label}
              onClick={() => {
                setArticleFilter(index === 1 ? 'Recherche' : 'Tous');
                document.querySelector('.library-search')?.focus();
              }}
            >
              <span className={`topic-mark ${topic.color}`}>{['01', '02', '03'][index]}</span>
              <span><strong>{topic.label}</strong><small>{topic.count}</small></span>
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
            placeholder="Rechercher un article, un sujet, une actualité…"
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="filter-tabs" role="group" aria-label="Filtrer par type">
          {articleFilters.map((filter) => (
            <button
              key={filter}
              className={articleFilter === filter ? 'active' : ''}
              onClick={() => setArticleFilter(filter)}
            >
              {filter}{filter === 'Tous' && <span>{articles.length}</span>}
            </button>
          ))}
        </div>
      </section>

      <div className="library-heading">
        <div>
          <span className="eyebrow">{activePage === 'explore' ? 'SÉLECTION POUR VOUS' : 'LES DERNIÈRES ACTUALITÉS'}</span>
          <h2>{searchQuery ? 'Résultats de recherche' : activePage === 'explore' ? 'Parcours de recherche' : 'Actualités & découvertes'}</h2>
        </div>
        <span>{articles.length} RESSOURCES</span>
      </div>

      <section className="article-list">
        {articles.length ? articles.map((article, index) => (
          <ArticleRow
            key={article.title}
            article={article}
            index={index}
            saved={savedArticles.includes(article.title)}
            onSave={() => toggleSaved(article.title)}
          />
        )) : (
          <div className="empty-state"><Search size={23} /><strong>Aucun résultat</strong><span>Essayez un autre terme ou changez de filtre.</span></div>
        )}
      </section>

      <div className="library-footnote">
        <span><BookOpen size={14} /> Ressources publiques de la NASA</span>
        <span>Dernière mise à jour · 2025 <ArrowUpRight size={13} /></span>
      </div>
    </>
  );
}