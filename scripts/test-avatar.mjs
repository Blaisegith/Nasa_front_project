/**
 * Vérifie le générateur d'avatar : stabilité, répartition, robustesse.
 *
 * Le contrat est simple : un même utilisateur obtient toujours le même avatar,
 * deux utilisateurs différents n'obtiennent pas systématiquement le même, et
 * aucune entrée manquante ne provoque d'erreur.
 */

import {
  AVATAR_MOTIFS, AVATAR_PALETTES, avatarSeed, buildAvatar, hashString,
} from '../src/lib/avatar.js';

let failures = 0;

const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label} ${detail}`);
  }
};

console.log('hashString');
check('déterministe', hashString('alice@example.com') === hashString('alice@example.com'));
check('sensible à l’entrée', hashString('alice@example.com') !== hashString('bob@example.com'));
check('sortie non signée 32 bits', Number.isInteger(hashString('x')) && hashString('x') >= 0);

console.log('avatarSeed');
check('graine = user_id', avatarSeed({ user_id: 'u1', email: 'a@b.c' }) === 'u1');
check('repli sur e-mail', avatarSeed({ email: 'a@b.c' }) === 'a@b.c');
check('repli sur nom', avatarSeed({ display_name: 'Alice' }) === 'Alice');
check('visiteur', avatarSeed(null) === 'invite');

console.log('buildAvatar');
const alice = buildAvatar({ user_id: 'user-1234', display_name: 'Alice Martin', email: 'alice@example.com' });
const again = buildAvatar({ user_id: 'user-1234', display_name: 'Alice Martin', email: 'alice@example.com' });
check('stable sur rechargement', JSON.stringify(alice) === JSON.stringify(again));
check('motif connu', AVATAR_MOTIFS.includes(alice.motif), alice.motif);
check('rotation bornée', alice.rotation >= -30 && alice.rotation < 30, String(alice.rotation));
check('identifiant de dégradé unique', /^av[0-9a-z]+$/.test(alice.id), alice.id);

// Les champs d'identité changent, l'avatar doit rester stable.
const renamed = buildAvatar({ user_id: 'user-1234', display_name: 'Alice M.', email: 'alice@example.com' });
check('insensible au libellé', JSON.stringify(alice) === JSON.stringify(renamed));

// Répartition : au bout de 200 utilisateurs, on doit voir plusieurs palettes
// et plusieurs motifs, sinon l'aléatoire est mal distribué.
const samples = Array.from({ length: 200 }, (_, index) => buildAvatar({ user_id: `user-${index}` }));
const palettes = new Set(samples.map((sample) => `${sample.from}${sample.to}`));
const motifs = new Set(samples.map((sample) => sample.motif));
check('répartition des palettes', palettes.size >= 6, `${palettes.size}/${AVATAR_PALETTES.length}`);
check('répartition des motifs', motifs.size >= 4, `${motifs.size}/${AVATAR_MOTIFS.length}`);
check('tous les motifs atteints', motifs.size === AVATAR_MOTIFS.length, [...motifs].join(','));

console.log('');
console.log(failures ? `${failures} échec(s)` : 'tous les contrôles passent');
process.exitCode = failures ? 1 : 0;