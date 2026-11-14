import { CircleHelp, Compass, House, UserRound } from 'lucide-react';

export const navigation = [
  { id: 'home', label: 'Accueil', icon: House },
  { id: 'chat', label: 'Chat', icon: CircleHelp },
  { id: 'explore', label: 'Explorer', icon: Compass },

  { id: 'profile', label: 'Profil', icon: UserRound },
];

export const sectionCopy = {
  home: { eyebrow: 'CENTRE DE RECHERCHE Â· ISS', title: 'Le feu, autrement.', subtitle: 'Comprendre la combustion en microgravitÃ© pour mieux prÃ©parer les missions de demain.' },
  chat: { eyebrow: 'ASSISTANT DE RECHERCHE', title: 'Une question ?', subtitle: 'Explorez les recherches NASA sur la combustion dans lâ€™espace.' },
  explore: { eyebrow: 'PARCOURS THÃ‰MATIQUES', title: 'Suivez votre curiositÃ©.', subtitle: 'Parcourez les sujets qui font avancer la sÃ©curitÃ© spatiale.' },
  profile: { eyebrow: 'ESPACE PERSONNEL', title: 'Votre profil.', subtitle: 'GÃ©rez vos informations et vos centres dâ€™intÃ©rÃªt.' },
  settings: { eyebrow: 'PRÃ‰FÃ‰RENCES', title: 'Vos paramÃ¨tres.', subtitle: 'Choisissez les actualitÃ©s et dÃ©couvertes que vous souhaitez suivre.' },
};

export const topics = [
  { label: 'Combustion', count: '12 ressources', color: 'blue' },
  { label: 'SÃ©curitÃ© Ã  bord', count: '8 ressources', color: 'coral' },
  { label: 'Station spatiale', count: '6 ressources', color: 'green' },
];

export const fallbackArticles = [
  {
    title: 'Ã‰tude de la combustion des flammes en microgravitÃ©',
    description: 'Comment les flammes se propagent et produisent de la suie loin de la gravitÃ© terrestre.',
    date: '12 avr. 2025',
    category: 'Articles',
    image: null,
  },
  {
    title: 'La recherche sur le feu en microgravitÃ© avance Ã  bord de lâ€™ISS',
    description: 'Les expÃ©riences menÃ©es sur la Station spatiale apportent de nouvelles donnÃ©es sur la combustion.',
    date: '28 mars 2025',
    category: 'ActualitÃ©s',
    image: null,
  },
  {
    title: 'Microgravity Fire Safety : nouvelles perspectives',
    description: 'Des recherches pour amÃ©liorer la sÃ©curitÃ© incendie des futurs vaisseaux spatiaux.',
    date: '15 fÃ©vr. 2025',
    category: 'Recherche',
    image: null,
  },
];

export const articleFilters = ['Tous', 'Articles', 'ActualitÃ©s', 'Recherche'];

export const chatSuggestions = [
  'Pourquoi les flammes deviennent-elles sphÃ©riques ?',
  'Comment le feu se propage-t-il dans lâ€™espace ?',
];

export const settingsOptions = [
  { key: 'updates', title: 'ActualitÃ©s de recherche', text: 'Recevoir les nouvelles publications NASA.' },
  { key: 'digest', title: 'RÃ©sumÃ© hebdomadaire', text: 'Un aperÃ§u des dÃ©couvertes chaque semaine.' },
  { key: 'research', title: 'Nouveaux sujets', text: 'ÃŠtre informÃ© des parcours Ã  explorer.' },
];

/**
 * RÃ©ponses de dÃ©monstration, utilisÃ©es uniquement hors ligne (aucune session
 * serveur). Elles ne sont jamais prÃ©sentÃ©es comme des rÃ©ponses du RAG.
 */
export function offlineReply(text) {
  const normalized = text.toLocaleLowerCase('fr');
  if (normalized.includes('flamme') || normalized.includes('forme')) {
    return 'En microgravitÃ©, la convection naturelle disparaÃ®t : les gaz chauds ne montent plus. La flamme prend une forme presque sphÃ©rique et lâ€™oxygÃ¨ne arrive surtout par diffusion. Elle brÃ»le souvent plus lentement, Ã  une tempÃ©rature diffÃ©rente, ce qui aide les chercheurs Ã  mieux comprendre la combustion.';
  }
  if (normalized.includes('sÃ©curitÃ©') || normalized.includes('danger') || normalized.includes('risque')) {
    return 'Ã€ bord de lâ€™ISS, la prÃ©vention repose sur la dÃ©tection prÃ©coce, la limitation des matÃ©riaux inflammables et des procÃ©dures dâ€™extinction dÃ©diÃ©es. Les expÃ©riences de combustion aident Ã  affiner ces protocoles pour les futures missions, oÃ¹ un Ã©quipage sera plus loin de la Terre.';
  }
  return 'Les expÃ©riences de la NASA en microgravitÃ© permettent dâ€™isoler des phÃ©nomÃ¨nes que la gravitÃ© masque sur Terre. En Ã©tudiant la forme des flammes, leur propagation et la production de suie, les Ã©quipes amÃ©liorent Ã  la fois la science de la combustion et la sÃ©curitÃ© des astronautes.';
}