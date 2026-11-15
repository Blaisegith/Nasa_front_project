import fs from 'node:fs';
import path from 'node:path';
import { translations, LOCALES } from '../src/i18n/translations.js';

const root = path.resolve(import.meta.dirname, '..');
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(jsx?|mjs)$/.test(entry.name)) files.push(full);
  }
};
walk(path.join(root, 'src'));

const used = new Map();
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
    if (!used.has(match[1])) used.set(match[1], path.relative(root, file));
  }
  for (const match of source.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) {
    if (!used.has(match[1])) used.set(match[1], path.relative(root, file));
  }
}

const flat = (value, prefix = '', out = {}) => {
  for (const [key, child] of Object.entries(value)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flat(child, dotted, out);
    else out[dotted] = child;
  }
  return out;
};

const dictionaries = Object.fromEntries(LOCALES.map((locale) => [locale, flat(translations[locale])]));

const problems = 0;
let missing = 0;
for (const [locale, dict] of Object.entries(dictionaries)) {
  const gaps = [...used.keys()].filter((key) => !(key in dict)).sort();
  missing += gaps.length;
  console.log(`${locale}: ${Object.keys(dict).length} clés, ${gaps.length} manquante(s)`);
  gaps.forEach((key) => console.log(`  - ${key} (${used.get(key)})`));
}

for (const locale of LOCALES) {
  for (const other of LOCALES) {
    if (locale === other) continue;
    const gaps = Object.keys(dictionaries[locale])
      .filter((key) => !(key in dictionaries[other]))
      .sort();
    if (gaps.length) {
      missing += gaps.length;
      console.log(`${locale} → ${other} manquant : ${gaps.join(', ')}`);
    }
  }
}

console.log(`clés utilisées : ${used.size} · écart total : ${missing + problems}`);
process.exitCode = missing + problems > 0 ? 1 : 0;