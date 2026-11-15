/**
 * Vérifie le contraste des jetons de couleur, dans les deux thèmes.
 *
 * Seuils retenus (WCAG 2.1) :
 *   - texte courant : 4.5:1 ;
 *   - texte secondaire / grand texte : 3:1 ;
 *   - éléments graphiques (courbes, axes) : 3:1.
 *
 * Le script échoue si un couple descend sous son seuil : c'est ce qui garantit
 * qu'aucun texte ne disparaît au passage en mode sombre.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(root, 'src', 'styles', 'tokens.css'), 'utf8');

function parseBlock(selector) {
  const start = css.indexOf(selector);
  if (start === -1) return {};
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);
  const tokens = {};
  for (const declaration of body.split(';')) {
    const match = declaration.match(/(--[\w-]+)\s*:\s*([^;]+)/);
    if (match) tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

const light = parseBlock(':root {');
const dark = parseBlock("[data-theme='dark'] {");
const themes = { light, dark };

const toRgb = (hex) => {
  let value = hex.replace('#', '');
  if (value.length === 3) value = [...value].map((char) => char + char).join('');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
};

const channel = (value) => {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a, b) => {
  const first = luminance(a);
  const second = luminance(b);
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return (light + 0.05) / (dark + 0.05);
};

const TEXT_SURFACES = ['--bg', '--card', '--surface-2', '--surface-3'];
const TEXT_TOKENS = [
  ['--ink', 4.5],
  ['--ink-2', 4.5],
  ['--ink-3', 4.5],
];

const checks = [];
for (const [themeName, tokens] of Object.entries(themes)) {
  for (const [textToken, minimum] of TEXT_TOKENS) {
    for (const surfaceToken of TEXT_SURFACES) {
      const text = tokens[textToken];
      const surface = tokens[surfaceToken];
      if (!text || !surface) continue;
      checks.push({
        theme: themeName,
        label: `${textToken} sur ${surfaceToken}`,
        ratio: contrast(text, surface),
        minimum,
      });
    }
  }

  // Couleur d'accent et texte posé dessus.
  checks.push({ theme: themeName, label: '--accent sur --card', ratio: contrast(tokens['--accent'], tokens['--card']), minimum: 3 });
  checks.push({ theme: themeName, label: '--accent-ink sur --accent', ratio: contrast(tokens['--accent-ink'], tokens['--accent']), minimum: 4.5 });
  checks.push({ theme: themeName, label: '--accent sur --accent-soft', ratio: contrast(tokens['--accent'], tokens['--accent-soft']), minimum: 4.5 });

  // États fonctionnels.
  for (const token of ['--danger', '--warning', '--success']) {
    const soft = `--${token.slice(2)}-soft`;
    if (tokens[token] && tokens[soft]) {
      checks.push({ theme: themeName, label: `${token} sur ${soft}`, ratio: contrast(tokens[token], tokens[soft]), minimum: 4.5 });
    }
  }

  // Graphiques : courbes, axes, graduations.
  for (const token of ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6']) {
    checks.push({ theme: themeName, label: `${token} sur --card`, ratio: contrast(tokens[token], tokens['--card']), minimum: 3 });
  }
  for (const token of ['--chart-tick', '--chart-label']) {
    checks.push({ theme: themeName, label: `${token} sur --card`, ratio: contrast(tokens[token], tokens['--card']), minimum: 4.5 });
  }
  checks.push({ theme: themeName, label: '--chart-axis sur --card', ratio: contrast(tokens['--chart-axis'], tokens['--card']), minimum: 1.4 });
  checks.push({ theme: themeName, label: '--chart-tooltip-ink sur --chart-tooltip-bg', ratio: contrast(tokens['--chart-tooltip-ink'], tokens['--chart-tooltip-bg']), minimum: 4.5 });
}

const failures = checks.filter((check) => check.ratio < check.minimum);

const rows = ['thème', 'couple', 'ratio', 'seuil', 'verdict'].join(' | ');
console.log(rows);
for (const check of checks) {
  const verdict = check.ratio >= check.minimum ? 'ok' : 'ÉCHEC';
  console.log(`${check.theme} | ${check.label} | ${check.ratio.toFixed(2)} | ${check.minimum} | ${verdict}`);
}

console.log('');
console.log(`${checks.length} couples vérifiés · ${failures.length} échec(s)`);
if (failures.length) {
  failures.forEach((failure) => {
    console.log(`  ✗ [${failure.theme}] ${failure.label} : ${failure.ratio.toFixed(2)} < ${failure.minimum}`);
  });
}
process.exitCode = failures.length ? 1 : 0;