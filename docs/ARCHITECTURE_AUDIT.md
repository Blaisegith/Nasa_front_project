# ARCHITECTURE_AUDIT — TechLabs

> Périmètre : dépôt officiel `Blaisegith/Nasa_front_project`, branche `main` (commit `bd70c47`).
> Date de l'audit : 14 nov. 2026.
> Mission : audit global du projet, des composants réellement existants et de leurs relations.
>
> **Note** : ce rapport décrit l'état du projet **avant** intégration (phase 0). L'état après intégration est décrit dans `ARCHITECTURE.md`, `API_DOCUMENTATION.md` et `TEST_REPORT.md`.

---

## 1. Vue d'ensemble

### 1.1 Ce qui existe

```
┌──────────────────────────────────────────────────────────────┐
│                     NAVIGATEUR (seul runtime)                │
│                                                              │
│  index.html ──► src/main.jsx ──► src/App.jsx  (416 lignes)   │
│                                      │                       │
│                                      ├── state local (10)    │
│                                      ├── localStorage        │
│                                      │     ├─ nasa-theme     │
│                                      │     └─ nasa-profile   │
│                                      └── fetch direct        │
│                                            │                 │
└────────────────────────────────────────────┼─────────────────┘
                                             ▼
                        https://images-api.nasa.gov/search
```

### 1.2 Ce qui n'existe pas

- Aucun backend (FastAPI ou autre).
- Aucune base de données.
- Aucune authentification.
- Aucun routeur.
- Aucun client API.
- Aucun RAG / ChromaDB dans ce dépôt.
- Aucun modèle génératif.
- Aucun pipeline média.
- Aucun test.
- Aucun déploiement.

---

## 2. Cartographie des composants

### 2.1 Composants frontend (réels)

| Fichier | Lignes | Rôle | Dépendances |
|---|---|---|---|
| `index.html` | 13 | Point d'entrée HTML, `#root` | — |
| `src/main.jsx` | 10 | Bootstrap React 19 | `react-dom/client` |
| `src/App.jsx` | 416 | **100 % de l'application** | `react`, `lucide-react`, `localStorage`, `images-api.nasa.gov` |
| `src/styles.css` | 290 | Styles globaux, 2 thèmes | Google Fonts, `equascience.com` (image) |

Sous-composants internes à `App.jsx` :

```
App
├── Sidebar (inline)          navigation + settings
├── Topbar (inline)           marque, thème, chip utilisateur
├── HomePage                  PageHeading + feature-grid + ResearchInsights + question rapide
│   └── ResearchInsights      science-stats + TrendChart ×2
├── ChatPage                  chat-stream + chat-dock
├── LibraryPage               topic-strip + library-tools + article-list
│   └── ArticleRow
├── ProfilePage               account-gate (création) | profile-layout (profil + édition)
└── SettingsPage              notifications (local only)
```

### 2.2 Dépendances (réseau et tierces)

| Dépendance | Type | Criticité | Remplaçable |
|---|---|---|---|
| `images-api.nasa.gov` | API publique, navigateur → tiers | Moyenne | Oui, par le backend |
| Google Fonts (`@import`) | Feuille de style tierce | Faible | Oui, par auto-hébergement |
| `equascience.com/img/cms/Univers.jpg` | Image tierce hotlinkée | **Élevée** (disponibilité + droits) | Oui, asset local |
| `nasa.gov` (liens articles) | Lien sortant générique | Faible | À terme, URL réelle par article |

---

## 3. Flux actuels

### 3.1 Création de profil (existant)

```
Formulaire (nom, e-mail, photo)
   │
   ├─ createProfilePhoto(file)  → canvas 512 px → data URL JPEG
   │
   └─ saveProfile()
          ├─ localStorage['nasa-profile'] = JSON
          └─ setProfile()
                │
                └─ affiché dans Topbar, HomePage (greeting), ProfilePage
```

**Limite** : aucune identité vérifiée, aucune donnée partagée entre appareils, aucune isolation serveur.

### 3.2 Question de l'utilisateur (existant)

```
Question (Accueil ou Chat)
   │
   └─ sendMessage()
          ├─ messages += { role:'user', text, time }
          └─ messages += { role:'assistant', text: assistantReply(text), time }
```

**Limite** : réponse câblée en dur, aucun `id`, aucune persistance, aucune référence, aucun média.

---

## 4. Architecture cible

### 4.1 Principe

Le backend devient **l'unique point de sortie** et **l'unique source de vérité** pour les utilisateurs, les sessions, les conversations et les médias. Le frontend ne conserve qu'un cache d'affichage et un brouillon.

### 4.2 Diagramme cible

```
                    ┌───────────────────────┐
                    │  CLOUDFLARE PAGES     │
                    │  SPA React + Vite     │
                    └───────────┬───────────┘
                                │ HTTPS  (VITE_API_BASE_URL)
                                ▼
                    ┌───────────────────────┐
                    │  ORACLE CLOUD VM      │
                    │  FastAPI (uvicorn)    │
                    │  /api/v1/*            │
                    └───┬───┬───┬───┬───────┘
                        │   │   │   │
        ┌───────────────┘   │   │   └───────────────┐
        ▼                   ▼   ▼                   ▼
 ┌────────────┐    ┌──────────────┐    ┌──────────────────┐
 │  SUPABASE  │    │  CHROMADB    │    │  GROQ (LLM)      │
 │ Postgres   │    │  RAG NASA    │    │  génération      │
 │ + RLS      │    │  persistant  │    │  (non branché)   │
 │ + Storage  │    │              │    │                  │
 └────────────┘    └──────────────┘    └──────────────────┘
        │                   │                    │
        └───────────────────┴────────────────────┘
                            │
                   ┌────────▼─────────┐
                   │  ADAPTATEURS     │
                   │  OUVERTS         │
                   │  (non connectés) │
                   └──────────────────┘
```

### 4.3 Découpage backend proposé

```
backend/
├── app/
│   ├── main.py               # FastAPI, CORS, middlewares, montage des routers
│   ├── api/
│   │   ├── deps.py           # dépendances (session courante, DB)
│   │   └── v1/
│   │       ├── router.py
│   │       ├── auth.py       # POST /auth/session, DELETE /auth/session
│   │       ├── profile.py    # GET/PATCH /me, POST /me/avatar
│   │       ├── chat.py       # POST /chat  (adaptateur ouvert)
│   │       ├── media.py      # GET /media/search (adaptateur ouvert)
│   │       └── science.py    # POST /science/compute (adaptateur ouvert)
│   ├── core/
│   │   ├── config.py         # Settings (pydantic-settings), .env
│   │   ├── security.py       # jetons opaques, cookies signés, hachage
│   │   ├── logging.py
│   │   └── errors.py         # hiérarchie d'erreurs → réponses JSON
│   ├── models/               # ORM SQLAlchemy (users, profiles, conversations…)
│   ├── schemas/              # Pydantic v2 (entrées/sorties, versionnées)
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── profile_service.py
│   │   ├── conversation_service.py
│   │   └── adapters/         # ← COUCHE DE BRANCHEMENT
│   │       ├── base.py       # Protocol + Capability
│   │       ├── rag.py        # IngestError / NotImplemented → 501
│   │       ├── media.py
│   │       ├── science.py
│   │       └── llm.py
│   ├── middleware/
│   │   ├── rate_limit.py
│   │   └── request_id.py
│   └── utils/
├── migrations/               # SQL + politiques RLS
├── tests/                    # pytest + httpx
├── requirements.txt
├── Dockerfile
└── docker-compose.yml
```

### 4.4 Contrats ouverts (non connectés)

Chaque adaptateur expose un **protocole Python** et une **route HTTP**, mais l'implémentation livrée est neutre :

```python
class RagAdapter(Protocol):
    def search(self, query: str, *, user_id: UUID | None,
               collections: list[str]) -> list[Chunk]: ...
```

```json
// Réponse HTTP renvoyée par un adaptateur non branché
{
  "error": {
    "code": "not_implemented",
    "message": "La recherche documentaire n'est pas encore configurée.",
    "component": "rag"
  }
}
```

Règles absolues :
- **Aucune réponse scientifique fabriquée.**
- **Aucune référence inventée.**
- **Aucun média simulé.**
- La route existe, répond proprement, et documente ce qui manque.

---

## 5. Modèle de données cible

### 5.1 Tables (Supabase PostgreSQL)

```sql
users             (id uuid pk, email citext unique, created_at, last_seen_at)
profiles          (user_id uuid pk → users.id, display_name, bio, avatar_url,
                   avatar_path, updated_at)
sessions          (id uuid pk, user_id → users.id, token_hash, expires_at,
                   revoked_at, created_at, ip, user_agent)
conversations     (id uuid pk, user_id → users.id, title, created_at,
                   updated_at, archived_at)
messages          (id uuid pk, conversation_id → conversations.id,
                   role, content jsonb, status, created_at, sequence)
message_blocks    (id uuid pk, message_id → messages.id, kind, payload jsonb,
                   position)
documents         (id uuid pk, user_id → users.id, title, mime, size,
                   storage_path, checksum, created_at)          -- documents privés
media_assets      (id uuid pk, media_type, title, description, source,
                   experiment, file_path, thumbnail_path, source_url,
                   license, duration, timestamp, document_id, metadata jsonb)
ingestion_runs    (id uuid pk, kind, status, stats jsonb, started_at, finished_at)
```

`media_assets` correspond exact le catalogue demandé au §6.5 du cahier des charges. Il est **créé mais non rempli** par le pipeline média (hors périmètre de cette phase).

### 5.2 Format de réponse (versionné)

```json
{
  "schema_version": "1.0",
  "conversation_id": "uuid",
  "message_id": "uuid",
  "status": "completed",
  "answer": {
    "summary": "…",
    "scientific_explanation": "…",
    "simple_explanation": "…",
    "arguments": [],
    "references": [],
    "media": [],
    "charts": [],
    "limitations": []
  }
}
```

Ce format est **le contrat entre le backend et les deux interfaces** (Accueil et Chat). Il est partagé, versionné, et extensible par `kind` de bloc.

### 5.3 Règles d'intégrité

- `user_id` n'est jamais accepté depuis le corps de la requête : il est dérivé de la session.
- `conversations.user_id` + RLS ⇒ isolation stricte.
- `messages.sequence` garantit l'ordre d'affichage.
- Tout bloc de réponse référence `message_id` : un bloc orphelin est impossible.

---

## 6. Dépendances entre composants

```
      ┌──────────────────────────────────────────────┐
      │ 1. Socle (config, env, build, lint, tests)    │
      └───────────────────┬──────────────────────────┘
                          ▼
      ┌──────────────────────────────────────────────┐
      │ 2. Client API frontend (apiClient + types)    │
      └───────────────────┬──────────────────────────┘
                          ▼
      ┌──────────────────────────────────────────────┐
      │ 3. Backend : users / sessions / profils       │
      └──────┬───────────────────────────┬───────────┘
             ▼                           ▼
  ┌────────────────────┐      ┌────────────────────────┐
  │ 4. Frontend session │      │ 5. Supabase + RLS       │
  │    + profil branché │◄─────┤    + migrations         │
  └─────────┬──────────┘      └────────────────────────┘
            ▼
  ┌────────────────────────────────────────────────────┐
  │ 6. Modèle conversationnel (store unifié)            │
  └──────┬──────────────────────────────┬──────────────┘
         ▼                              ▼
  ┌──────────────────┐      ┌────────────────────────────┐
  │ 7. Synchronisation│      │ 8. Adaptateurs ouverts      │
  │    Accueil ⇄ Chat │      │    (501 jusqu'à connexion) │
  └──────────────────┘      └────────────────────────────┘
```

**Règle de non-régression** : chaque étape doit laisser l'application **compilable et fonctionnelle**. Une étape qui casse l'affichage est bloquante.

---

## 7. Risques de régression

| Risque | Probabilité | Impact | Parade |
|---|---|---|---|
| Casser l'identité visuelle en découpant `styles.css` | Moyenne | Élevée | Découpage par déplacement, revue visuelle page par page, capture avant/après |
| Perdre le partage Accueil ⇄ Chat | Faible | **Élevée** | Le store conversationnel est créé **avant** toute modification d'écran ; tests dédiés |
| Casser la question rapide sticky | Moyenne | Moyenne | 6 commits y ont été consacrés : ne pas toucher à la structure `.quick-question` |
| Remplacer les réponses de démo par du vide | Élevée | Moyenne | Fallback explicite « service non configuré », jamais de faux contenu |
| Erreur RLS | Moyenne | **Élevée** | Tests d'isolation automatisés (deux utilisateurs, vérification 403/404) |
| Dépendances Python incompatibles | Moyenne | Moyenne | Vérification d'installation immédiate, venv dédié, versions épinglées |
| Push non autorisé | — | — | Aucun push sans accord explicite ; branche dédiée |

---

## 8. Ordre d'implémentation recommandé

| Phase | Contenu | Critère de sortie |
|---|---|---|
| **P1 — Socle** | Versions épinglées, `vite.config.js`, `.env.example`, ESLint/Prettier, Vitest | Build OK, `npm run lint` OK |
| **P2 — Découpage frontend** | `src/components`, `src/pages`, `src/features/*`, `src/lib`, `src/data` ; CSS éclaté sans perte | Rendu **identique** à `main` |
| **P3 — Backend socle** | FastAPI, config, erreurs, logging, CORS, health | `/health` répond, docs OpenAPI générées |
| **P4 — Session & profils** | Modèle, Supabase, RLS, cookies signés, rate limit | Connexion → `/me` → déconnexion testés |
| **P5 — Client API + session frontend** | `apiClient`, `AuthProvider`, écran de connexion | Parcours complet dans le navigateur |
| **P6 — Modèle conversationnel** | Types, store, `conversation_id`, persistance | Une question posée depuis l'Accueil est visible dans le Chat après rechargement |
| **P7 — Rendu de réponse** | `AnswerRenderer` et blocs (image, vidéo, graphique, tableau, référence, limites) | Rendu d'un exemple complet, états d'erreur testés |
| **P8 — Adaptateurs ouverts** | `rag`, `media`, `science`, `llm` → `501` documentés | OpenAPI + tests de contrat |
| **P9 — Finitions** | Accessibilité, responsive, nettoyage CSS mort, métadonnées | Checklist §18 validée |
| **P10 — Documentation & livraison** | `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_DOCUMENTATION.md`, `SECURITY.md`, `TEST_REPORT.md` | Revue par un tiers |

---

## 9. Décisions à valider avant de poursuivre

1. **Backend neuf** : création d'un dossier `backend/` dans le dépôt officiel (aucun backend n'existe).
2. **Python 3.14** comme version de référence (3.15.1 installé mais écosystème scientifique non garanti).
3. **Persistance des conversations** : les conversations et messages seront stockés côté serveur (nécessaire pour la synchronisation Accueil ⇄ Chat). Le `localStorage` ne conserve qu'un brouillon et le thème.
4. **Migration du profil local** : au premier appel authentifié, le profil `nasa-profile` local est envoyé au serveur pour création, puis le stockage local devient un simple cache.
5. **Suppression du hotlink** `equascience.com` et de l'`@import` Google Fonts (remplacés par des assets locaux).
6. **Périmètre strict** : aucune connexion RAG / ChromaDB / Groq / média dans cette phase, uniquement des adaptateurs ouverts.

---

## 10. Conclusion

Le projet est **un frontend autonome de bonne facture visuelle, sans backend**. L'architecture cible ne demande pas de réécrire ce frontend, mais de :

1. lui donner un socle technique (build, lint, tests, env) ;
2. le découper sans changer son rendu ;
3. lui adjoindre un backend FastAPI minimal (sessions + profils) adossé à Supabase ;
4. instaurer un modèle conversationnel persistant partagé par l'Accueil et le Chat ;
5. exposer des adaptateurs ouverts pour le RAG, le média, la science et la génération, **non connectés**.

La réussite se mesurera à un critère simple : **une question posée depuis l'Accueil apparaît dans le Chat, et réciproquement, après rechargement de la page et changement d'appareil.**