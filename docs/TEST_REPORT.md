# TEST_REPORT — FRAME IN FREEFALL AI

Rapport d'exécution réel, obtenu sur la copie de travail
`D:\Projects\Nasa_front_project` (branche `feature/techlabs-platform-integration`).
Aucun résultat n'est extrapolé : chaque ligne correspond à une commande passée.

## 1. Synthèse

| Suite | Commande | Résultat |
|---|---|---|
| Vérifications statiques | `npm run check` | **OK** (i18n, styles, encodage, contraste, secrets) |
| Générateur d'avatar | `npm run test:avatar` | **15/15 OK** |
| Parcours tableau de bord | `npm run test:flow` | **14/14 OK** |
| Tests backend | `python -m pytest` (backend) | **66/66 OK** |
| Moteur multimodal | `python -m pytest tests/test_retrieval*.py` | **38/38 OK** |
| Contexte RLS (Supabase) | `python -m pytest tests/test_rls.py` | **3/3 OK** |
| Ingestion NASA | `python -m pytest tests/test_ingest_nasa.py` | **6/6 OK** |
| Mesures de performance | `python -m tools.retrieval_bench` | **voir `MULTIMODAL_RETRIEVAL.md`** |
| Chaîne multimodale | `npm run test:multimodal` | **OK** (2 passages : à froid et incrémental) |
| Build de production | `npm run build` | **OK** |

## 2. Vérifications statiques (`npm run check`)

### 2.1 Internationalisation

```
fr: 255 clés, 0 manquante(s)
en: 255 clés, 0 manquante(s)
clés utilisées : 189 · écart total : 0
```

Aucune clé utilisée dans le JSX n'est absente des dictionnaires, et les deux
langues sont alignées à la clé près.

### 2.2 Couverture des styles

`scripts/check-styles.mjs` compare chaque classe écrite dans le JSX aux classes
déclarées dans les huit feuilles réellement chargées. Résultat : **toutes les
classes utilisées sont stylées** (`UserAvatar`, `UserMenu`, `AnalysisHeader`,
`HomePage`, `HomeAnswerPanel`, `QuestionComposer`, `LineChart`, `AnswerRenderer`,
`ChatPage`, `App`). Les expressions `${…}` ne sont plus comptées comme des
classes, et `.message-row.assistant` est un modificateur explicitement admis
(aucun style propre : seul `.user` a une apparence distincte).

Aucune référence `nasa-mark` dans `src`. Le crédit d'équipe est vérifié
positivement : `TEAM_NAME` doit exister dans `constants.js` et être consommée par
le pied de page **et** les paramètres, sans nom codé en dur dans le JSX.

```
Crédit d’équipe : TECHLABS référencée via TEAM_NAME (pied de page + paramètres).
```

### 2.3 Contraste (WCAG)

`scripts/check-contrast.mjs` : **56 couples vérifiés · 0 échec**.

Seuils appliqués : 4.5:1 pour le texte courant, 3:1 pour les tracés de
graphique, 1.4:1 pour les axes. Extrait du thème sombre :

| Couple | Ratio | Seuil | État |
|---|---|---|---|
| `--ink` sur `--card` | 12.41 | 4.5 | ok |
| `--series-1` sur `--card` | 5.77 | 3 | ok |
| `--series-2` sur `--card` | 7.89 | 3 | ok |
| `--chart-tick` sur `--card` | 7.70 | 4.5 | ok |
| `--chart-axis` sur `--card` | 2.02 | 1.4 | ok |
| `--chart-tooltip-ink` sur `--chart-tooltip-bg` | 16.23 | 4.5 | ok |

Trois valeurs ont dû être corrigées pendant les vérifications : `--ink-3`,
`--chart-tick` et `--warning` (clair comme sombre).

### 2.4 Cohérence des jetons

`61` jetons déclarés, **tous les `var()` résolus** : aucune variable référencée
sans déclaration, dans aucune des huit feuilles. Trois manques ont été corrigés à
cette occasion (`--dock-h`, `--dock-fade` dans `tokens.css`, et un
`var(--background)` orphelin dans `modern.css`). `--dock-h` a ensuite été retiré :
plus rien ne le référençait après simplification du dock.

### 2.5 Encodage

`scripts/check-encoding.mjs` : aucun mojibake, aucun caractère CJK parasite, BOM
absent. Quatre fichiers sont en CRLF d'origine (`docs/ARCHITECTURE_AUDIT.md`,
`docs/BACKEND_AUDIT.md`, `docs/FRONTEND_AUDIT.md`, `src/styles.css`) et sont
laissés tels quels : les réécrire n'apporte rien et casse les diffs.

## 3. Générateur d'avatar (`npm run test:avatar`)

| Contrôle | Attendu | Obtenu |
|---|---|---|
| `hashString` déterministe | identique à entrée identique | ok |
| `hashString` sensible à l'entrée | deux entrées différentes diffèrent | ok |
| Sortie non signée 32 bits | entier positif | ok |
| Graine = `user_id` | priorité au plus stable | ok |
| Replis e-mail / nom / visiteur | dégradé ordonné | ok |
| Stabilité sur rechargement | avatar identique | ok |
| Motif connu | dans la liste des six | ok |
| Rotation bornée | `[-30, 30)` | ok |
| Identifiant de dégradé unique | `av<base36>` | ok |
| Insensible au libellé | renommage sans effet | ok |
| Répartition palettes (200 échantillons) | ≥ 6 sur 8 | ok |
| Répartition motifs | ≥ 4 sur 6 | ok |
| Tous les motifs atteints | 6 sur 6 | ok |

## 4. Parcours tableau de bord (`npm run test:flow`)

Scénario réel contre un backend démarré (`127.0.0.1:8000`) :

| Étape | Attendu | Obtenu |
|---|---|---|
| `POST /auth/session` | 201 + cookie | ok |
| `POST /chat/attachments` (PDF) | 201 + `attachment_id` | ok |
| `POST /chat` avec pièce jointe | 501 `not_implemented` | ok |
| Question persistée | `question_persisted: true` | ok |
| Pièce jointe rattachée | `attachment_id` rendu | ok |
| Aucune réponse fabriquée | `answer` absent | ok |
| `conversation_id` rendu | présent | ok |
| `GET /conversations/{id}` | question + pièce jointe visibles | ok |
| Aucun message assistant inventé | aucun rôle `assistant` | ok |
| Historique (`GET /conversations`) | échange listé | ok |
| `DELETE /auth/session` | 204 | ok |

C'est le contrat exact que le tableau de bord exploite : la question est prise en
charge et conservée, même quand la génération n'est pas branchée.

## 5. Backend (`python -m pytest`)

```
66 passed in 64.32s
```

Couverture : sessions, profils, isolation par utilisateur, persistance des
conversations, pièces jointes (taille, type, nombre, accès croisé refusé),
moteur multimodal (extraction, indexation, recherche, fusion, refus de chemins
hors index, projection dans la réponse), métadonnées de média, ingestion du
corpus public NASA (hors ligne, réseau remplacé), contexte RLS de Supabase.

## 5.1 Chaîne multimodale (`npm run test:multimodal`)

Exécutée deux fois contre un backend réellement démarré, corpus réel, puis sur
index déjà peuplé :

| Vérification | Résultat |
|---|---|
| Session ouverte | ok |
| Indexation (md, csv, images, vidéo) | ok |
| Aucune erreur d'extraction | ok |
| Second passage : rien de réindexé | ok |
| Recherche multimodale 4 modalités | ok |
| Segments horodatés, dans la durée de la vidéo | ok |
| Aucune synthèse fabriquée | ok |
| Unités et points réels du CSV | ok |
| Image réellement servie | ok |
| Chemin hors index refusé | ok |
| Question via `/chat` : recherche jointe au 501 | ok |
| Question persistée, médias et graphiques joints | ok |
| Réponse marquée partielle, médias dans l'historique | ok |

Trois corrections issues de cette exécution :

1. la suite backend dépendait du corpus de développement (le nombre de messages
   d'une conversation changeait selon la machine) : `tests/conftest.py` isole
   désormais `MULTIMODAL_*` sur un corpus vide ;
2. un `.vtt` n'est pas indexé comme document mais rattaché à sa vidéo — l'écran
   de test attendait le mauvais décompte ;
3. un second passage ne réindexe rien (`unchanged`), ce qui est le comportement
   voulu : le contrôle accepte `indexés + inchangés`.

## 6. Build de production

```
dist/assets/index-*.css   100.13 kB │ gzip: 20.00 kB
dist/assets/index-*.js   326.09 kB │ gzip: 101.27 kB
✓ built in 893ms
```

## 7. Ce qui n'est pas vérifié — et pourquoi

| Élément | Raison |
|---|---|
| Rendu visuel navigateur (thème clair/sombre, responsive) | pas de navigateur automatisé dans cet environnement ; vérifié par build + jetons + contraste, pas par capture |
| Génération de réponse (`GROQ_API_KEY` absente) | adaptateur en stub : `501`, question persistée — conforme à l'exigence « aucune fausse donnée » |
| RAG / ChromaDB / recherche documentaire | non branché : aucun composant réel à tester |
| Médias et vidéos scientifiques | catalogue non connecté |
| Tests de composants React | pas de framework de test frontend installé |

## 8. Commandes

```bash
npm run check        # i18n + styles + encodage + contraste
npm run test:avatar  # générateur d'avatar (aucun service requis)
npm run test:flow    # parcours tableau de bord (backend requis)
npm run build        # build de production

cd backend && python -m pytest
```