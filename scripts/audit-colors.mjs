import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = ['src/styles.css', 'src/styles/answer.css', 'src/styles/modern.css', 'src/styles/layout.css', 'src/styles/ui.css'];

const COLOR_DECL = /(color|background|background-color|border|border-color|border-top|border-bottom|border-left|border-right|fill|stroke|stop-color|outline|box-shadow|text-shadow)\s*:\s*([^;{}]*(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()[^;{}]*)/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

const rows = [];
for (const file of files) {
  const css = fs.readFileSync(path.join(root, file), 'utf8');
  // Découpe grossière en règles : « sélecteur { déclarations } ».
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim().replace(/\s+/g, ' ');
    const body = match[2];
    const colors = [...body.matchAll(COLOR_DECL)].map((item) => item[0].trim());
    if (colors.length) rows.push({ file, selector, colors });
  }
}

const total = rows.reduce((sum, row) => sum + row.colors.length, 0);
console.log(`règles avec couleur : ${rows.length} · déclarations : ${total}`);

const hexes = new Map();
for (const row of rows) {
  for (const declaration of row.colors) {
    for (const hex of declaration.match(HEX) ?? []) {
      const key = hex.toLowerCase();
      hexes.set(key, (hexes.get(key) ?? 0) + 1);
    }
  }
}
console.log(`couleurs hexadécimales distinctes : ${hexes.size}`);
console.log([...hexes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([hex, count]) => `${hex} ×${count}`).join('  '));

fs.writeFileSync(
  path.join(root, 'scripts', '.color-report.json'),
  JSON.stringify(rows, null, 1),
  'utf8',
);
console.log('détail écrit dans scripts/.color-report.json');