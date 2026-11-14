# ARCHITECTURE — TechLabs

> État réel après la phase d'intégration (frontend + backend sessions/profils).
> L'audit initial est conservé dans `FRONTEND_AUDIT.md`, `BACKEND_AUDIT.md` et
> `ARCHITECTURE_AUDIT.md`.

---

## 1. Vue d'ensemble

```
┌──────────────────────────── NAVIGATEUR ────────────────────────────┐
│  Vite + React 19                                                   │
│                                                                    │
│  main.jsx                                                          │
│    └── App.jsx  (shell : sidebar, topbar, pages)                   │
│          ├── AuthProvider ──────── session, profil, capacités       │
│          ├── ConversationProvider ─ historique partagé              │
│          └── Shell                                                 │
│                ├── HomePage   (question rapide)                    │
│                ├── ChatPage   (historique + conversation)          │
│                ├── LibraryPage                                     │
│                ├── ProfilePage                                     │
│                └── SettingsPage                                    │
│                                                                    │
│  src/lib/apiClient.js  ── fetch unique, credentials include         │
│  src/lib/endpoints.js  ── seuls chemins HTTP connus                 │
└───────────────────────────────┬────────────────────────────────────┘
                                │ HTTPS / proxy Vite `/api`
┌───────────────────────────────▼────────────────────────────────────┐
│ FastAPI  (backend/app)                                             │
│  /api/v1/auth      sessions (cookie HttpOnly)                      │
│  /api/v1/profile   profil + avatar                                 │
│  /api/v1/conversations  liste, détail, suppression                 │
│  /api/v1/chat      question persistée + génération                 │
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

        Non branchés : ChromaDB · Groq · catalogue média · pipeline ingestion
```

---

## 2. Frontend

```
src/
├── App.jsx                     shell + providers + navigation par état
├── main.jsx
├── components/
│   ├── PageHeading.jsx
│   ├── AnswerRenderer.jsx      réponse scientifique structurée
│   └── MediaFigure.jsx         image/vidéo + légende + états
├── data/
│   └── constants.js            navigation, sujets, articles, textes
├── features/
│   ├── home/     HomePage.jsx, ResearchInsights.jsx (TrendChart)
│   ├── chat/     ChatPage.jsx  (historique + messages + composer)
│   ├── library/  LibraryPage.jsx
│   ├── profile/  ProfilePage.jsx (gate, carte, modale)
│   └── settings/ SettingsPage.jsx
├── lib/
│   ├── apiClient.js            fetch, timeout, ApiError, resolveUrl
│   ├── endpoints.js            contrats HTTP
│   ├── format.js               dates, initiales, aperçus
│   ├── photo.js                redimensionnement, data URL → File
│   ├── storage.js              localStorage tolérant aux pannes
│   └── useNasaArticles.js      illustrations NASA (API publique)
├── state/
│   ├── AuthProvider.jsx
│   └── ConversationProvider.jsx
└── styles/
    ├── styles.css              styles existants (inchangés)
    └── answer.css              nouveaux composants de réponse
```

### 2.1 État conversationnel unique

`ConversationProvider` est l'unique source de vérité. L'Accueil et le Chat
appellent le même `ask()` :

| Mode | Comportement |
|---|---|
| Authentifié | `POST /api/v1/chat` → la question est persistée, puis la conversation est rechargée depuis le serveur |
| Non authentifié | réponse locale de démonstration + bandeau « mode hors ligne » |

Conséquence : une question posée depuis l'Accueil apparaît dans le Chat, et
réciproquement, **après rechargement** et sur un autre appareil.

### 2.2 Gestion des erreurs

- `401` → événement `techlabs:unauthorized` → repasse en mode anonyme.
- `501` (`not_implemented`) → bandeau « service non configuré », question conservée.
- Timeout 20 s (120 s pour `/chat`), message explicite.
- Aucun squelette fictif, aucun indicateur de progression inventé.

---

## 3. Backend

```
backend/app/
├── main.py                 FastAPI, CORS, middlewares, lifespan
├── api/
│   ├── deps.py             DbSession, Principal (user + session + profile)
│   └── v1/                 auth, profile, conversations, chat, capabilities, system
├── core/                   config, db, security, errors, ratelimit
├── models/                 user (User/Profile/Session), conversation
├── schemas/                auth, profile, chat (format de réponse)
└── services/
    ├── auth_service.py
    ├── profile_service.py
    ├── conversation_service.py
    └── adapters/           base (Protocol), stubs (501), registry
```

### 3.1 Règles structurantes

1. **Identité** : `user_id` dérivé du cookie signé, jamais du client.
2. **Isolation** : toute requête filtrée par `user_id` ; ressource d'autrui → `404`.
3. **Persistance avant génération** : la question est enregistrée avant l'appel au
   générateur.
4. **Adaptateurs ouverts** : `registry.get_*()` renvoie un adaptateur `available = False`
   qui lève `AdapterNotConfigured` → `501`. Aucun contenu n'est fabriqué.

---

## 4. Brancher le RAG, le média, la science et la génération

### 4.1 Côté backend

Créer une classe conforme au protocole puis l'enregistrer :

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

Aucune réindexation n'est nécessaire : les collections existantes doivent être
inspectées (dimensions, distance, normalisation) avant tout branchement.

### 4.3 Côté frontend

Rien à modifier : le frontend consomme déjà le format `answer` (`schema_version 1.0`)
et sait rendre `text`, `image`, `video`, `chart`, `table`, `reference`, `limitation`.

---

## 5. Flux de données

### 5.1 Question posée

```
ChatPage/Accueil → ConversationProvider.ask()
      → POST /api/v1/chat {conversation_id?, text}
            → conversation_service.prepare_chat()   (INSERT message user)
            → registry.get_generation()
                 ├─ indisponible → 501 + ids → rechargement conversation
                 └─ disponible   → réponse → INSERT message assistant
      → GET /api/v1/conversations/{id}  (affichage canonique)
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
| Python 3.14 (venv dédié) | Python 3.15.1 installé mais écosystème scientifique non garanti |
| SQLite en développement | zéro configuration, tests rapides ; PostgreSQL en production |
| SQLAlchemy générique + migration SQL | testable localement, RLS réelle en production |
| Cookie de session plutôt que JWT | révocation immédiate, pas de stockage client |
| Jetons opaques hachés | pas de signature à gérer, pas de secret partagé |
| Adaptateurs `Protocol` | brancher un composant sans toucher aux appelants |
| `styles.css` existant conservé | préservation de l'identité visuelle, dette de CSS documentée |

---

## 7. Dette résiduelle

| Élément | Statut |
|---|---|
| `styles.css` non découpé (~25 sélecteurs morts, media-queries dupliquées) | différé (risque de régression élevé, gain faible) |
| Pas de routeur (navigation par état) | assumé : pas de partage d'URL pour l'instant |
| Rate limiting par processus | à remplacer par un limiter distribué en production |
| Avatars stockés sur disque local | à migrer vers Supabase Storage en production |
| Pas de tests frontend | à ajouter (Vitest + Testing Library) |
| Accessibilité : focus trap, `alt`, tailles de cibles | partiellement traitée |