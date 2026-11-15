import { CircleHelp, Compass, House, UserRound } from 'lucide-react';

/** Nom officiel de la plateforme — nom propre, non traduit. */
export const PLATFORM_NAME = 'Frame in Freefall AI';

/**
 * Équipe responsable du projet — nom propre, non traduit.
 * Affichée dans le pied de page de toutes les vues et dans les paramètres.
 */
export const TEAM_NAME = 'TECHLABS';

/** Navigation — les libellés sont traduits par `t('nav.*')`. */
export const navigation = [
  { id: 'home', labelKey: 'nav.home', icon: House },
  { id: 'chat', labelKey: 'nav.chat', icon: CircleHelp },
  { id: 'explore', labelKey: 'nav.explore', icon: Compass },

  { id: 'profile', labelKey: 'nav.profile', icon: UserRound },
];

/** Sujets — `resources` est un nombre, l'unité est traduite. */
export const topics = [
  { id: 'combustion', color: 'blue', resources: 12 },
  { id: 'safety', color: 'coral', resources: 8 },
  { id: 'station', color: 'green', resources: 6 },
];

/** Articles de démonstration — textes localisés via `articles.*`. */
export const fallbackArticles = [
  {
    id: 'combustion',
    titleKey: 'articles.combustionTitle',
    textKey: 'articles.combustionText',
    date: '2025-04-12',
    category: 'articles',
  },
  {
    id: 'station',
    titleKey: 'articles.stationTitle',
    textKey: 'articles.stationText',
    date: '2025-03-28',
    category: 'news',
  },
  {
    id: 'safety',
    titleKey: 'articles.safetyTitle',
    textKey: 'articles.safetyText',
    date: '2025-02-15',
    category: 'research',
  },
];

export const articleFilterKeys = ['all', 'articles', 'news', 'research'];

/** Suggestions traduites (le texte scientifique reste identique). */
export const chatSuggestions = {
  fr: [
    'Pourquoi les flammes deviennent-elles sphériques ?',
    'Comment le feu se propage-t-il dans l’espace ?',
  ],
  en: [
    'Why do flames become spherical?',
    'How does fire spread in space?',
  ],
};

export const settingsKeys = [
  { key: 'updates', titleKey: 'settings.updatesTitle', textKey: 'settings.updatesText' },
  { key: 'digest', titleKey: 'settings.digestTitle', textKey: 'settings.digestText' },
  { key: 'research', titleKey: 'settings.researchTitle', textKey: 'settings.researchText' },
];

/**
 * Réponses de démonstration, utilisées uniquement hors ligne (aucune session
 * serveur). Elles ne sont jamais présentées comme des réponses du RAG.
 */
const OFFLINE_REPLIES = {
  fr: {
    flame: 'En microgravité, la convection naturelle disparaît : les gaz chauds ne montent plus. La flamme prend une forme presque sphérique et l’oxygène arrive surtout par diffusion. Elle brûle souvent plus lentement, à une température différente, ce qui aide les chercheurs à mieux comprendre la combustion.',
    safety: 'À bord de l’ISS, la prévention repose sur la détection précoce, la limitation des matériaux inflammables et des procédures d’extinction dédiées. Les expériences de combustion aident à affiner ces protocoles pour les futures missions, où un équipage sera plus loin de la Terre.',
    default: 'Les expériences de la NASA en microgravité permettent d’isoler des phénomènes que la gravité masque sur Terre. En étudiant la forme des flammes, leur propagation et la production de suie, les équipes améliorent à la fois la science de la combustion et la sécurité des astronautes.',
  },
  en: {
    flame: 'In microgravity, natural convection disappears: hot gases no longer rise. The flame takes an almost spherical shape and oxygen arrives mainly by diffusion. It often burns more slowly, at a different temperature, which helps researchers better understand combustion.',
    safety: 'Aboard the ISS, prevention relies on early detection, limiting flammable materials and dedicated extinguishing procedures. Combustion experiments help refine these protocols for future missions, where crews will be farther from Earth.',
    default: 'NASA microgravity experiments make it possible to isolate phenomena that gravity masks on Earth. By studying flame shape, spread and soot production, teams improve both combustion science and astronaut safety.',
  },
};

export function offlineReply(text, locale = 'fr') {
  const normalized = String(text).toLocaleLowerCase(locale === 'en' ? 'en' : 'fr');
  const replies = OFFLINE_REPLIES[locale] ?? OFFLINE_REPLIES.fr;
  if (normalized.includes('flamme') || normalized.includes('flame') || normalized.includes('forme') || normalized.includes('shape')) {
    return replies.flame;
  }
  if (normalized.includes('sécurité') || normalized.includes('saf') || normalized.includes('danger') || normalized.includes('risque')) {
    return replies.safety;
  }
  return replies.default;
}