import fs from 'node:fs';

const file = process.argv[2] ?? 'src/styles/answer.css';
const css = fs.readFileSync(file, 'utf8');
const blocks = [...css.matchAll(/([^{}]*\[data-theme="dark"\][^{}]*)\{([^{}]*)\}/g)];

console.log(`${file} — ${blocks.length} bloc(s) sombre(s)`);
for (const block of blocks) {
  console.log(`--- ${block[1].trim()}`);
  console.log(block[2].trim());
}