import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

// Toutes les feuilles réellement chargées, dans l'ordre du `main.jsx`.
const styleDir = path.join(root, 'src', 'styles');
const cssFiles = [
  'src/styles/tokens.css',
  'src/styles.css',
  'src/styles/answer.css',
  'src/styles/modern.css',
  'src/styles/layout.css',
  'src/styles/ui.css',
  'src/styles/dashboard.css',
  'src/styles/theme-dark.css',
];
const css = cssFiles.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
void styleDir;

const defined = new Set([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((match) => match[1]));

const targets = [
  'src/components/QuestionComposer.jsx',
  'src/components/Logo.jsx',
  'src/components/UserAvatar.jsx',
  'src/components/UserMenu.jsx',
  'src/components/LineChart.jsx',
  'src/components/AnswerRenderer.jsx',
  'src/features/home/HomeAnswerPanel.jsx',
  'src/features/home/AnalysisHeader.jsx',
  'src/features/home/HomePage.jsx',
  'src/features/home/ResearchInsights.jsx',
  'src/features/chat/ChatPage.jsx',
  'src/App.jsx',
];

// Modificateurs sémantiques sans style propre : `.message-row.assistant`
// n'a pas d'apparence distincte de `.message-row` (seul `.user` en a une).
const ALLOW = new Set(['assistant']);

const gaps = [];
for (const target of targets) {
  const source = fs.readFileSync(path.join(root, target), 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\}|\{([^}]+)\})/g)) {
    // On retire les interpolations `${...}` : elles contiennent des
    // expressions JS, pas des noms de classes.
    const raw = (match[1] ?? match[2] ?? match[3] ?? '').replace(/\$\{[^}]*\}/g, ' ');
    for (const token of raw.split(/[^a-zA-Z0-9_-]+/)) {
      // On écarte les identifiants JS (`open`, `kind`) et les préfixes de
      // classes construites (`series-`), qui ne sont pas des classes.
      if (!/^[a-z][a-z0-9_-]*$/.test(token)) continue;
      if (/[-_]$/.test(token)) continue;
      names.add(token);
    }
  }
  for (const name of names) {
    if (ALLOW.has(name)) continue;
    if (!defined.has(name)) gaps.push(`${target}: .${name}`);
  }
}

console.log(gaps.length ? `Classes sans style :\n${gaps.join('\n')}` : 'Toutes les classes utilisées sont stylées.');

const leftovers = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      const source = fs.readFileSync(full, 'utf8');
      if (/nasa-mark/.test(source)) leftovers.push(path.relative(root, full));
    }
  }
};
walk(path.join(root, 'src'));
console.log(leftovers.length ? `Références restantes :\n${leftovers.join('\n')}` : 'Aucune référence nasa-mark dans src.');

// Crédit d'équipe : la mention doit être présente, et venir d'une constante
// unique (pas de nom d'équipe recopié dans le JSX).
const constants = fs.readFileSync(path.join(root, 'src', 'data', 'constants.js'), 'utf8');
const teamName = constants.match(/export const TEAM_NAME = '([^']+)'/);
if (!teamName) {
  console.log('Crédit d’équipe : TEAM_NAME absente de src/data/constants.js');
  process.exitCode = 1;
} else {
  const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'src', 'features', 'settings', 'SettingsPage.jsx'), 'utf8');
  const credited = app.includes('TEAM_NAME') && settings.includes('TEAM_NAME');
  const hardcoded = /Techlabs|TECHLABS/i.test(app) || /Techlabs|TECHLABS/i.test(settings);
  console.log(
    credited && !hardcoded
      ? `Crédit d’équipe : ${teamName[1]} référencée via TEAM_NAME (pied de page + paramètres).`
      : 'Crédit d’équipe : nom codé en dur ou non affiché (utiliser TEAM_NAME).',
  );
  if (!credited || hardcoded) process.exitCode = 1;
}