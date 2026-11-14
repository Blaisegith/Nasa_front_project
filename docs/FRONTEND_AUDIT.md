# FRONTEND_AUDIT — TechLabs

> Périmètre : dépôt officiel `Blaisegith/Nasa_front_project`, branche `main` (commit `bd70c47`, 23 oct. 2026).
> Date de l'audit : 14 nov. 2026.
> Méthode : lecture intégrale du code, exécution réelle (`npm install`, `npm run build`), analyse statique du CSS et de l'historique Git.
> Aucune modification du code applicatif n'a été effectuée pendant l'audit.
>
> **Note** : ce rapport décrit l'état du projet **avant** intégration (phase 0). L'état après intégration est décrit dans `ARCHITECTURE.md`, `API_DOCUMENTATION.md` et `TEST_REPORT.md`.

---

## 1. Résultat d'exécution (faits vérifiés)

| Élément | Référence | État |
|---|---|---|
| `npm install` | 20 paquets | OK |
| `npm run build` | `vite build` | **OK** — `dist/index.html` 0,58 kB, CSS 55,45 kB (gzip 11,94), JS 254,94 kB (gzip 79,88), 1566 modules, 1,56 s |
| Avertissements de build | — | aucun |
| Tests automatisés | — | **aucun** (ni runner, ni fichier de test) |
| Lint / format | — | **aucun** (ni ESLint, ni Prettier, ni `tsconfig`) |

Le frontend compile et fonctionne. **La base est saine et doit être conservée.**

---

## 2. Inventaire réel du projet

```
Nasa_front_project/
├── .gitignore              # node_modules, dist, .env*, .vite
├── index.html              # 484 o — <!doctype html>, lang="fr", #root
├── package.json            # 443 o — scripts dev/build/preview
├── package-lock.json
├── Maquette NASA.png       # 1,6 Mo — référence visuelle
└── src/
    ├── main.jsx            # 246 o — createRoot + StrictMode
    ├── App.jsx             # 32 142 o — 416 lignes, TOUTE l'application
    └── styles.css          # 57 646 o — 290 lignes (lignes très longues)
```

**Il n'y a pas de `vite.config.js`.** `@vitejs/plugin-react` est déclaré dans `package.json` mais jamais chargé : pas de Fast Refresh, pas de configuration de build explicite, pas de proxy de développement.

**Il n'y a ni routeur, ni client HTTP, ni store d'état, ni dossier `components/`, `pages/`, `services/`, `hooks/`, `api/`.**

---

## 3. Architecture logicielle observée

### 3.1 Navigation

Navigation **100 % en état local**, sans URL :

```js
const [activePage, setActivePage] = useState('home');   // App.jsx:94
```

- `navigation` (App.jsx:9-15) : `home`, `chat`, `explore`, `profile`.
- `settings` est ajoutée en dur dans la sidebar (App.jsx:176) mais **absente de `navigation` et de `sectionCopy`** → `activeCopy` vaut `undefined` sur cette page (sans crash, car `SettingsPage` n'utilise pas `copy`).
- Conséquences : pas de lien profond, pas de bouton « retour » navigateur, pas de rechargement positionné, pas de partage d'URL d'une conversation.

### 3.2 État global (un seul composant)

Tout l'état applicatif vit dans `App` (App.jsx:93-160) :

| State | Rôle | Persistance |
|---|---|---|
| `activePage` | page courante | — |
| `mobileNavOpen` | menu mobile | — |
| `searchQuery`, `articleFilter` | recherche bibliothèque | — |
| `messages` | **historique conversationnel** | **aucune (perdu au rechargement)** |
| `draft` | brouillon de question | — |
| `articles` | veille NASA | — |
| `profile` | profil utilisateur | `localStorage['nasa-profile']` |
| `editingProfile` | édition en cours | — |
| `savedArticles` | favoris | **aucune** |
| `theme` | thème clair/sombre | `localStorage['nasa-theme']` |

### 3.3 Composants

`PageHeading`, `HomePage`, `ResearchInsights`, `TrendChart`, `ChatPage`, `LibraryPage`, `ArticleRow`, `ProfilePage`, `SettingsPage`.

Points remarquables :
- `messages` est **déjà partagé** entre `HomePage` (question rapide, App.jsx:237) et `ChatPage` (App.jsx:202). C'est exactement la bonne base pour l'architecture conversationnelle unifiée demandée (§7 du cahier des charges) : **un seul tableau, deux vues**. Cet acquis doit être préservé.
- `TrendChart` (App.jsx:284) est un SVG généré avec des courbes **schématiques** (chemins SVG codés en dur). La mention « schématique » est correctement affichée (`chart-disclaimer`) : à ne pas faire disparaître.

### 3.4 Persistance de `profile`

- Écriture : `saveProfile()` (App.jsx:151) → `localStorage.setItem('nasa-profile', JSON.stringify(...))` avec `try/catch` et message d'erreur.
- Lecture : `JSON.parse(window.localStorage.getItem('nasa-profile'))` **sans `try/catch`** (App.jsx:102-103).
- La photo est convertie en **data URL JPEG** redimensionnée à 512 px max (`createProfilePhoto`, App.jsx:62-80), qualité 0,82 → ~40–90 kB par photo, stockée dans le même `localStorage` que tout le reste (quota navigateur ~5 Mo).

### 3.5 Réponses de l'assistant

`assistantReply()` (App.jsx:82-91) : **3 réponses câblées en dur** (flamme / sécurité / cas général). C'est un placeholder, pas un moteur IA. C'est le **point de branchement** prévu pour le futur RAG.

### 3.6 Appels réseau existants

Un seul, depuis le navigateur (App.jsx:113-130) :

```
GET https://images-api.nasa.gov/search?q=SoFIE%20Growth%20Extinction%20Limits&media_type=image&page_size=8
```

- Pas de clé requise, `AbortController` correctement utilisé.
- Échec silencieux (`.catch(() => {})`) : comportement dégradé propre.
- Mais : dépendance directe navigateur → API tierce, non proxifiée, non cachée, non contrôlée. À terme, ce type d'appel doit passer par le backend (contrôle du quota, traçabilité, cache).

---

## 4. Audit CSS (`styles.css`, 57,6 kB)

Structure : un seul fichier, **aucun préprocesseur**, conventions maison.

- **Jetons de design** en tête de fichier (`:root`, styles.css:3) : `--ink`, `--muted`, `--line`, `--blue`, `--pale`, `--coral`, `--green`, `--gold`. Bonne base, mais **sous-utilisée** : la majorité des règles utilisent des couleurs hexadécimales en dur.
- **Thème** : attribut `data-theme="light|dark"` sur `.app-shell`, avec un bloc de surcharges `.app-shell[data-theme="dark"]` (styles.css:11-41) **et** un bloc `.app-shell[data-theme="light"]` (styles.css:42-59) qui redéfinit la sidebar et la topbar. Les deux thèmes déclarent donc le même composant avec des moyens différents.
- **Responsive** : 3 breakpoints (1100 / 820 / 600 px) + `prefers-reduced-motion` (styles.css:9). Les breakpoints sont **répétés 5 fois** dans le fichier (lignes 6-8, 62, 75-77, 116-117, 134, 172, 198, 216, 235-240, 290), avec des redéfinitions concurrentes de `.main-area` et `.topbar` → la cascade est devenue difficile à prévoir.
- **Empilement de correctifs** : le fichier s'est construit par rustines successives. Les blocs des lignes 60-290 surchargent des règles des lignes 4-9 au lieu de les remplacer.
- **CSS mort** : de nombreux sélecteurs n'ont plus d'élément correspondant dans `App.jsx`, vestiges d'écrans supprimés : `.chat-topline`, `.chat-context`, `.chat-messages`, `.assistant-avatar`, `.suggestions`, `.quote-band`, `.quote-mark`, `.quote-credit`, `.quote-arrow`, `.breadcrumb`, `.topbar-date`, `.mission-note`, `.mission-icon`, `.sidebar-footer`, `.notification-button`, `.notification-popover`, `.close-nav`, `.metric`, `.metric-row`, `.metric-icon`, `.home-article`, `.home-article-list`, `.chat-panel`, `.composer-shortcut`, `.chat-empty`. Ce code augmente le poids et le risque de régression.
- **Polices** : `@import` Google Fonts (styles.css:1) — bloquant, requête tierce, variable selon le réseau.
- **Image externe** : la sidebar s'appuie sur `https://www.equascience.com/img/cms/Univers.jpg` (styles.css:13 et 42), **hotlink non contrôlé** : disponibilité et droits non garantis. À remplacer par un asset local.

---

## 5. Audit accessibilité et ergonomie

### Points corrects
- `lang="fr"`, `<title>`, `meta description` (index.html).
- Navigation en `<button>` dans `<nav aria-label="Navigation principale">`.
- `aria-live="polite"` sur le flux de messages (App.jsx:316).
- Icônes décoratives correctement masquées quand c'est pertinent (`aria-hidden` sur `nasa-mark`).
- `aria-label` sur les boutons icônes, labels explicites sur les champs.
- `role="switch"` + `aria-checked` sur les réglages.
- Respect de `prefers-reduced-motion`.

### Défauts constatés
1. **Aucune gestion du focus** : la modale d'édition (App.jsx:406) n'a ni focus trap, ni fermeture par `Échap`, ni restitution du focus. Le menu mobile (`mobile-scrim`) ne piège pas non plus le focus.
2. **`alt` manquants** : les visuels passent par `background-image` CSS (feature image, vignettes d'articles) → invisibles pour les lecteurs d'écran. Le composant image est un **déficit structurel** : il n'existe pas de `<img>`/`<figure>` réutilisable avec légende, crédit et source.
3. **Contraste à vérifier** : `--muted: #7890ae` sur fond `#f3f7fc` et plusieurs textes de 8–10 px (`.article-info p`, `.chart-disclaimer`, `.page-footer`) — tailles et contrastes probablement sous les seuils WCAG AA.
4. **Cibles tactiles** : plusieurs boutons `.icon-button` et `.filter-tabs button` sous 44×44 px.
5. **Titres hiérarchiques** : `h1` dans `PageHeading`, mais `HomePage` insère aussi un `h1` dans `chat-welcome` (App.jsx:317) → deux `h1` possibles selon la page, et pas de `h2` de section cohérent.
6. **Aucun état de chargement** sur les appels (images NASA), ni squelette, ni message d'erreur.
7. **Aucun lien d'évitement** (« Aller au contenu »), pas de `main id`.

---

## 6. Ce qui fonctionne et doit être conservé

Éléments à **ne pas** réécrire :

1. **L'identité visuelle** : palette, `nasa-mark`, sidebar sombre, `feature-grid`, `science-stats`, `chart-card`, `article-row`, `account-gate`, `profile-card`. Elle est cohérente, moderne, et correspond à la maquette `Maquette NASA.png`.
2. **Le thème clair/sombre** avec persistance.
3. **La structure `app-shell` / `sidebar` / `main-area`** et ses 3 breakpoints.
4. **Le partage de `messages` entre Accueil et Chat** : socle exact de l'architecture conversationnelle unifiée.
5. **Le redimensionnement d'image de profil côté client** (`createProfilePhoto`) : à conserver, mais à **déplacer vers le backend** à terme.
6. **La question rapide de la page d'accueil**, qui est une excellente signature UX (le positionnement sticky a fait l'objet de 6 commits).
7. **Les trois réponses de démonstration** de `assistantReply`, à remplacer par un appel API — pas à supprimer brutalement (elles servent de fallback hors ligne).
8. **Les graphiques schématiques** de `ResearchInsights` (avec leur mention).

---

## 7. Ce qui est cassé, incomplet ou risqué

### Bugs identifiés

| # | Constat | Localisation | Gravité |
|---|---|---|---|
| B1 | `JSON.parse(localStorage)` sans garde : un `nasa-profile` corrompu **plante l'application au démarrage** | App.jsx:102-103 | **Haute** |
| B2 | Le bouton « Lire l'article » ouvre `https://www.nasa.gov/` générique, pas l'article affiché | App.jsx:350 | Moyenne |
| B3 | `draftProfile` de `ProfilePage` est figé à l'initialisation ; après sauvegarde, l'état local n'est pas resynchronisé (incohérences possibles entre carte et modale) | App.jsx:354 | Moyenne |
| B4 | Pas de déconnexion ni de suppression de compte : le profil local est définitif | App.jsx:353-408 | Moyenne |
| B5 | Aucun état vide ≠ « invité » : le chat est utilisable sans compte, sans avertissement | App.jsx:313 | Basse |
| B6 | `messages` non persisté : toute conversation est perdue au rechargement | App.jsx:98 | **Haute** (fonctionnalité cœur manquante) |
| B7 | `savedArticles` non persisté | App.jsx:106 | Moyenne |
| B8 | `SettingsPage` : interrupteurs non persistés, purement cosmétiques | App.jsx:410 | Basse |
| B9 | `sectionCopy` sans entrée `settings` | App.jsx:47-52 | Basse |
| B10 | Doublons de clés React si deux messages ont le même `time` + index (improbable mais la clé n'est pas stable) | App.jsx:317 | Basse |
| B11 | Aucun garde-fou : `profile.name` vide possible via manipulation du localStorage → `Bonjour, ` | App.jsx:201 | Basse |

### Manques structurels (bloquants pour la suite)

| # | Manque | Impact |
|---|---|---|
| M1 | **Aucun client API** (fetch typé, gestion d'erreurs normalisée, timeout, retry) | Impossible de brancher un backend proprement |
| M2 | **Aucune authentification** : pas de session, pas de jeton, pas d'état « connecté/invité » | Le backend ne peut pas identifier l'utilisateur |
| M3 | **Aucun modèle de données conversationnel** : messages sans `id`, sans `conversation_id`, sans horodatage ISO, sans statut | Rendu impossible du format structuré (texte + médias + graphiques + références) |
| M4 | **Aucun composant de rendu de réponse structurée** (blocs texte / image / vidéo / graphique / tableau / référence) | Les réponses multimodales futures ne pourront pas s'afficher |
| M5 | **Aucun composant média** (`<figure>` + légende + source + crédit + états d'erreur) | Images et vidéos non conformes au cahier des charges §6.3/§6.4 |
| M6 | **Pas de routeur** | Pas d'URL partageable, pas de retour arrière |
| M7 | **Pas de `vite.config.js`** | Pas de proxy `/api` en développement, pas de Fast Refresh |
| M8 | **Pas de variables d'environnement** | Impossible de configurer l'URL du backend par environnement |
| M9 | **Pas de gestion des états de traitement** (analyse / recherche / calcul / génération) | L'utilisateur ne saura pas ce que fait l'IA |
| M10 | **Pas de tests** | Aucune non-régression possible |

---

## 8. Dette technique et dette de sécurité

| Élément | Risque |
|---|---|
| `package.json` : `"vite": "latest"`, `"react": "latest"`, `"react-dom": "latest"`, `"@vitejs/plugin-react": "latest"` | Build **non reproductible**. `npm install` a d'ailleurs modifié `package-lock.json` (3 lignes) : signe que les plages `latest` ne sont pas stables. **À épingler.** |
| Hotlink `equascience.com` | Casse silencieuse possible, question de droits |
| `@import` Google Fonts | Requête tierce bloquante, dépendance au réseau |
| `Maquette NASA.png` (1,6 Mo) suivi dans Git | Acceptable (référence de design), mais à ne pas servir au runtime |
| Aucun `.env`, aucun secret dans l'historique | **Vérifié** : `git log -p` ne contient ni clé `sk-…`, ni `AIza…`, ni JWT, ni `SUPABASE_*`, ni `GROQ_API_KEY`, ni clé privée. **Aucun secret exposé, aucune rotation nécessaire à ce stade.** |
| `gitignore` | Correct : `.env`, `.env.*`, `dist/`, `node_modules/`, `.vite/`. Manque `*.local`, `.DS_Store`, coverage. |

---

## 9. Plan de modification du frontend

### 9.1 Principes directeurs

1. **On conserve l'identité visuelle et les composants existants.** Toute évolution passe par l'ajout, pas par la réécriture.
2. **On extrait, on ne duplique pas** : découpage de `App.jsx` en dossiers, sans changer le rendu.
3. **L'état conversationnel devient une source de vérité unique** (`conversation`), partagée Accueil + Chat, persistée via le backend.
4. **Le frontend ne connaît que des contrats HTTP.** Il ne parle jamais à ChromaDB, ni à Supabase directement (hors `anon key` si nécessaire), ni à Groq.

### 9.2 Étapes

| Étape | Contenu | Risque de régression |
|---|---|---|
| **E1 — Socle technique** | Épingler les versions, ajouter `vite.config.js` (plugin React + proxy `/api`), `.env.example`, variables `VITE_API_BASE_URL`, ESLint + Prettier, Vitest + Testing Library. Aucun changement visuel. | Très faible |
| **E2 — Découpage** | Extraire `App.jsx` vers `src/components/`, `src/pages/`, `src/features/chat/`, `src/features/profile/`, `src/features/library/`, `src/data/`, `src/lib/`. `styles.css` découpé en `styles/base.css`, `styles/layout.css`, `styles/components/*.css`, `styles/themes.css` — **sans supprimer de règle**, en déplaçant. | Faible (build + revue visuelle) |
| **E3 — Couche API** | `src/lib/apiClient.ts` (base URL, timeout, `AbortController`, extraction d'erreur normalisée `ApiError`, gestion 401/403/429/5xx), `src/lib/endpoints.ts` (auth, profils, conversations). | Faible |
| **E4 — Session & profil** | `AuthProvider` (utilisateur courant, statut, `login`, `logout`, `refresh`), écran de connexion (nom + e-mail, sans mot de passe — cf. §9 du cahier des charges), routage conditionnel, `useProfile`. **Suppression du calcul de `user_id` côté client.** | Moyen |
| **E5 — Modèle conversationnel** | Types `Conversation`, `Message`, `AnswerBlock` (texte / image / vidéo / graphique / tableau / référence / limites) versionnés (`schema_version`). Store unique, `conversationId` stable, messages datés en ISO 8601. | Moyen |
| **E6 — Synchronisation Accueil ⇄ Chat** | La question rapide crée un message dans **la même** conversation ; le Chat affiche l'historique complet. Pagination / chargement différé. Reprise de conversation. | Moyen |
| **E7 — Rendu des réponses** | `AnswerRenderer` + `TextBlock`, `MediaFigure` (image), `MediaPlayer` (vidéo), `ChartBlock`, `DataTableBlock`, `ReferenceList`, `LimitationsBlock`. États : chargement / indisponible / format non supporté / accès refusé / source externe. **Aucune donnée inventée** : un bloc absent n'est pas rendu. | Moyen |
| **E8 — Traitement & erreurs** | Indicateurs d'étape réels (analyse → recherche → calcul → génération), squelettes, messages d'erreur explicites, gestion des quotas. Pas de fausse progression. | Faible |
| **E9 — Finitions** | Focus trap + `Échap` sur la modale, lien d'évitement, `alt`/`figure` sur tous les visuels, tailles de cibles 44 px, nettoyage du CSS mort (après E2, avec vérification visuelle), remplacement du hotlink par un asset local, métadonnées Open Graph + favicon. | Faible |
| **E10 — Vérification** | Build, tests unitaires, tests e2e (navigation, responsive, chat, profil, erreurs), revue responsive 360 / 768 / 1024 / 1440. | — |

### 9.3 Ce qui n'est **pas** dans le périmètre frontend

- Le moteur de réponse IA (le frontend appellera `POST /api/v1/chat`, le backend se chargera du reste).
- L'ingestion et l'indexation des médias.
- Le stockage Supabase Storage (le frontend recevra des URL signées).

---

## 10. Recommandation

**La base est bonne et doit être conservée.** Le travail prioritaire n'est pas de « refaire le design » mais de :

1. sécuriser le socle (versions épinglées, config Vite, lint, tests) ;
2. sortir de l'état global unique vers des features ;
3. introduire un client API et un modèle de session ;
4. remplacer les messages éphémères par un modèle conversationnel persistant et partagé ;
5. créer les composants de rendu multimodal **vides de données mais prêts** (contrats définis, aucun contenu scientifique inventé).

Le point d'attention principal reste **B6 (`messages` non persisté)** : c'est la fonctionnalité cœur du cahier des charges (« une question posée depuis l'un doit être visible dans l'autre »), et elle dépend entièrement du backend.