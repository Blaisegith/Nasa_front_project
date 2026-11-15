import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const skip = new Set(['node_modules', '.git', 'dist', '.venv', '__pycache__', 'var', '.pytest_cache']);
const skipFiles = new Set([path.join('scripts', 'check-encoding.mjs'), path.join('src', 'lib', 'format.js')]);
const extensions = /\.(js|jsx|mjs|css|html|json|md|py|sql|txt|example)$/;

const problems = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extensions.test(entry.name)) {
      const buffer = fs.readFileSync(full);
      const text = buffer.toString('utf8');
      const relative = path.relative(root, full);
      if (skipFiles.has(relative)) continue;
      if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        problems.push(`${relative} : BOM UTF-8`);
      }
      if (text.includes('\uFFFD')) problems.push(`${relative} : caractère de remplacement U+FFFD`);
      // Double encodage typique : « â€” », « Ã© », « Â· ».
      if (/[ÃÂ][\u0080-\u00BF\u2013\u2014\u201C\u201D]/.test(text)) {
        problems.push(`${relative} : double encodage probable`);
      }
      if (/\r\n/.test(text) && !/\n/.test(text.replace(/\r\n/g, ''))) {
        problems.push(`${relative} : fins de ligne CRLF uniquement`);
      }
    }
  }
};
walk(root);

console.log(problems.length ? problems.join('\n') : 'Encodage : aucun problème détecté.');