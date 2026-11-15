// Détecte les secrets avant commit : clés, jetons, mots de passe en dur.
//
// Un gabarit (`<mot de passe>`, `change-me`, `xxx`, `…`) n'est pas un secret :
// il est ignoré. Toute autre correspondance fait échouer la vérification, afin
// que `npm run check` serve réellement de garde-fou avant un commit.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '.';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.venv', 'var', '__pycache__', '.pytest_cache', 'coverage']);
const TEXT_EXT = /\.(py|js|jsx|mjs|json|md|sql|css|html|txt|yml|yaml|toml|example|env)$/i;

const patterns = [
  { label: 'clé OpenAI / Groq', re: /\b(sk-[A-Za-z0-9_-]{20,})\b/ },
  { label: 'jeton Supabase (JWT)', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { label: 'service_role en dur', re: /service_role\s*[:=]\s*['"]([^'"]{20,})['"]/ },
  { label: 'mot de passe en dur', re: /(?:password|passwd|pwd)\s*[:=]\s*['"]([^'"]{8,})['"]/i },
  { label: 'secret en dur', re: /(?:secret|api_key|apikey|token)\s*[:=]\s*['"]([A-Za-z0-9_\-]{16,})['"]/i },
  { label: 'connexion PostgreSQL', re: /postgresql(?:\+\w+)?:\/\/[^/\s:]+:([^@\s]+)@/ },
];

const PLACEHOLDER = /^[<{]|^$|^x{3,}$|^\.{3}$|^…$|^change[-_]?me$|^dev-only|^your[-_]?|^placeholder$|^example$|^todo$|^redacted$/i;

function isPlaceholder(value) {
  const candidate = String(value ?? '').trim();
  if (!candidate) return true;
  if (PLACEHOLDER.test(candidate)) return true;
  // Un gabarit contient un chevron ou des points de suspension.
  return /[<>…]/.test(candidate) || /\.{3}/.test(candidate);
}

const findings = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (TEXT_EXT.test(entry.name)) {
      const source = fs.readFileSync(full, 'utf8');
      source.split(/\r?\n/).forEach((line, index) => {
        for (const { label, re } of patterns) {
          const match = line.match(re);
          if (!match) continue;
          const value = match[1] ?? '';
          if (isPlaceholder(value)) continue;
          findings.push(`${full}:${index + 1} [${label}] ${line.trim().slice(0, 140)}`);
        }
      });
    }
  }
}
walk(ROOT);

const envFiles = ['.env', 'backend/.env', 'frontend/.env'].filter((candidate) => fs.existsSync(candidate));

if (envFiles.length) {
  findings.push(`fichier d'environnement présent (doit rester hors du dépôt) : ${envFiles.join(', ')}`);
}

if (findings.length) {
  console.error('Secrets ou fichiers sensibles détectés :');
  for (const finding of findings) console.error(`  ${finding}`);
  console.error('Aucun commit ne doit contenir ces valeurs.');
  process.exit(1);
}

console.log('Aucun secret détecté (gabarits ignorés).');