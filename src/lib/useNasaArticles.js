import { useEffect, useState } from 'react';
import { fallbackArticles } from '../data/constants.js';

const NASA_IMAGE_SEARCH = 'https://images-api.nasa.gov/search?q=SoFIE%20Growth%20Extinction%20Limits&media_type=image&page_size=8';

/**
 * Illustrations d'accueil issues de l'API publique NASA.
 *
 * L'échec est silencieux : les visuels de repli (dégradés) restent affichés.
 * À terme, cet appel sera proxifié par le backend (contrôle du quota, cache).
 */
export function useNasaArticles() {
  const [articles, setArticles] = useState(fallbackArticles);

  useEffect(() => {
    const controller = new AbortController();

    fetch(NASA_IMAGE_SEARCH, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('NASA image search unavailable'))))
      .then((data) => {
        const items = data.collection?.items ?? [];
        const images = items.flatMap((item) => {
          const href = item.links?.find((link) => link.render === 'image' || link.rel === 'preview')?.href;
          return href
            ? [{
              href,
              title: item.data?.[0]?.title,
              description: item.data?.[0]?.description,
              url: item.href,
            }]
            : [];
        });
        if (!images.length) return;

        const flameImage = images.find((image) => image.href.includes('jsc2023e002281'));
        const ordered = flameImage ? [flameImage, ...images.filter((image) => image !== flameImage)] : images;

        setArticles((current) => current.map((article, index) => ({
          ...article,
          image: ordered[index % ordered.length].href,
          url: ordered[index % ordered.length].url ?? article.url,
        })));
      })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  return articles;
}