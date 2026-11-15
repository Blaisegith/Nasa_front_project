/**
 * Formatage des nombres, unités et textes scientifiques.
 *
 * Objectifs :
 *  - ne jamais afficher `1e-7` là où « 1 × 10⁻⁷ » est attendu ;
 *  - ne jamais transformer une valeur en pourcentage par erreur ;
 *  - garder les unités attachées à leur valeur ;
 *  - réparer les textes encodés en pourcent (`%20`, `%C3%A9`) ou en entités HTML,
 *    sans jamais altérer le sens scientifique.
 */

let activeLocale = 'fr-FR';

/** Applique la locale de l'interface (`fr`, `fr-FR`, `en`, `en-US`) aux formateurs. */
export function setActiveLocale(locale) {
  const value = String(locale ?? '').toLowerCase();
  activeLocale = value.startsWith('en') ? 'en-US' : 'fr-FR';
}

export function getActiveLocale() {
  return activeLocale;
}

const SUPERSCRIPT = {
  0: '\u2070', 1: '\u00b9', 2: '\u00b2', 3: '\u00b3', 4: '\u2074',
  5: '\u2075', 6: '\u2076', 7: '\u2077', 8: '\u2078', 9: '\u2079',
  '-': '\u207b', '+': '\u207a',
};

const SUBSCRIPT = {
  0: '\u2080', 1: '\u2081', 2: '\u2082', 3: '\u2083', 4: '\u2084',
  5: '\u2085', 6: '\u2086', 7: '\u2087', 8: '\u2088', 9: '\u2089',
  '-': '\u208b', '+': '\u208a',
};

/** Nombres au format de la locale, sans perte de précision inutile. */
export function formatNumber(value, { maximumFractionDigits = 4, minimumFractionDigits = 0 } = {}) {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(numeric)) return String(value ?? '');

  const absolute = Math.abs(numeric);
  if (absolute !== 0 && (absolute < 1e-3 || absolute >= 1e7)) {
    return toScientificString(numeric);
  }

  return new Intl.NumberFormat(activeLocale, {
    maximumFractionDigits,
    minimumFractionDigits,
    useGrouping: true,
  }).format(numeric);
}

/** Décompose un nombre en mantisse + exposant (notation scientifique). */
export function splitScientific(value) {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(numeric) || numeric === 0) {
    return { mantissa: Number.isFinite(numeric) ? String(numeric) : String(value ?? ''), exponent: null };
  }

  const exponent = Math.floor(Math.log10(Math.abs(numeric)));
  const mantissa = numeric / 10 ** exponent;
  // Évite 9.999999999999999 → 10^n
  const rounded = Number.parseFloat(mantissa.toPrecision(6));
  if (Math.abs(rounded) >= 10) {
    return {
      mantissa: String(Number.parseFloat((rounded / 10).toPrecision(6))),
      exponent: exponent + 1,
    };
  }
  return { mantissa: String(rounded), exponent };
}

export function toSuperscript(value) {
  return String(value)
    .split('')
    .map((character) => SUPERSCRIPT[character] ?? character)
    .join('');
}

export function toSubscript(value) {
  return String(value)
    .split('')
    .map((character) => SUBSCRIPT[character] ?? character)
    .join('');
}

/** Chaîne prête à l'affichage : `1,5 × 10⁻⁷`. */
export function toScientificString(value) {
  const { mantissa, exponent } = splitScientific(value);
  if (exponent === null) return mantissa;
  return `${String(mantissa).replace('.', decimalSeparator())} \u00d7 10${toSuperscript(exponent)}`;
}

/**
 * Graduations d'axe : compact, lisible, sans fausse précision.
 */
export function formatTick(value) {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(numeric)) return String(value ?? '');
  if (numeric === 0) return '0';

  const absolute = Math.abs(numeric);
  if (absolute >= 1e6 || absolute < 1e-3) return toScientificString(numeric);

  const decimals = absolute >= 100 ? 0 : absolute >= 1 ? 1 : absolute >= 0.1 ? 2 : 3;
  return new Intl.NumberFormat(activeLocale, {
    maximumFractionDigits: decimals,
    useGrouping: false,
  }).format(numeric);
}

/**
 * Unité : `kg·m⁻¹·s⁻²`, `°C`, `%`.
 * Les puissances `^2` sont converties en exposants, les `*` en `·`.
 */
export function formatUnit(unit) {
  if (!unit) return '';
  return String(unit)
    .replace(/\s*\^\s*\{?\s*(-?\d+)\s*\}?/g, (_, exponent) => toSuperscript(exponent))
    .replace(/\s*\*\s*/g, '\u00b7')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Valeur + unité, séparées par une espace insécable. */
export function formatWithUnit(value, unit, options = {}) {
  const formatted = formatNumber(value, options);
  const cleanUnit = formatUnit(unit);
  if (!cleanUnit) return formatted;
  if (cleanUnit === '%') return `${formatted}\u00a0%`;
  return `${formatted}\u00a0${cleanUnit}`;
}

/** N'ajoute un `%` que si la valeur est explicitement un pourcentage. */
export function formatPercent(value, { fraction = false, maximumFractionDigits = 2 } = {}) {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(numeric)) return String(value ?? '');
  const scaled = fraction ? numeric * 100 : numeric;
  return `${new Intl.NumberFormat(activeLocale, { maximumFractionDigits }).format(scaled)}\u00a0%`;
}

function decimalSeparator() {
  return activeLocale === 'en-US' ? '.' : ',';
}

function safeFromCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/**
 * Répare un texte encodé (`%20`), les entités HTML et la mojibake UTF-8.
 * N'altère jamais le contenu : en cas de doute, le texte est rendu tel quel.
 */
export function decodeText(input) {
  if (typeof input !== 'string' || !input) return input ?? '';

  let text = input;

  // Mojibake UTF-8 (« DÃ©couvrez ») — réparé uniquement si le motif est franc.
  if (/[\u00c3\u00c2][\u0080-\u00bf]/.test(text) || /\u00e2\u20ac\S/.test(text)) {
    try {
      const repaired = decodeURIComponent(escape(text));
      if (/[\u00e9\u00e8\u00ea\u00e0\u00e7\u00fb\u00f4\u00ee]/.test(repaired)) text = repaired;
    } catch {
      /* on conserve le texte d'origine */
    }
  }

  // Entités HTML résiduelles.
  text = text
    .replace(/&#(\d+);/g, (_, code) => safeFromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => safeFromCodePoint(Number.parseInt(code, 16)))
    .replace(/&(nbsp|amp|lt|gt|quot|apos|times|divide|deg|micro|sup2|sup3|frac12);/g, (match, entity) => {
      const map = {
        nbsp: '\u00a0', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
        times: '\u00d7', divide: '\u00f7', deg: '\u00b0', micro: '\u00b5',
        sup2: '\u00b2', sup3: '\u00b3', frac12: '\u00bd',
      };
      return map[entity] ?? match;
    });

  // Encodage-pourcent résiduel, uniquement sur des séquences valides.
  if (/%[0-9a-f]{2}/i.test(text) && !/\d\s*%/.test(text)) {
    try {
      const decoded = decodeURIComponent(text);
      if (decoded !== text && /[^\x00-\x7F]/.test(decoded)) text = decoded;
    } catch {
      /* séquence invalide : on garde le texte */
    }
  }

  return text;
}

/** Découpe un texte en segments mixtes (texte + valeurs numériques). */
export function splitNumericTokens(text) {
  if (typeof text !== 'string') return [{ type: 'text', value: String(text ?? '') }];
  const pattern = /(-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?)(\s*(?:%|[a-zA-Z\u00b5\u00b0][a-zA-Z0-9\u00b5\u00b0\u00b7\u207b\u00b9\u00b2\u00b3\u2074-\u2079\u2070\u00b0/]*)?)/g;
  const tokens = [];
  let lastIndex = 0;
  let match = pattern.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    tokens.push({ type: 'number', value: match[1], unit: (match[2] ?? '').trim() });
    lastIndex = match.index + match[0].length;
    match = pattern.exec(text);
  }

  if (lastIndex < text.length) tokens.push({ type: 'text', value: text.slice(lastIndex) });
  return tokens;
}

/** Version texte d'une valeur : utilisée pour les libellés d'accessibilité. */
export function plainValue(value, unit) {
  if (unit === '%') return formatPercent(value);
  return formatWithUnit(value, unit);
}

/** Heure locale d'un message (ISO ou chaîne de date). */
export function formatTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(activeLocale, {
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

/** Initiales d'un nom affiché, pour l'avatar textuel. */
export function profileInitials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Nom affiché déduit d'une adresse e-mail, en attendant le profil serveur. */
export function displayNameFromEmail(email) {
  const local = String(email ?? '').split('@')[0] ?? '';
  const cleaned = local.replace(/[._-]+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}