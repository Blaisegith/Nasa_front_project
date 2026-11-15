import fs from 'node:fs';

const source = fs.readFileSync('src/components/AnswerRenderer.jsx', 'utf8');
const dynamic = [...source.matchAll(/className=\{`([^`]+)`\}/g)].map((match) => match[1]);
console.log('--- classNames dynamiques (AnswerRenderer) ---');
console.log([...new Set(dynamic)].join('\n'));

console.log('--- QuestionComposer: meta / hint ---');
fs.readFileSync('src/components/QuestionComposer.jsx', 'utf8')
  .split(/\r?\n/)
  .forEach((line, index) => {
    if (/composer-hint|composer-meta|composer-note/.test(line)) console.log(`${index + 1}: ${line.trim()}`);
  });