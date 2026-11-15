# ARCHITECTURE — Frame in Freefall AI

> État réel après la refonte UX/UI (logotype, barre de question, réponse sur
> l'Accueil, pièces jointes) et l'intégration backend sessions / profils /
> conversations.
> L'audit initial est conservé dans `FRONTEND_AUDIT.md`, `BACKEND_AUDIT.md` et
> `ARCHITECTURE_AUDIT.md`.

---

## 1. Vue d'ensemble

```
┌──────────────────────────── NAVIGATEUR ────────────────────────────┐
│  Vite 8 + React 19                                                 │
│                                                                    │
│  main.jsx   (styles.css → answer.css → modern.css → layout.css      │
│              → ui.css ; l'ordre est significatif)                   │
│    └── App.jsx  (shell : sidebar, topbar, pages)                   │
│          ├── AuthProvider ──────── session, profil, capacités       │
│          ├── ConversationProvider ─ historique + `ask()` + phase    │
│          └── Shell                                                 │
│                ├── HomePage   (question + réponse rendue sur place) │
│                ├── ChatPage   (historique + conversation)          │
│                ├── LibraryPage                                     │
│                ├── ProfilePage                                     │
│                └── SettingsPage                                    │
│                                                                    │
│  src/i18n/            I18nProvider (fr / en), 223 clés par langue  │
│  src/lib/apiClient.js ── fetch unique, credentials include          │
│  src/lib/endpoints.js ── seuls chemins HTTP connus                  │
└───────────────────────────────┬────────────────────────────────────┘
                                │ HTTPS / proxy Vite `/api`
┌───────────────────────────────▼────────────────────────────────────┐
│ FastAPI  (backend/app)                                             │
│  /api/v1/auth      sessions (cookie HttpOnly)                      │
│  /api/v1/profile   profil + avatar                                 │
│  /api/v1/conversations  liste, détail, suppression                 │
│  /api/v1/chat      question persistée + génération                 │
│  /api/v1/chat/attachments  POST (téléversement), GET (téléchargement)│
│  /api/v1/media/search    ┐                                         │
│  /api/v1/science/compute ┘ adaptateurs OUVERTS (501)               │
│  /api/v1/system    santé, capacités                                │
│                                                                    │
│  services/adapters/  RAG · média · science · génération            │
│                      (contrats définis, non branchés)              │
└───────────────┬────────────────────────────┬───────────────────────┘
                │                            │
        ┌───────▼────────┐          ┌────────▼─────────┐
        │ SQLite (dev)   │          │ Supabase PG      │
        │ tests          │          │ migrations + RLS │
        └────────────────┘          └──────────────────┘

        Fichiers de données : ./var/avatars · ./var/attachments
        Non branchés : ChromaDB · Groq · catalogue média · pipeline ingestion
```

---

## 2. Frontend

```
src/
├── App.jsx                     shell + providers + navigation par état
├── main.jsx                    ordre des feuilles de style
├── components/
│   ├── Logo.jsx                logotype SVG (Logo, LogoLockup)
│   ├── QuestionComposer.jsx    barre de question + pièces jointes réelles
│   ├── LineChart.jsx           graphique SVG (line / area / bar)
│   ├── AnswerRenderer.jsx      réponse scientifique structurée
│   ├── SciValue.jsx            texte enrichi (unités, exposants)
│   ├── MediaFigure.jsx         image/vidéo + légende + états
│   └── PageHeading.jsx
├── data/
│   ├── constants.js            navigation, sujets, articles, textes
│   └── attachments.js          validation locale avant téléversement
├── features/
│   ├── home/     HomePage.jsx, HomeAnswerPanel.jsx, ResearchInsights.jsx
│   ├── chat/     ChatPage.jsx
│   ├── library/  LibraryPage.jsx
│   ├── profile/  ProfilePage.jsx
│   └── settings/ SettingsPage.jsx
├── i18n/
│   ├── I18nProvider.jsx        contexte t / locale / setLocale
│   └── translations.js         dictionnaires fr + en
├── lib/
│   ├── apiClient.js            fetch, timeout, ApiError, resolveUrl
│   ├── endpoints.js            contrats HTTP
│   ├── format.js               nombres, unités, exposants, dates, initiales
│   ├── photo.js                redimensionnement, data URL → File
│   ├── avatar.js               graine, palettes, motifs (logique pure)
│   ├── avatar-motif.jsx        dessin SVG du motif d'avatar
│   └── storage.js              localStorage tolérant aux pannes
├── state/
│   ├── AuthProvider.jsx
│   └── ConversationProvider.jsx
└── styles/
    ├── tokens.css              jetons de couleur clair + sombre
    ├── styles.css              base existante (réduite des règles mortes)
    ├── answer.css              blocs de réponse et graphiques
    ├── modern.css              thème, cartes, animations
    ├── layout.css              surcouche structurelle (shell, grille)
    ├── ui.css                  logotype, composer, panneaux, variantes
    ├── dashboard.css           Accueil transformé en tableau de bord
    └── theme-dark.css          surcharges sombres (générées)
```

### 2.1 Ordre des feuilles de style

`main.jsx` importe les feuilles dans cet ordre exact, qui est aussi l'ordre de
priorité de la cascade :

```
tokens.css → styles.css → answer.css → modern.css
→ layout.css → ui.css → dashboard.css → theme-dark.css
```

Trois règles structurantes :

- **`tokens.css` est la seule couche où une couleur est choisie.** Les autres
  feuilles consomment `var(--*)`. C'est ce qui permet de changer de thème sans
  réécrire un composant.
- **`layout.css`, `ui.css` et `dashboard.css` arrivent après la base** : ils
  surchargent la structure sans réécrire `styles.css`, dont les règles
  contradictoires d'origine sont neutralisées par la cascade.
- **`theme-dark.css` est généré et chargé en dernier.** Il est produit par
  `scripts/gen-theme-dark.mjs` depuis les couleurs littérales subsistantes, et
  n'est jamais écrit à la main (régénéré : `node scripts/gen-theme-dark.mjs`).

Le thème est appliqué par `data-theme="dark"` sur l'élément racine ; la
préférence système est lue une seule fois puis persistée, sans flash de thème.

`scripts/check-contrast.mjs` vérifie chaque couple couleur de jeton sur son fond
(WCAG : 4.5:1 pour le texte, 3:1 pour les tracés de graphique, 1.4:1 pour les
axes) et échoue si l'un d'eux passe sous le seuil. `scripts/check-styles.mjs`
échoue si une classe utilisée dans le JSX n'existe dans aucune feuille.

### 2.2 État conversationnel unique

`ConversationProvider` est l'unique source de vérité. L'Accueil et le Chat
appellent le même `ask(text, attachments)` et lisent la même `phase` :

| Phase | Signification |
|---|---|
| `idle` | rien en cours |
| `sending` | question transmise, enregistrement en cours |
| `waiting` | question persistée, génération en attente |
| `done` | réponse reçue et affichée |
| `unavailable` | service non connecté : question conservée, aucune réponse inventée |
| `error` | échec réseau ou serveur, message explicite |

| Mode | Comportement |
|---|---|
| Authentifié | `POST /api/v1/chat` → question persistée → rechargement canonique de la conversation |
| Non authentifié | réponse locale de démonstration + bandeau « mode hors ligne » |

Conséquence : une question posée depuis l'Accueil apparaît dans le Chat, et
réciproquement, y compris après rechargement et sur un autre appareil.

### 2.3 L'Accueil devient tableau de bord

`HomePage` rend deux états distincts, sans navigation intermédiaire :

| État | Contenu |
|---|---|
| Accueil (`idle`) | titre, `ResearchInsights`, barre de question, dock de suggestions |
| Tableau de bord (`sending`, `waiting`, `done`, `unavailable`, `error`) | en-tête de session, panneau de réponse, dock compact sticky |

Une question posée depuis l'Accueil bascule l'écran en tableau de bord : plus de
redirection vers `/chat`, donc plus de perte de contexte. « Ouvrir dans la
conversation » et « Nouvelle analyse » restent disponibles.

`AnalysisHeader` affiche les **compteurs réels** de la réponse
(`countBlocks`, `answer.references/media/charts`) : aucun chiffre n'est produit
si la réponse n'en contient pas. `HomeAnswerPanel` porte `aria-live="polite"` et
`aria-busy`, nomme explicitement le composant indisponible
(`COMPONENT_LABELS` : `generation`, `rag`, `media`, `science`) et n'affiche
jamais de réponse de substitution.

### 2.4 Avatar utilisateur

`lib/avatar.js` est une fonction pure : `buildAvatar(profile)` → graine
(`user_id`, à défaut e-mail, à défaut nom), palette duotone, motif géométrique,
rotation. La même personne retrouve donc le même avatar après rechargement, sur
un autre appareil et après reconnexion. Huit duotones et six motifs sont
distribués par FNV-1a ; `scripts/test-avatar.mjs` vérifie stabilité,
robustesse aux entrées manquantes et répartition.

`UserAvatar` rend l'avatar téléversé s'il existe, sinon le SVG engendré, sinon
la silhouette d'invité. `UserMenu` est le menu de session (profil, paramètres,
déconnexion) : `role="menu"`, fermeture par clic extérieur et `Échap`, focus sur
le premier item.

---

### 2.5 Gestion des erreurs

- `401` → événement `frameinff:unauthorized` → retour en mode anonyme.
- `501` (`not_implemented`) → `answer.serviceUnavailable` + `conversation_id` /
  `message_id` renvoyés par le backend : la question reste visible.
- Timeout 20 s (120 s pour `/chat` et les téléversements), message explicite.
- Aucun squelette fictif, aucun indicateur de progression inventé.

### 2.6 Crédit d'équipe

`TEAM_NAME` (`src/data/constants.js`) est l'unique source du nom d'équipe. Il est
affiché à quatre endroits, du plus visible au plus détaillé :

| Emplacement | Rôle | Visibilité |
|---|---|---|
| Barre supérieure (`.team-badge`) | rappel permanent | toutes les vues, chat compris ; masqué sous 1180 px |
| Bas de la barre latérale (`.sidebar-team`) | signature du poste | écrans larges |
| Pied de page (`.page-footer-team`) | mention légale | toutes les vues sauf le chat |
| Paramètres → À propos (`.settings-team`) | détail + phrase de contexte | explicite |

Le nom n'est jamais recopié dans le JSX : `scripts/check-styles.mjs` échoue si
`TEAM_NAME` disparaît ou si le nom est codé en dur. Les libellés passent par
`t('footer.team' | 'footer.teamLabel' | 'footer.teamTitle' | 'settings.team' |
'settings.teamText')`.

### 2.7 Internationalisation

`I18nProvider` expose `t(clé, variables)` et `locale`. Le contenu scientifique
(titres d'articles, réponses du modèle) n'est **jamais** traduit : seuls les
libellés d'interface le sont. `scripts/check-i18n.mjs` échoue si une clé manque
dans une langue ou si les deux dictionnaires divergent.

---

## 3. Backend

```
backend/app/
├── main.py                 FastAPI, CORS, middlewares, lifespan
├── api/
│   ├── deps.py             DbSession, Principal (user + session + profile)
│   └── v1/                 auth, profile, conversations, chat,
│                           capabilities, system, router
├── core/                   config, db, security, errors, ratelimit
├── models/                 user (User/Profile/Session), conversation
├── schemas/                auth, profile, chat (format de réponse)
└── services/
    ├── auth_service.py
    ├── profile_service.py
    ├── conversation_service.py
    ├── attachment_service.py   stockage validé des pièces jointes
    └── adapters/               base (Protocol), stubs (501), registry
```

### 3.1 Règles structurantes

1. **Identité** : `user_id` dérivé du cookie signé, jamais du client.
2. **Isolation** : toute requête filtrée par `user_id` ; ressource d'autrui → `404`.
3. **Persistance avant génération** : la question est enregistrée avant l'appel
   au générateur ; en cas de `501`, `conversation_id`, `message_id` et
   `question_persisted` sont renvoyés.
4. **Adaptateurs ouverts** : `registry.get_*()` renvoie un adaptateur
   `available = False` qui lève `AdapterNotConfigured` → `501`.
5. **Pièces jointes** : type MIME sur liste blanche, taille bornée, nom assaini,
   nom de fichier aléatoire côté serveur, un sous-dossier par utilisateur, aucun
   accès direct possible au fichier d'autrui.

### 3.2 Cycle de vie d'une pièce jointe

```
QuestionComposer ── POST /api/v1/chat/attachments (multipart)
        → attachment_service.save_attachment()
             → validation MIME + taille + nom
             → écriture sous var/attachments/<user_id>/<uuid>.<ext>
        ← 201 {attachment_id, filename, content_type, media_type, size_bytes, url}

Composer ── POST /api/v1/chat {text, attachments: [{attachment_id}]}
        → conversation_service.prepare_chat(attachments=…)
             → la question est persistée AVANT la génération
             → les métadonnées de pièces jointes sont enregistrées dans
               le contenu du message (aucune table dédiée)
        ← 501 NotConfigured {component, conversation_id, message_id,
                             question_persisted, attachments_persisted}

Navigateur ── GET /api/v1/chat/attachments/<id>  (portée utilisateur)
```

Aucune table `attachments` : les métadonnées vivent dans
`messages.content.attachments`, ce qui garde une seule source de vérité pour
l'historique. La migration vers une table dédiée se fera avec le RAG, qui aura
besoin d'indexer par `attachment_id`.

---

## 4. Brancher le RAG, le média, la science et la génération

### 4.1 Côté backend

```python
# backend/app/services/adapters/rag_impl.py
class QwenRag:
    name = "qwen3-embedding-0.6b"
    available = True

    def search(self, query, *, user_id, collections, limit):
        ...
```

```python
# au démarrage (lifespan)
from app.services.adapters import registry
registry.register("rag", QwenRag())
```

### 4.2 Collections ChromaDB

| Collection | Contenu | Isolation |
|---|---|---|
| `nasa_scientific_corpus` | corpus scientifique commun | lecture partagée |
| `user_documents` | documents privés | filtrage `user_id` **côté serveur** |

### 4.3 Côté frontend

Rien à modifier : le frontend consomme déjà le format `answer`
(`schema_version 1.0`) et sait rendre `text`, `image`, `video`, `chart`
(`line` / `area` / `bar`), `table`, `reference`, `limitation`.

---

## 5. Flux de données

### 5.1 Question posée

```
HomePage / ChatPage → QuestionComposer → ConversationProvider.ask()
      → POST /api/v1/chat {conversation_id?, text, attachments?}
            → conversation_service.prepare_chat()   (INSERT message user)
            → registry.get_generation()
                 ├─ indisponible → 501 + ids → rechargement conversation
                 └─ disponible   → réponse → INSERT message assistant
      → GET /api/v1/conversations/{id}  (affichage canonique)
      → phase: sending → waiting → done | unavailable | error
```

### 5.2 Session

```
POST /auth/session {email} → user + profile + session (cookie HttpOnly)
GET  /auth/session         → Principal (user, session, profile)
DELETE /auth/session       → révocation + suppression du cookie
```

---

## 6. Choix techniques assumés

| Choix | Justification |
|---|---|
| Python 3.14 (venv dédié) | écosystème scientifique maîtrisé, reproductible |
| SQLite en développement | zéro configuration, tests rapides ; PostgreSQL en production |
| SQLAlchemy générique + migration SQL | testable localement, RLS réelle en production |
| Cookie de session plutôt que JWT | révocation immédiate, pas de stockage client |
| Jetons opaques hachés | pas de signature à gérer, pas de secret partagé |
| Adaptateurs `Protocol` | brancher un composant sans toucher aux appelants |
| Graphique SVG maison (`LineChart.jsx`) | aucune dépendance, ~50 ko épargnés, contrôle total du rendu |
| `tokens.css` + `theme-dark.css` | un seul endroit décide d'une couleur ; le sombre est généré, pas recopié |
| `layout.css` + `ui.css` en surcouche | refonte structurelle sans réécrire `styles.css` |
| Pièces jointes sur disque local | suffisant pour un poste unique ; Supabase Storage ensuite |

---

## 7. Dette résiduelle

| Élément | Statut |
|---|---|
| `styles.css` encore chargé de règles historiques (media-queries dupliquées) | différé : découpage risqué, gain faible |
| Couleurs littérales résiduelles dans `styles.css` | traitées par `theme-dark.css` (généré) ; une vraie tokenisation reste à faire |
| `theme-dark.css` produit par heuristique | 247 règles déjà couvertes, 426 laissées telles quelles : une relecture manuelle est nécessaire |
| Pas de routeur (navigation par état) | assumé : pas de partage d'URL pour l'instant |
| Rate limiting par processus | à remplacer par un limiter distribué en production |
| Avatars et pièces jointes sur disque local | à migrer vers Supabase Storage en production |
| Pas de framework de test frontend | `test:avatar` et `test:flow` couvrent l'avatar et le parcours ; composants à couvrir ensuite (Vitest + Testing Library) |
| Accessibilité : focus trap, `alt`, tailles de cibles | partiellement traitée (skip-link, aria-live, menu utilisateur, navigation clavier des graphiques) |
| Clé `techlabs:unauthorized` résiduelle | renommer en `frameinff:unauthorized` |
| `email-validator` déclaré après coup | dépendance réelle de `pydantic[email]`, à épingler dans `requirements.txt` |
| `npm run test:flow` exige un backend démarré | à wrapper (démarrage + attente) |