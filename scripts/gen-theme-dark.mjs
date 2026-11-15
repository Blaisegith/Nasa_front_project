/**
 * Génère `src/styles/theme-dark.css`.
 *
 * Le problème corrigé ici est structurel : `styles.css` (et les couches
 * suivantes) déclarent des couleurs littérales pour le thème clair. En mode
 * sombre, un texte `#345472` restait donc sombre sur fond sombre.
 *
 * Plutôt que de réécrire 450 règles à la main, ce script :
 *   1. analyse chaque règle qui ne dépend pas déjà de `[data-theme]` ;
 *   2. classe chaque couleur littérale par rôle (texte / surface / bordure) à
 *      partir de son usage (propriété CSS) et de sa luminance ;
 *   3. émet, dans le même contexte (y compris `@media`), la surcharge sombre
 *      correspondante, exprimée avec les jetons du thème ;
 *   4. ignore ce qui doit rester identique dans les deux thèmes : texte clair
 *      posé sur un aplat de couleur, teintes de marque, couleurs déjà
 *      surchargées par un bloc `[data-theme="dark"]` existant.
 *
 * Le fichier généré est relu à chaque build : il ne doit pas être édité à la
 * main, mais régénéré avec `npm run theme:dark`.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sources = [
  'src/styles.css',
  'src/styles/modern.css',
  'src/styles/answer.css',
];
const output = path.join(root, 'src', 'styles', 'theme-dark.css');

/* ------------------------------------------------------------------ *
 * Analyse
 * ------------------------------------------------------------------ */

const COLOR_PROPERTIES = [
  'color',
  'background',
  'background-color',
  'border',
  'border-color',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'fill',
  'stroke',
  'stop-color',
];

const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;

function parseHex(hex) {
  let value = hex.slice(1);
  if (value.length === 3 || value.length === 4) {
    value = [...value].map((char) => char + char).join('');
  }
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  return { r, g, b, lightness, saturation };
}

/** Rôle déduit de la propriété et de la couleur. */
function classify(property, hex) {
  const { lightness, saturation } = parseHex(hex);
  const isBorder = property.startsWith('border') || property === 'outline-color';
  const isBackground = property === 'background' || property === 'background-color';
  const isFill = property === 'fill' || property === 'stop-color';
  const isStroke = property === 'stroke';

  // Texte clair posé sur un aplat de couleur : doit rester clair.
  if ((property === 'color' || isFill) && lightness > 0.86) return { action: 'keep', why: 'on-accent' };
  // Couleur de marque (bleu, corail, vert, or) : identique dans les deux thèmes.
  if (saturation > 0.32 && lightness > 0.22 && lightness < 0.82 && !isBackground) {
    return { action: 'keep', why: 'brand' };
  }
  if (isBorder || property === 'stroke') {
    if (lightness > 0.62) return { action: 'border', token: 'var(--line)' };
    if (lightness > 0.38) return { action: 'border', token: 'var(--line-strong)' };
    return { action: 'keep', why: 'dark-border' };
  }
  if (isBackground) {
    if (lightness > 0.955) return { action: 'surface', token: 'var(--surface)' };
    if (lightness > 0.86) return { action: 'surface', token: 'var(--surface-2)' };
    if (lightness > 0.62) return { action: 'surface', token: 'var(--surface-3)' };
    return { action: 'keep', why: 'dark-surface' };
  }
  // Reste : du texte.
  if (lightness < 0.3) return { action: 'ink', token: 'var(--ink)' };
  if (lightness < 0.52) return { action: 'ink', token: 'var(--ink-2)' };
  if (lightness < 0.74) return { action: 'ink', token: 'var(--ink-3)' };
  return { action: 'keep', why: 'light-text' };
}

/** Découpe un corps de règle en déclarations, en respectant `var(...)` et `url(...)`. */
/** Découpe un corps de règle en déclarations, en respectant `var(...)` et `url(...)`. */
function stripComments(css) {
  let output = '';
  let index = 0;
  let inString = null;
  while (index < css.length) {
    const char = css[index];
    const next = css[index + 1];
    if (inString) {
      output += char;
      if (char === inString && css[index - 1] !== '\\') inString = null;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      output += char;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = css.indexOf('*/', index + 2);
      index = end === -1 ? css.length : end + 2;
      output += ' ';
      continue;
    }
    output += char;
    index += 1;
  }
  return output;
}

function splitDeclarations(body) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ';' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const colorPattern = new RegExp(`(${COLOR_PROPERTIES.join('|')})\\s*:\\s*([^;]+)`, 'i');

/** Renvoie la surcharge sombre d'un corps de règle, ou `null` si rien à faire. */
function darkOverride(body) {
  const emitted = [];
  for (const declaration of splitDeclarations(body)) {
    const match = declaration.match(colorPattern);
    if (!match) continue;
    const property = match[1].toLowerCase();
    const value = match[2];
    const hex = value.match(HEX);
    if (!hex) continue;

    const { action, token } = classify(property, hex[0]);
    if (action === 'keep') continue;

    if (property === 'background') {
      // Un dégradé ou une image de fond ne se remplace pas par une couleur.
      if (/gradient|url\(/i.test(value)) continue;
      // `background-color` plutôt que `background` : la forme courte
      // effacerait une éventuelle `background-image` posée par le thème clair.
      emitted.push(`background-color:${token}`);
      continue;
    }
    if (property === 'color' || property === 'fill') {
      emitted.push(`${property}:${token}`);
      continue;
    }
    if (property.startsWith('border') || property === 'outline-color') {
      if (/gradient|url\(/i.test(value)) continue;
      // `border: 1px solid #e1eaf3` → on ne garde que la couleur.
      if (/^\s*[^:]+:/.test(value) === false && value.trim().split(/\s+/).length > 1) {
        const parts = value.trim().split(/\s+/);
        const index = parts.findIndex((part) => HEX.test(part));
        if (index >= 0) parts[index] = token;
        emitted.push(`${property}:${parts.join(' ')}`);
        continue;
      }
      emitted.push(`${property}:${token}`);
    }
  }

  if (!emitted.length) return null;
  return [...new Set(emitted)].join(';');
}

/**
 * Parcours récursif : renvoie des tuples `{ atRule, selector, declarations }`
 * en conservant l'éventuel `@media`.
 */
function collectRules(css) {
  const rules = [];
  const stack = [];

  const walk = (source) => {
    let index = 0;
    while (index < source.length) {
      const open = source.indexOf('{', index);
      if (open === -1) break;
      const prelude = source.slice(index, open).trim();

      // Corps équilibré.
      let depth = 1;
      let cursor = open + 1;
      while (cursor < source.length && depth > 0) {
        const char = source[cursor];
        if (char === '{') depth += 1;
        else if (char === '}') depth -= 1;
        cursor += 1;
      }
      const body = source.slice(open + 1, cursor - 1);

      if (prelude.startsWith('@')) {
        if (/^@(media|supports|layer)\b/i.test(prelude)) {
          stack.push(prelude);
          walk(body);
          stack.pop();
        }
        // @font-face, @keyframes, etc. : ignorés.
      } else {
        rules.push({
          atRules: [...stack],
          selector: prelude.replace(/\s+/g, ' '),
          declarations: body,
        });
      }
      index = cursor;
    }
  };

  walk(css);
  return rules;
}

/* ------------------------------------------------------------------ *
 * Génération
 * ------------------------------------------------------------------ */

const alreadyOverridden = new Set();

const collected = [];
for (const file of sources) {
  const css = stripComments(fs.readFileSync(path.join(root, file), 'utf8'));
  for (const rule of collectRules(css)) {
    if (rule.selector.includes('data-theme')) {
      // Sert aussi de référence : ces sélecteurs sont déjà traités.
      for (const part of rule.selector.split(',')) {
        alreadyOverridden.add(part.trim().replace(/^.*\[data-theme="dark"\]\s*/, ''));
      }
      continue;
    }
    if (/^(from|to|\d+%)$/.test(rule.selector)) continue;
    collected.push({ ...rule, file });
  }
}

const emitted = [];
const seenSelectors = new Map();
const skipped = { alreadyOverridden: 0, keptByHeuristic: 0 };
const keptReasons = new Map();

for (const rule of collected) {
  // Respecte les surcharges sombres écrites à la main.
  const bare = rule.selector
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (bare.some((part) => alreadyOverridden.has(part))) {
    skipped.alreadyOverridden += 1;
    continue;
  }

  const declarations = darkOverride(rule.declarations);
  if (!declarations) {
    skipped.keptByHeuristic += 1;
    continue;
  }

  const selectors = bare.map((part) => `.app-shell[data-theme="dark"] ${part}`);
  if (!selectors.length) continue;

  const key = `${selectors.join(',')}|${declarations}`;
  if (seenSelectors.has(key)) continue;
  seenSelectors.set(key, rule.file);

  emitted.push({ atRules: rule.atRules, selectors, declarations });
}

// Regroupe par jeu de déclarations identique, dans le même contexte @media.
const grouped = new Map();
for (const item of emitted) {
  const key = `${item.atRules.join(' ')}|${item.declarations}`;
  if (!grouped.has(key)) grouped.set(key, { atRules: item.atRules, declarations: item.declarations, selectors: [] });
  grouped.get(key).selectors.push(...item.selectors);
}

const lines = [];
lines.push('/*');
lines.push(' * Thème sombre — FICHIER GÉNÉRÉ, NE PAS ÉDITER À LA MAIN.');
lines.push(' *');
lines.push(' * Produit par `npm run theme:dark` (scripts/gen-theme-dark.mjs).');
lines.push(' * Corrige les couleurs littérales du thème clair qui restaient sombres');
lines.push(' * en mode sombre : textes, fonds, bordures, remplissages SVG.');
lines.push(' */');
lines.push('');

let lastAtRule = null;
let openBlocks = 0;
for (const group of grouped.values()) {
  const atRule = group.atRules.join(' ');
  if (atRule !== lastAtRule) {
    while (openBlocks > 0) {
      lines.push('}');
      openBlocks -= 1;
    }
    if (atRule) {
      lines.push(`${atRule} {`);
      openBlocks = 1;
    }
    lastAtRule = atRule;
  }
  lines.push(`${group.selectors.join(',\n')} {`);
  lines.push(group.declarations.split(';').map((part) => `  ${part.trim()};`).join('\n'));
  lines.push('}');
}
while (openBlocks > 0) {
  lines.push('}');
  openBlocks -= 1;
}

fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf8');

const declarations = [...grouped.values()].reduce((sum, group) => sum + group.declarations.split(';').length, 0);
console.log(`règles analysées : ${collected.length}`);
console.log(`surcharges émises : ${grouped.size} groupes · ${declarations} déclarations`);
console.log(`ignorées : ${skipped.alreadyOverridden} déjà surchargées à la main, ${skipped.keptByHeuristic} inchangées par heuristique`);
console.log(`fichier : ${path.relative(root, output)}`);