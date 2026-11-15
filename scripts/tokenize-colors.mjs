/**
 * Remplace les couleurs littérales des couches de style par les jetons du
 * thème (`src/styles/tokens.css`).
 *
 * La substitution est faite **par propriété** : un blanc (`#fff`) utilisé comme
 * fond devient `var(--surface)`, mais un blanc utilisé comme couleur de texte
 * sur un aplat de couleur reste blanc. C'est la seule façon d'éviter qu'un
 * bouton bleu ne reçoive du texte sombre en mode sombre.
 *
 * Les blocs `[data-theme]` existants ne sont pas touchés : ils restent la
 * référence du thème sombre écrit à la main.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

const BY_PROPERTY = {
  surface: {
    '#fff': 'var(--surface)',
    '#ffffff': 'var(--surface)',
    '#fbfdff': 'var(--surface-2)',
    '#f8fbfe': 'var(--surface-2)',
    '#f2f8ff': 'var(--accent-soft)',
    '#eef5fd': 'var(--surface-3)',
    '#fdf7ee': 'var(--warning-soft)',
    '#fdf1f1': 'var(--danger-soft)',
  },
  border: {
    '#e2ebf5': 'var(--line)',
    '#e1eaf3': 'var(--line)',
    '#d6e6f9': 'var(--line-strong)',
    '#d8e8fb': 'color-mix(in srgb, var(--accent) 22%, transparent)',
    '#f0dcc2': 'color-mix(in srgb, var(--warning) 34%, transparent)',
    '#f3caca': 'color-mix(in srgb, var(--danger) 34%, transparent)',
  },
  text: {
    '#142d50': 'var(--ink)',
    '#7890ae': 'var(--ink-3)',
    '#5b7a99': 'var(--ink-3)',
    '#a2b4c8': 'var(--ink-3)',
    '#1267eb': 'var(--accent)',
    '#a06a1f': 'var(--warning)',
    '#7a5518': 'var(--warning)',
    '#d64545': 'var(--danger)',
    '#8f2f2f': 'var(--danger)',
  },
};

const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const DECL = /([\w-]+)\s*:\s*([^;{}]+)/g;

const propertyKind = (property) => {
  if (property.startsWith('border') || property.startsWith('outline')) return 'border';
  if (property === 'background' || property === 'background-color') return 'surface';
  if (['color', 'fill', 'stroke', 'stop-color', 'text-decoration-color', 'caret-color'].includes(property)) {
    return 'text';
  }
  return null;
};

let totalReplacements = 0;

for (const file of process.argv.slice(2)) {
  const full = path.join(root, file);
  const css = fs.readFileSync(full, 'utf8');
  const report = [];

  // On ne traite que les règles hors `[data-theme]`.
  const updated = css.replace(/([^{}]+)\{([^{}]*)\}/g, (match, rawSelector, body) => {
    const selector = rawSelector.trim();
    if (selector.includes('data-theme')) return match;

    let changed = 0;
    const nextBody = body.replace(DECL, (declaration, property, value) => {
      const kind = propertyKind(property);
      if (!kind) return declaration;
      const map = BY_PROPERTY[kind];
      const nextValue = value.replace(HEX, (hex) => {
        const token = map[hex.toLowerCase()];
        if (!token) return hex;
        changed += 1;
        return token;
      });
      if (nextValue === value) return declaration;
      return `${property}:${nextValue}`;
    });

    if (!changed) return match;
    totalReplacements += changed;
    report.push(`${selector.slice(0, 70)} → ${changed}`);
    return `${rawSelector}{${nextBody}}`;
  });

  fs.writeFileSync(full, updated, 'utf8');
  console.log(`${file} : ${report.length} règle(s), ${report.reduce((sum, line) => sum + Number(line.split('→ ')[1]), 0)} couleur(s)`);
}

console.log(`total : ${totalReplacements} substitutions`);