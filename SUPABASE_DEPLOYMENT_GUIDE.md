# SUPABASE — Guide de déploiement et de connexion

> **Destinataire** : le développeur qui déploie le backend sur Supabase.
> **Périmètre** : FRAME IN FREEFALL AI — sessions, profils, conversations, historique,
> recherche multimodale locale.
> **Version du schéma** : `backend/migrations/001_init.sql`.
> **État réel au moment de la rédaction** : le backend tourne en local sur **SQLite** ;
> **aucune connexion à Supabase n'a encore été effectuée ni testée**. Ce guide décrit
> la marche à suivre, pas un déploiement déjà réalisé.

---

## Avertissement de statut (à lire avant tout)

| Élément | État réel | Preuve |
|---|---|---|
| API FastAPI (sessions, profils, conversations, chat) | **implémenté et testé** | 66 tests backend, `npm test` frontend |
| Recherche multimodale (documents, images, vidéos, mesures) | **implémentée localement** | index SQLite + corpus local, voir `docs/MULTIMODAL_RETRIEVAL.md` |
| Connexion PostgreSQL / Supabase | **prévue, jamais exécutée** | `DATABASE_URL` accepte `postgresql+asyncpg`, aucune migration appliquée |
| Supabase Auth | **non utilisé** | le projet a sa propre table `sessions` |
| Supabase Storage | **non utilisé** | avatars, pièces jointes, index et frames sont sur disque |
| Edge Functions, Realtime | **non utilisés** | aucune fonction déployée, aucun abonnement temps réel |
| RAG / génération IA | **non branchés** | réponses `501` explicites, adaptateurs en attente |

Ne présentez jamais une de ces lignes « prévue » comme opérationnelle tant que vous
n'avez pas exécuté les tests de la section H.

---

## A. Architecture du backend

### A.1 Stack et arborescence

```
backend/
  app/
    main.py              # application FastAPI, CORS, limite de débit, démarrage
    api/
      deps.py            # Principal (user + session + profil), dépendances
      v1/
        auth.py          # POST/GET/DELETE /auth/session
        profile.py       # GET/PATCH /profile, POST/GET /profile/avatar
        conversations.py # liste, création, lecture, suppression
        chat.py          # POST /chat, POST/GET /chat/attachments
        retrieval.py     # /retrieval/status, /scan, /search, /files, /ingest/nasa
        capabilities.py  # /media/search, /science/compute (501)
        system.py        # /system/health, /system/capabilities
        router.py        # agrégation sous /api/v1
    core/
      config.py          # Settings (pydantic-settings), variables d'env
      db.py              # moteur SQLAlchemy asynchrone, init_db (SQLite only)
      security.py        # jetons de session, cookie, empreintes SHA-256
      rls.py             # pose de `app.user_id` pour la RLS (PostgreSQL)
      errors.py          # erreurs applicatives → codes HTTP
      ratelimit.py       # limitation de débit sur /api/v1/auth
    models/              # user.py (User, Profile, SessionRecord), conversation.py
    schemas/             # auth, profile, chat, retrieval
    services/
      auth_service.py         # utilisateurs, sessions, révocation
      profile_service.py      # profil, avatar
      conversation_service.py # conversations, messages, réponse partielle
      attachment_service.py   # pièces jointes (disque, validées)
      adapters/               # contrats RAG / média / science / génération / retrieval
      retrieval/              # moteur multimodal (index, extraction, recherche)
  migrations/001_init.sql     # schéma PostgreSQL + RLS (source de vérité)
  tests/                      # 66 tests
  requirements.txt
```

### A.2 Système de sessions

Le backend **ne délègue pas** l'authentification à Supabase Auth. Il gère sa propre
session, volontairement simple (accès faible, sans mot de passe) :

1. `POST /api/v1/auth/session` reçoit `{ email, display_name? }`.
   L'e-mail est normalisé (minuscules, espaces retirés) — `schemas/auth.py::normalize_email`.
2. `auth_service.get_or_create_user` retrouve ou crée l'utilisateur **et** son profil.
3. `auth_service.create_session` engendre un jeton opaque de 32 octets
   (`secrets.token_urlsafe`), n'enregistre que son empreinte **SHA-256** en base
   (`sessions.token_hash`), et renvoie le jeton en clair.
4. La route pose le jeton dans un cookie **`HttpOnly`**, `SameSite=Lax`,
   `Path=/`, `Secure` en production (voir `core/security.py::cookie_settings`).
   Le nom du cookie est `frameinff_session` (`SESSION_COOKIE_NAME`).
5. Durée de vie : `SESSION_TTL_HOURS` (7 jours par défaut). Une session est active si
   `revoked_at IS NULL` **et** `expires_at > now()` (`models/user.py::SessionRecord.is_active`).
6. `DELETE /api/v1/auth/session` pose `revoked_at` et efface le cookie.
   `auth_service.revoke_all_sessions` permet de révoquer toutes les sessions d'un
   utilisateur (non exposé en HTTP aujourd'hui).

Toute route protégée passe par `api/deps.py::get_principal`, qui lit le cookie,
résout l'utilisateur et son profil, puis pose le contexte RLS (§ F).

### A.3 Système de conversations et d'historique

* `POST /api/v1/chat` : `prepare_chat` crée (ou retrouve) la conversation, insère le
  message `user`, puis **commit immédiatement**. La question est donc conservée même
  si la génération échoue ou n'est pas branchée.
* Si la recherche multimodale trouve quelque chose, un message `assistant` est ajouté
  avec `status = "partial"` (médias, graphiques, références réels, **aucune prose**).
* Si la génération n'est pas branchée, la route répond **`501`** avec un `detail`
  contenant `conversation_id`, `message_id`, `question_persisted`, `retrieval`,
  `answer` (voir `api/v1/chat.py`). Le frontend affiche alors les preuves et la mention
  « service non branché ».
* `GET /api/v1/conversations` : liste paginée (`limit`, `offset`), avec `message_count`
  et un aperçu du premier message utilisateur.
* `GET /api/v1/conversations/{id}` : conversation + messages ordonnés par `sequence`.
* `DELETE /api/v1/conversations/{id}` : suppression (cascade sur les messages).
* **Toutes** les requêtes sont filtrées par `user_id` dans `conversation_service` :
  une conversation d'un autre utilisateur répond `404` (son existence n'est pas révélée).
* Reprise d'une conversation : `POST /chat` avec `conversation_id` — le message est
  ajouté à la suite (`sequence` calculé en base).

### A.4 Gestion des profils

* `profiles` est en relation **1:1** avec `users` (`user_id` clé primaire).
* Créé automatiquement à la première session avec un `display_name` dérivé de l'e-mail
  (`auth_service.default_display_name`).
* `GET /api/v1/profile` renvoie le profil du porteur de session uniquement.
* `PATCH /api/v1/profile` met à jour `display_name` et `bio`.
* `POST /api/v1/profile/avatar` (multipart) enregistre l'avatar sous
  `AVATAR_DIR/<user_id>/<uuid>.<ext>`, types `image/jpeg|png|webp`, taille bornée par
  `AVATAR_MAX_BYTES`. L'URL renvoyée est `/api/v1/profile/avatar/<user_id>/<fichier>`.
* `GET /api/v1/profile/avatar/{user_id}/{filename}` vérifie que `user_id` est bien celui
  de la session : un utilisateur ne peut pas lire l'avatar d'un autre, même en fabriquant
  l'URL (`profile_service.avatar_path_from_url`).
* L'avatar par défaut est **engendré côté frontend** (`src/lib/avatar.js`), sans réseau.

### A.5 Relations entre utilisateurs, sessions et conversations

```
users ──1:1── profiles
  │
  ├──1:N── sessions          (une ligne par connexion ; token_hash unique)
  │
  └──1:N── conversations ──1:N── messages
                │
                └── (réservé, non branché) ── user_documents ──1:N── media_assets
```

Schéma complet et commenté : `docs/DATABASE_SCHEMA.md`.

### A.6 Communication frontend ↔ backend

* Le frontend n'appelle que des contrats HTTP, via `src/lib/endpoints.js` → `src/lib/apiClient.js`.
  Aucun accès direct à Supabase, ChromaDB ou Groq depuis le navigateur.
* `credentials: 'include'` : le cookie de session circule sur chaque appel.
* `VITE_API_BASE_URL` définit la base de l'API. Vide = même origine (proxy Vite en
  développement). En production, elle doit pointer sur le backend déployé
  (ex. `https://api.exemple.fr`).
* Les URL renvoyées par le backend (avatars, médias) sont relatives et passent par
  `resolveUrl()` (`apiClient.js`) côté frontend.
* Les erreurs sont normalisées en `ApiError { status, code, detail }`. Un `501`
  devient `code: 'not_implemented'` (`endpoints.isServiceUnavailable`), un `401`
  déclenche l'événement `frameinff:unauthorized`.

### A.7 Ce qui doit être hébergé ou configuré sur Supabase

| Élément | Hébergé sur Supabase | Remarque |
|---|---|---|
| Base PostgreSQL (tables, RLS, triggers) | **oui** | via `DATABASE_URL` |
| Moteur applicatif FastAPI | **non** (Supabase n'héberge que la base ici) | à déployer sur un hôte Python (Render, Railway, Fly, VM…) |
| Authentification | **non** — table `sessions` du projet | Supabase Auth n'est pas utilisé |
| Fichiers (avatars, pièces jointes, corpus, frames, index) | **non** — disque local | prévoir un volume persistant, voir § G.6 |
| Edge Functions, Realtime | **non** | non utilisés |

---

## B. Préparation du projet Supabase

### B.1 Créer ou choisir le projet

1. Tableau de bord Supabase → **New project**.
2. Choisir une région proche de l'hébergeur du backend (latence).
3. Noter le **mot de passe de la base** (Database Password) : il ne sera plus affiché.
4. Attendre que le projet soit « Healthy ».

### B.2 Récupérer les informations de connexion

Dans **Project Settings → Database → Connection string** :

| Champ | Valeur |
|---|---|
| URI (connexion directe) | `postgresql://postgres.<ref>:<password>@db.<ref>.supabase.co:5432/postgres` |
| URI (pooler, transaction) | `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres` |
| Projet URL | `https://<ref>.supabase.co` |
| Clé `anon` | Project Settings → API |
| Clé `service_role` | Project Settings → API — **secrète, jamais côté frontend** |

Le backend attend une URL **SQLAlchemy asynchrone** : remplacez le schéma `postgresql://`
par `postgresql+asyncpg://`.

> **Pooler** : utilisez le port `6543` (transaction) avec un hébergeur serverless qui
> ouvre beaucoup de connexions courtes. Pour un serveur unique et persistant, le port
> `5432` en direct convient. Dans les deux cas, `pool_pre_ping=True` est déjà activé
> dans `core/db.py`.

### B.3 Variables d'environnement

Fichier `.env` à la racine de `backend/` (jamais commité — `.gitignore` l'exclut).
Les noms exacts viennent de `backend/app/core/config.py` :

```dotenv
# --- Application ---
BACKEND_ENV=production
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
APP_NAME=Frame in Freefall AI API

# --- Sécurité / sessions (OBLIGATOIRE en production) ---
# Générer : python -c "import secrets; print(secrets.token_urlsafe(48))"
BACKEND_SECRET_KEY=<valeur_aléatoire_longue>
SESSION_COOKIE_NAME=frameinff_session
SESSION_TTL_HOURS=168
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
SESSION_COOKIE_DOMAIN=
CORS_ORIGINS=https://app.exemple.fr,https://www.exemple.fr
RATE_LIMIT_PER_MINUTE=20

# --- Base de données Supabase ---
DATABASE_URL=postgresql+asyncpg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
DATABASE_ECHO=false

# --- Supabase (déclarées, non utilisées par le code actuel) ---
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>

# --- Stockage local (voir G.6) ---
AVATAR_DIR=./var/avatars
AVATAR_MAX_BYTES=2097152
AVATAR_ALLOWED_CONTENT_TYPES=image/jpeg,image/png,image/webp
ATTACHMENT_DIR=./var/attachments
ATTACHMENT_MAX_BYTES=10485760
ATTACHMENT_MAX_PER_MESSAGE=5
ATTACHMENT_ALLOWED_CONTENT_TYPES=application/pdf,image/png,image/jpeg,image/webp,video/mp4,video/quicktime

# --- Recherche multimodale locale (optionnelle) ---
MULTIMODAL_CORPUS_DIRS=./var/corpus
MULTIMODAL_INDEX_DB=./var/retrieval/index.db
MULTIMODAL_FRAME_DIR=./var/retrieval/frames
MULTIMODAL_EMBEDDER=auto
MULTIMODAL_NASA_ENABLED=0

# --- Connecteurs non branchés ---
GROQ_API_KEY=
CHROMA_PERSIST_DIR=./var/chroma
EMBEDDING_MODEL=Qwen3-Embedding-0.6B
```

`validate_runtime()` (`core/config.py`) **refuse de démarrer en production** si :

* `BACKEND_SECRET_KEY` vaut encore `dev-only-insecure-key-change-me` ;
* `SESSION_COOKIE_SECURE` n'est pas activé.

### B.4 Dépendances à installer

```bash
cd backend
python -m venv .venv
# Windows : .venv\Scripts\activate
source .venv/bin/activate
python -m pip install -r requirements.txt
```

`asyncpg==0.32.0` est épinglé dans `requirements.txt` : c'est le pilote PostgreSQL
asynchrone, **requis uniquement** pour `DATABASE_URL=postgresql+asyncpg://…`.

Pour la recherche multimodale : `ffmpeg` et `ffprobe` doivent être dans le `PATH`
(extraction des frames vidéo), et `pillow` est déjà dans `requirements.txt`.
Sans ffmpeg, les vidéos sont indexées par leurs métadonnées et la transcription
`.vtt`/`.srt` éventuelle, sans frames.

### B.5 Ce qui se configure localement / sur Supabase

| Configuration | Où |
|---|---|
| Tables, RLS, triggers, rôles | Supabase (SQL Editor ou `psql`) |
| `DATABASE_URL`, secrets, CORS | Herbage du backend (`.env`, variables d'hôte) |
| `VITE_API_BASE_URL` | Frontend (build Vite) |
| Origines CORS autorisées | Backend (`CORS_ORIGINS`) |
| Migrations SQL | Supabase, une seule fois |

---

## C. Configuration de la base de données

> Source de vérité : `backend/migrations/001_init.sql`. Les noms, types et politiques
> ci-dessous sont **recopiés de ce fichier**, pas d'un schéma théorique.
> En développement local, les tables sont créées par l'ORM en SQLite ;
> **en PostgreSQL, `init_db()` ne crée rien** (garde-fou dans `core/db.py`) :
> c'est la migration qui fait foi.

### C.1 Vue d'ensemble

| Table | Rôle | Clé primaire | Clés étrangères |
|---|---|---|---|
| `users` | identité (e-mail) | `id uuid` | — |
| `profiles` | profil public | `user_id uuid` | `user_id → users.id` (cascade) |
| `sessions` | sessions serveur | `id uuid` | `user_id → users.id` (cascade) |
| `conversations` | fils de discussion | `id uuid` | `user_id → users.id` (cascade) |
| `messages` | messages d'un fil | `id uuid` | `conversation_id → conversations.id` (cascade) |
| `user_documents` | **réservé** RAG | `id uuid` | `user_id → users.id` (cascade) |
| `media_assets` | **réservé** catalogue média | `id uuid` | `associated_document_id → user_documents.id` (set null) |
| `ingestion_runs` | **réservé** journal d'ingestion | `id uuid` | — |

`user_documents`, `media_assets` et `ingestion_runs` existent pour que le RAG et le
multimodal se branchent **sans migration destructive**. **Aucune route de l'API ne les
utilise aujourd'hui.**

### C.2 Détail des colonnes

#### `users`

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` |
| `email` | `text` | NOT NULL |
| `created_at` | `timestamptz` | NOT NULL, `default now()` |
| `last_seen_at` | `timestamptz` | NULL |

Index unique : `users_email_key on users (lower(email))` — l'e-mail est insensible à la casse.

#### `profiles`

| Colonne | Type | Contrainte |
|---|---|---|
| `user_id` | `uuid` | PK, FK `users(id) on delete cascade` |
| `display_name` | `text` | NOT NULL |
| `bio` | `text` | NOT NULL, `default ''` |
| `avatar_url` | `text` | NULL |
| `updated_at` | `timestamptz` | NOT NULL, `default now()`, trigger |

Trigger `profiles_set_updated_at` → `public.set_updated_at()` avant chaque `UPDATE`.

#### `sessions`

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL, FK `users(id) on delete cascade` |
| `token_hash` | `text` | NOT NULL, **UNIQUE** |
| `created_at` | `timestamptz` | NOT NULL, `default now()` |
| `expires_at` | `timestamptz` | NOT NULL |
| `revoked_at` | `timestamptz` | NULL |
| `ip_address` | `text` | NULL |
| `user_agent` | `text` | NULL |

Index : `sessions_user_id_idx (user_id)`, `sessions_token_hash_idx (token_hash)`.
Le jeton en clair n'existe que dans le cookie : la base ne contient qu'une empreinte
SHA-256 de 64 caractères hexadécimaux.

#### `conversations`

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL, FK `users(id) on delete cascade` |
| `title` | `text` | NOT NULL, `default 'Nouvelle conversation'` |
| `created_at` | `timestamptz` | NOT NULL, `default now()` |
| `updated_at` | `timestamptz` | NOT NULL, `default now()`, trigger |
| `archived_at` | `timestamptz` | NULL |

Index : `conversations_user_updated_idx (user_id, updated_at desc)` — la liste est triée
par `updated_at` décroissant. Les conversations archivées sont exclues des listes.

#### `messages`

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` |
| `conversation_id` | `uuid` | NOT NULL, FK `conversations(id) on delete cascade` |
| `role` | `text` | NOT NULL, `check (role in ('user','assistant','system'))` |
| `status` | `text` | NOT NULL, `default 'completed'` |
| `content` | `jsonb` | NOT NULL, `default '{}'::jsonb` |
| `sequence` | `integer` | NOT NULL, `default 0` |
| `created_at` | `timestamptz` | NOT NULL, `default now()` |

Index : `messages_conversation_sequence_idx (conversation_id, sequence)`.

`content` est la charge utile du message, telle que la renvoie l'API :

```json
{ "text": "Question de l'utilisateur" }                                  // message user
{ "text": "…", "attachments": [ { "attachment_id": "…", "…": "…" } ] }   // user + pièce jointe
{ "schema_version": 1, "summary": null, "media": [], "charts": [],       // réponse partielle
  "references": [], "limitations": [], "blocks": [] }
```

#### `user_documents` (réservé)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | NOT NULL, FK `users(id) on delete cascade` |
| `title` | `text` | NOT NULL |
| `mime` | `text` | NULL |
| `size_bytes` | `bigint` | NULL |
| `storage_path` | `text` | NULL |
| `checksum` | `text` | NULL |
| `collection` | `text` | NOT NULL, `default 'user_documents'` |
| `created_at` | `timestamptz` | NOT NULL |

Index : `user_documents_user_idx (user_id)`.

#### `media_assets` (réservé)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | `uuid` | PK |
| `media_type` | `text` | NOT NULL, `check in ('image','video')` |
| `title` | `text` | NOT NULL |
| `description` | `text` | NULL |
| `source` | `text` | NULL |
| `experiment` | `text` | NULL |
| `file_path` | `text` | NULL |
| `thumbnail_path` | `text` | NULL |
| `source_url` | `text` | NULL |
| `license` | `text` | NULL |
| `duration_seconds` | `numeric` | NULL |
| `timestamp_seconds` | `numeric` | NULL |
| `associated_document_id` | `uuid` | NULL, FK `user_documents(id) on delete set null` |
| `metadata` | `jsonb` | NOT NULL, `default '{}'::jsonb` |
| `created_at` | `timestamptz` | NOT NULL |

Index : `media_assets_type_idx`, `media_assets_experiment_idx`.

#### `ingestion_runs` (réservé)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | `uuid` | PK |
| `kind` | `text` | NOT NULL |
| `status` | `text` | NOT NULL, `default 'pending'` |
| `stats` | `jsonb` | NOT NULL, `default '{}'::jsonb` |
| `started_at` | `timestamptz` | NOT NULL |
| `finished_at` | `timestamptz` | NULL |

### C.3 Extensions, fonctions et triggers

```sql
create extension if not exists "pgcrypto";          -- gen_random_uuid()

create or replace function public.set_updated_at()  -- updated_at automatique
returns trigger language plpgsql as $$ … $$;

create or replace function public.current_user_id() -- lit app.user_id
returns uuid language sql stable as $$
    select nullif(current_setting('app.user_id', true), '')::uuid;
$$;
```

### C.4 Appliquer les migrations

**Une seule migration existe : `001_init.sql`.** Ordre : elle d'abord, puis le rôle
applicatif (bloc de commentaires en fin de fichier), puis les éventuels correctifs.

Le fichier est **ré-exécutable** : `create table if not exists`, `create index if not
exists`, `drop policy if exists` avant chaque `create policy`, `drop trigger if exists`.
Une seconde exécution ne casse rien, mais ne défait pas non plus une modification manuelle
(une colonne ajoutée à la main reste).

**Option 1 — SQL Editor Supabase (recommandé pour un premier déploiement)**

1. Project → **SQL Editor** → **New query**.
2. Copier-coller **tout** `backend/migrations/001_init.sql`.
3. **Run**.
4. Vérifier : `select table_name from information_schema.tables where table_schema='public' order by 1;`
   → 8 tables attendues.
5. Exécuter le bloc de rôle (voir § F.3), adapté au mot de passe choisi.

**Option 2 — psql (si `psql` est installé)**

```bash
# Windows PowerShell : définir d'abord $env:PGPASSWORD
export PGPASSWORD='<mot de passe base>'
psql "host=db.<ref>.supabase.co port=5432 dbname=postgres user=postgres" \
     -v ON_ERROR_STOP=1 -f backend/migrations/001_init.sql
```

`ON_ERROR_STOP=1` est important : sans lui, une erreur de politique passerait inaperçue.

### C.5 Vérifier le schéma après migration

```sql
-- tables et nombre de colonnes
select c.relname as table, count(a.attname) as colonnes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname order by 1;

-- RLS activée partout ?
select relname, relrowsecurity, relforcerowsecurity
from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;

-- politiques
select tablename, policyname, cmd, qual
from pg_policies where schemaname = 'public' order by tablename, policyname;
```

Résultat attendu : `relrowsecurity = true` sur les 8 tables, `relforcerowsecurity = false`
(voir § F.2 pour ce que cela implique), et 16 politiques listées au § F.1.

---

## D. Authentification et profils

### D.1 Ce qui est utilisé aujourd'hui

**Supabase Auth n'est pas utilisé.** Le projet a son propre mécanisme (§ A.2) :

* pas de `auth.users` Supabase, pas de JWT Supabase, pas de `supabase.auth.signIn…` ;
* la table `public.users` du projet est indépendante de `auth.users` ;
* la preuve d'identité est **faible** : un e-mail valide suffit. C'est documenté dans
  `schemas/auth.py::SessionCreate` et dans la réponse (`"weak_auth": true`).
* La vérification reste intégralement serveur : le frontend ne choisit jamais son
  `user_id`, il le reçoit du cookie.

### D.2 Si vous voulez brancher Supabase Auth plus tard

Ce n'est pas nécessaire pour déployer. Si la décision est prise, voici les impacts réels :

1. `auth.users` (Supabase) et `public.users` (projet) deviendraient deux sources
   d'identité : il faudrait soit supprimer `public.users` et utiliser `auth.users.id`
   comme `user_id` partout (FK vers `auth.users`), soit tenir une table de correspondance.
2. `sessions` deviendrait inutile (Supabase gère ses propres jetons) ou servirait de
   journal.
3. Les routes `POST/GET/DELETE /auth/session` et `AuthProvider` du frontend
   changeraient de contrat.
4. La RLS « maison » (`app.user_id`) serait remplacée par `auth.uid()` dans les politiques.

**Ne faites pas ce changement en même temps que le premier déploiement** : validez d'abord
le schéma et les sessions actuelles (§ H), puis migrez l'authentification dans une
migration dédiée.

### D.3 Relier les profils aux utilisateurs authentifiés

Aujourd'hui le lien est direct : `profiles.user_id → users.id`, créé par
`auth_service.get_or_create_user` lors de la première session. Aucune action Supabase
n'est requise. Après une connexion Supabase Auth, la clé à utiliser comme `user_id`
serait l'`id` de `auth.users` (voir D.2).

### D.4 Récupérer les informations d'un profil

```bash
curl -s -b cookies.txt http://localhost:8000/api/v1/profile | python -m json.tool
```

Réponse :

```json
{
  "user_id": "…",
  "email": "prenom.nom@exemple.fr",
  "display_name": "Prenom Nom",
  "bio": "",
  "avatar_url": null,
  "updated_at": "2026-01-01T00:00:00Z"
}
```

### D.5 Autorisations

* L'identité vient **du cookie signé serveur** (jeton opaque + empreinte en base),
  jamais d'un paramètre de requête ni d'un en-tête fourni par le client.
* `user_id` n'est jamais accepté en entrée : il est dérivé de la session.
* Les conversations et messages d'un autre utilisateur répondent `404`.
* Les avatars et pièces jointes sont rangés sous `<dossier>/<user_id>/…` et le chemin est
  revérifié à chaque lecture avec l'`user_id` de la session.

### D.6 Vérifier qu'un utilisateur n'accède pas aux données d'un autre

Le test § H.10 couvre ce point de bout en bout (deux sessions, deux cookies).

---

## E. Sessions et conversations

### E.1 Création d'une session

```bash
curl -s -c cookies.txt -X POST http://localhost:8000/api/v1/auth/session \
  -H 'Content-Type: application/json' \
  -d '{"email":"prenom.nom@exemple.fr","display_name":"Prenom Nom"}'
```

* Réponse `201`, cookie `frameinff_session` écrit dans `cookies.txt`.
* Si l'utilisateur existe, il est retrouvé ; sinon `users` + `profiles` sont créés.
* Deux sessions du même utilisateur produisent deux lignes dans `sessions` (deux jetons,
  deux empreintes) — c'est voulu : plusieurs appareils.

### E.2 Identification d'une session

Le cookie contient le jeton en clair. La base contient `sha256(jeton)`. La recherche se
fait par empreinte (`auth_service.find_active_session`) : une fuite de la base ne permet
pas de rejouer une session. Le cookie est `HttpOnly` (inaccessible à JavaScript),
`SameSite=Lax`, `Secure` en production.

### E.3 Conservation d'une session

* `SESSION_TTL_HOURS` (7 jours) fixe `expires_at`.
* `GET /api/v1/auth/session` (ou `/auth/me`) prolonge implicitement la session en
  mettant à jour `users.last_seen_at` ; **il ne prolonge pas `expires_at`** : au bout de
  7 jours, il faut rouvrir une session.
* Après redémarrage du backend, les sessions survivent (elles sont en base).
* Un cookie `Secure` n'est pas renvoyé en HTTP : en production, servez le backend en HTTPS
  (ou testez avec `SESSION_COOKIE_SECURE=false`, jamais en production).

### E.4 Récupérer une session existante

```bash
curl -s -b cookies.txt http://localhost:8000/api/v1/auth/session | python -m json.tool
```

`401` + `{"error":{"code":"unauthenticated"}}` si le cookie est absent, expiré ou révoqué.

### E.5 Enregistrer des messages

```bash
curl -s -b cookies.txt -X POST http://localhost:8000/api/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"text":"Comment se propage une flamme en microgravité ?"}'
```

* `201` si la génération est branchée, `501` sinon (état actuel).
* Dans les deux cas, la question est **persistée** et `conversation_id` est renvoyé
  (dans le corps en `201`, dans `error.detail` en `501`).
* `POST /api/v1/chat/attachments` (multipart, champ `file`) téléverse une pièce jointe et
  renvoie son `attachment_id` ; on le passe ensuite dans `POST /chat` via
  `{"text": "…", "attachments": [{"attachment_id": "…"}]}`.

### E.6 Récupérer l'historique

```bash
curl -s -b cookies.txt "http://localhost:8000/api/v1/conversations?limit=20&offset=0"
curl -s -b cookies.txt http://localhost:8000/api/v1/conversations/<conversation_id>
```

La liste renvoie `items` (avec `message_count`, `preview`) et `total`. Le détail renvoie
`messages` triés par `sequence`.

### E.7 Reprendre une conversation existante

```bash
curl -s -b cookies.txt -X POST http://localhost:8000/api/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"text":"Et à 10 secondes ?","conversation_id":"<conversation_id>"}'
```

Le message est ajouté à la suite (`sequence` = max + 1) et `conversations.updated_at`
est mis à jour, ce qui fait remonter le fil en tête de liste.

### E.8 Rattacher chaque conversation au bon utilisateur

`conversation_id` est un UUID généré côté serveur ; `conversations.user_id` est renseigné
par `conversation_service` à partir de `principal.user_id`. Le client ne peut ni choisir
`user_id`, ni deviner un `conversation_id` d'un autre utilisateur (réponse `404`).

---

## F. Sécurité et politiques RLS

### F.1 Politiques créées par `001_init.sql`

Helper : `public.current_user_id()` lit `app.user_id` (NULL si absent).

| Table | Politique | Type | Condition |
|---|---|---|---|
| `users` | `users_select_own` | SELECT | `id = current_user_id()` |
| `users` | `users_update_own` | UPDATE | `id = current_user_id()` (using + with check) |
| `profiles` | `profiles_select_own` | SELECT | `user_id = current_user_id()` |
| `profiles` | `profiles_update_own` | UPDATE | `user_id = current_user_id()` (using + with check) |
| `sessions` | `sessions_select_own` | SELECT | `user_id = current_user_id()` |
| `conversations` | `conversations_select_own` | SELECT | `user_id = current_user_id()` |
| `conversations` | `conversations_insert_own` | INSERT | `user_id = current_user_id()` |
| `conversations` | `conversations_update_own` | UPDATE | `user_id = current_user_id()` (using + with check) |
| `conversations` | `conversations_delete_own` | DELETE | `user_id = current_user_id()` |
| `messages` | `messages_select_own` | SELECT | la conversation parente appartient à l'utilisateur |
| `messages` | `messages_insert_own` | INSERT | idem |
| `user_documents` | `user_documents_select_own` | SELECT | `user_id = current_user_id()` |
| `user_documents` | `user_documents_insert_own` | INSERT | `user_id = current_user_id()` |
| `user_documents` | `user_documents_delete_own` | DELETE | `user_id = current_user_id()` |
| `media_assets` | `media_assets_select_all` | SELECT | `true` (catalogue scientifique commun) |
| `ingestion_runs` | `ingestion_runs_admin_only` | SELECT | `false` (administration uniquement) |

Points à connaître :

* **Pas de politique UPDATE/DELETE sur `messages`** : les messages sont ajoutés et lus,
  jamais modifiés. C'est voulu (l'historique ne se réécrit pas).
* **`media_assets` est en lecture publique** : le catalogue scientifique est commun.
* **`ingestion_runs` est totalement fermé** aux rôles soumis à la RLS.

### F.2 Qui est réellement soumis à la RLS — point important

Les politiques RLS **ne s'appliquent pas au propriétaire de la table**, sauf
`alter table … force row level security`. Le backend se connecte avec le rôle
`postgres` (propriétaire) : il n'est donc **pas** filtré par la RLS, et c'est le filtre
`WHERE user_id` de `conversation_service` qui assure l'isolation applicative.

Conséquences à retenir :

1. La RLS protège les accès qui passeraient par l'API REST Supabase (rôle `anon` /
   `authenticated`) ou par un rôle applicatif dédié.
2. Si vous connectez le backend avec un rôle **non propriétaire**, la RLS s'appliquera :
   les tables `users`, `profiles` et `sessions` n'ont **aucune politique INSERT**. La
   création d'utilisateur échouerait alors (`new row violates row-level security policy`).
3. Le backend pose `app.user_id` à chaque requête authentifiée (`core/rls.py`,
   appelé par `api/deps.py::get_principal`) — nécessaire pour que les politiques
   `current_user_id()` aient un sens. Sans ce réglage, un rôle soumis à la RLS ne verrait
   aucune ligne.

**Deux options, à choisir explicitement :**

* **Option recommandée pour démarrer** : garder le rôle `postgres` propriétaire (RLS non
  appliquée au backend, isolation par le code) et conserver la RLS comme filet de sécurité
  pour tout accès direct.
* **Durcir** : créer un rôle applicatif, lui donner les `GRANT` du § F.3, forcer la RLS
  et ajouter les politiques INSERT manquantes :

```sql
-- à n'exécuter que si vous choisissez l'option « durcie »
alter table public.users     force row level security;
alter table public.profiles  force row level security;
alter table public.sessions  force row level security;

drop policy if exists users_insert_own on public.users;
create policy users_insert_own on public.users
    for insert with check (id = public.current_user_id());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
    for insert with check (user_id = public.current_user_id());

drop policy if exists sessions_insert_own on public.sessions;
create policy sessions_insert_own on public.sessions
    for insert with check (user_id = public.current_user_id());

drop policy if exists sessions_update_own on public.sessions;
create policy sessions_update_own on public.sessions
    for update using (user_id = public.current_user_id())
    with check (user_id = public.current_user_id());
```

Dans ce mode, il faut aussi poser `app.user_id` **avant** l'insertion de l'utilisateur et
de la session (aujourd'hui il n'est posé qu'après authentification) : prévoir une
`set_config` explicite dans `auth_service.create_session` / `get_or_create_user`. Testez ce
mode sur un projet de pré-production avant de l'imposer.

### F.3 Rôle applicatif et droits

En fin de `001_init.sql`, le bloc à exécuter (avec un mot de passe fort, jamais commité) :

```sql
create role techlabs_app login password '<mot de passe fort>';
grant usage on schema public to techlabs_app;
grant select, insert, update, delete on all tables in schema public to techlabs_app;
```

Puis, dans `DATABASE_URL`, utilisez `techlabs_app` au lieu de `postgres`.
Si vous gardez le rôle `postgres`, ce bloc est inutile — ne l'exécutez pas.

### F.4 Précautions sur les clés Supabase

| Clé | Où elle peut aller | Où elle ne doit **jamais** aller |
|---|---|---|
| `SUPABASE_URL` | backend, frontend (projet URL publique) | — |
| `SUPABASE_ANON_KEY` | backend (si un jour le client Supabase est utilisé), frontend (clé publique par conception) | — |
| `SUPABASE_SERVICE_ROLE_KEY` | **uniquement** le backend, variable d'environnement | frontend, dépôt GitHub, fichiers publics, journaux |
| Mot de passe PostgreSQL | `DATABASE_URL` côté backend | frontend, dépôt, tickets |
| `BACKEND_SECRET_KEY` | backend | frontend, dépôt |

* Ne committez jamais `.env` (`.gitignore` : `.env`, `.env.*`, sauf `.env.example`).
* Ne mettez aucune valeur réelle dans `.env.example` : uniquement des noms de variables.
* Les journaux (`DATABASE_ECHO=true`) affichent les requêtes et les paramètres : gardez
  `DATABASE_ECHO=false` en production.
* Vérifiez avant tout commit : `git diff --cached` et `git ls-files | grep -i env`.

### F.5 Variables exposables au frontend

Le frontend ne reçoit que `VITE_API_BASE_URL` (et éventuellement `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY`, non utilisées aujourd'hui). Tout le reste reste serveur :
`DATABASE_URL`, `BACKEND_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, clés de
stockage. Ces variables sont injectées à la construction Vite : **elles se retrouvent dans
le bundle** — n'y mettez jamais un secret.

---

## G. Déploiement et connexion

### G.1 Préparer le backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows : .venv\Scripts\activate
python -m pip install -r requirements.txt
```

Vérifications avant de démarrer :

```bash
python -c "from app.main import app; print(len(app.routes), 'routes')"
python -m pytest -q            # 66 tests doivent passer
```

### G.2 Appliquer les migrations

Voir § C.4. Ordre :

1. `001_init.sql` dans le SQL Editor Supabase.
2. (Option durcie uniquement) politiques INSERT + `force row level security`, § F.2.
3. (Option rôle applicatif uniquement) `create role` + `grant`, § F.3.

### G.3 Configurer les variables d'environnement

Reportez le `.env` du § B.3 sur l'hébergeur du backend (Render, Railway, Fly, VM…).
Contrôles de cohérence :

```bash
python - <<'PY'
from app.core.config import get_settings
s = get_settings()
print('env         :', s.backend_env)
print('base        :', 'postgresql' if s.database_url.startswith('postgresql') else 'sqlite')
print('cookie      :', s.session_cookie_name, '| secure =', s.session_cookie_secure)
print('origines    :', s.cors_origin_list)
s.validate_runtime()
print('validation  : ok')
PY
```

En production, `validate_runtime()` doit passer sans lever d'exception.

### G.4 Démarrer le backend

Développement :

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Production (exemple Render / VM) :

```bash
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --workers 2
```

* `BACKEND_PORT` est lu par `config.py`, mais l'hébergeur impose souvent son propre port
  via `PORT` : passez-le explicitement.
* `--proxy-headers` est nécessaire derrière un proxy HTTPS (Render, Nginx…), sinon
  l'`X-Forwarded-For` du § A.2 (IP de session) est ignoré.
* `SESSION_COOKIE_SECURE=true` **et** HTTPS obligatoires : sinon le navigateur ne renverra
  jamais le cookie de session.
* `CORS_ORIGINS` doit lister **exactement** l'origine du frontend (schéma + domaine),
  sans barre finale. `allow_credentials=True` interdit le joker `*`.

### G.5 Vérifier la connexion à la base

```bash
curl -s https://api.exemple.fr/api/v1/system/health
# {"status":"ok","app":"…","env":"production","database":"postgresql"}
```

`"database":"postgresql"` prouve que `DATABASE_URL` est bien reconnue (le test réel de
connexion se fait à la première requête authentifiée, voir § H.1).

Test de connexion SQL sans démarrer l'API :

```bash
python - <<'PY'
import asyncio
from sqlalchemy import text
from app.core.db import engine

async def main():
    async with engine.connect() as connection:
        version = (await connection.execute(text("select version()"))).scalar_one()
        who = (await connection.execute(text("select current_user"))).scalar_one()
        print("connecté :", who)
        print("version  :", version.split(",")[0])
    await engine.dispose()

asyncio.run(main())
PY
```

### G.6 Fichiers persistants (attention)

Le backend écrit sur disque, pas sur Supabase Storage :

| Donnée | Dossier (`config.py`) | Conséquence |
|---|---|---|
| Avatars | `AVATAR_DIR` (`./var/avatars`) | perdus si le conteneur est éphémère |
| Pièces jointes | `ATTACHMENT_DIR` (`./var/attachments`) | idem |
| Corpus indexé | `MULTIMODAL_CORPUS_DIRS` | idem |
| Frames extraites | `MULTIMODAL_FRAME_DIR` | idem |
| Index de recherche | `MULTIMODAL_INDEX_DB` | idem |

Trois possibilités :

1. **Hébergeur avec volume persistant** (Render Disk, Railway volume, VM) : montez le
   volume et pointez les variables dessus. C'est le plus simple.
2. **Conteneur éphémère** : acceptez la perte au redéploiement, ou déplacez le stockage
   vers Supabase Storage — **non implémenté aujourd'hui** (prévoir une migration dédiée,
   la table `user_documents.storage_path` est déjà là pour ça).
3. **Recherche multimodale** : si l'index n'est pas persistant, il se reconstruit avec
   `POST /api/v1/retrieval/scan` au démarrage (coût : extraction vidéo, voir
   `docs/MULTIMODAL_RETRIEVAL.md` § 11).

### G.7 Relier le frontend au backend déployé

```dotenv
# frontend/.env (build Vite)
VITE_API_BASE_URL=https://api.exemple.fr
```

```bash
npm ci
npm run build      # dist/ à servir (statique)
```

* Le cookie de session est `SameSite=Lax` : le frontend et le backend doivent être sur le
  **même site** (même domaine de premier niveau), sinon le cookie ne sera pas renvoyé.
  Si `app.exemple.fr` appelle `api.autre-domaine.com`, passez en `SameSite=None; Secure`
  — ce qui exige un tiers de confiance et HTTPS, et **impose de modifier
  `SESSION_COOKIE_SAMESITE`** (valeur supportée : `lax`, `strict`, `none`).
* `SESSION_COOKIE_DOMAIN` peut être fixé (ex. `.exemple.fr`) pour partager le cookie entre
  sous-domaines.

### G.8 Vérifier les connexions après déploiement

```bash
curl -s -i -X POST https://api.exemple.fr/api/v1/auth/session \
  -H 'Content-Type: application/json' \
  -d '{"email":"test.deploiement@exemple.fr"}' | head -20
```

Attendu : `HTTP/1.1 201`, `set-cookie: frameinff_session=…; HttpOnly; Secure; SameSite=lax; Path=/`,
et un corps JSON contenant `profile` et `session_expires_at`.

### G.9 Edge Functions

**Aucune Edge Function n'est utilisée.** Le backend est un service Python autonome. Si un
besoin apparaît (proxy, webhook), il faudra le créer explicitement — ce n'est pas un
prérequis du déploiement.

---

## H. Tests après déploiement

Préparez deux utilisateurs et deux « pots de cookies » :

```bash
API=https://api.exemple.fr
curl -s -c a.txt -X POST $API/api/v1/auth/session -H 'Content-Type: application/json' \
  -d '{"email":"alice@exemple.fr","display_name":"Alice"}'      > /dev/null
curl -s -c b.txt -X POST $API/api/v1/auth/session -H 'Content-Type: application/json' \
  -d '{"email":"bob@exemple.fr","display_name":"Bob"}'          > /dev/null
```

### H.1 Connexion à Supabase

```bash
curl -s $API/api/v1/system/health
```
**Attendu** : `{"status":"ok",…,"database":"postgresql"}`. Si `"sqlite"`, `DATABASE_URL`
n'est pas prise en compte (variable absente ou mal nommée).

```bash
curl -s -b a.txt $API/api/v1/auth/session
```
**Attendu** : `200` + le profil d'Alice. Une erreur `500` de connexion signifie que
`DATABASE_URL` ou le mot de passe est faux (§ I.1).

### H.2 Création d'un utilisateur

```bash
curl -s -c c.txt -X POST $API/api/v1/auth/session -H 'Content-Type: application/json' \
  -d '{"email":"carol@exemple.fr","display_name":"Carol"}'
```
**Attendu** : `201`, `profile.user_id` non vide, `weak_auth: true`.
Vérification en base :

```sql
select u.email, p.display_name from users u join profiles p on p.user_id = u.id
where u.email = 'carol@exemple.fr';
```
**Attendu** : une ligne.

### H.3 Récupération du profil

```bash
curl -s -b c.txt $API/api/v1/profile
curl -s -b c.txt -X PATCH $API/api/v1/profile -H 'Content-Type: application/json' \
  -d '{"display_name":"Carol D.","bio":"Ingénieure combustion"}'
curl -s -b c.txt $API/api/v1/profile
```
**Attendu** : `200`, puis `display_name` mis à jour, `updated_at` plus récent.

### H.4 Création d'une session (persistance du cookie)

```bash
grep frameinff_session c.txt
```
**Attendu** : une ligne avec `#HttpOnly_` et le domaine du backend. Le cookie doit être
présent dans le fichier — sinon `SESSION_COOKIE_SECURE=true` en HTTP local
(`curl` ne renvoie pas un cookie `Secure` sur une URL `http://`).

### H.5 Conservation d'une session

```bash
sleep 2; curl -s -o /dev/null -w '%{http_code}\n' -b c.txt $API/api/v1/auth/session
```
**Attendu** : `200`. Après `DELETE /auth/session`, le même appel doit renvoyer `401`.

### H.6 Création d'une conversation

```bash
curl -s -b a.txt -X POST $API/api/v1/conversations -H 'Content-Type: application/json' \
  -d '{"title":"Test de déploiement"}'
```
**Attendu** : `201`, `messages: []`, `id` non vide.

### H.7 Enregistrement des messages

```bash
curl -s -b a.txt -X POST $API/api/v1/chat -H 'Content-Type: application/json' \
  -d '{"text":"Première question de test"}'
```
**Attendu** : `501` (état actuel : génération non branchée) avec
`error.detail.question_persisted = true`, `conversation_id` et `message_id`.

### H.8 Récupération de l'historique

```bash
curl -s -b a.txt $API/api/v1/conversations/<conversation_id>
```
**Attendu** : `200`, un message `user` avec `content.text`, `sequence = 1`.

### H.9 Reprise d'une conversation

```bash
curl -s -b a.txt -X POST $API/api/v1/chat -H 'Content-Type: application/json' \
  -d '{"text":"Deuxième question","conversation_id":"<conversation_id>"}'
curl -s -b a.txt $API/api/v1/conversations/<conversation_id>
```
**Attendu** : deux messages `user`, `sequence` 1 puis 2.

### H.10 Isolation entre deux utilisateurs

```bash
curl -s -o /dev/null -w 'alice -> %{http_code}\n' -b a.txt $API/api/v1/conversations/<conversation_id>
curl -s -o /dev/null -w 'bob   -> %{http_code}\n' -b b.txt $API/api/v1/conversations/<conversation_id>
curl -s -b b.txt "$API/api/v1/conversations?limit=50" | python -m json.tool | grep -c conversation_id
```
**Attendu** : `200` pour Alice, **`404` pour Bob**, et la liste de Bob ne contient pas la
conversation d'Alice.

Côté base, la même vérification avec le contexte RLS (si vous avez choisi l'option durcie) :

```sql
begin;
select set_config('app.user_id', '<uuid_alice>', true);
select count(*) from conversations;   -- ne compte que celles d'Alice
rollback;
```

### H.11 Communication frontend ↔ backend

1. Ouvrir le frontend déployé, se connecter avec `alice@exemple.fr`.
2. Ouvrir l'onglet réseau : `POST /api/v1/auth/session` → `201`, `Set-Cookie` présent.
3. Poser une question : `POST /api/v1/chat` → `501`, le message apparaît dans l'Accueil et
   dans le Chat, l'URL de l'API est bien celle de `VITE_API_BASE_URL`.
4. Vérifier qu'un média (si le corpus est indexé) s'affiche via
   `/api/v1/retrieval/files?path=…` — **sans** `Mixed Content` dans la console.

### H.12 Comportement quand Supabase est indisponible

```bash
# couper l'accès en changeant le mot de passe dans DATABASE_URL, puis :
curl -s -o /dev/null -w '%{http_code}\n' -b a.txt $API/api/v1/auth/session
curl -s -b a.txt $API/api/v1/auth/session
```
**Attendu** : `500` avec `{"error":{"code":"internal_error","message":"Erreur interne."}}` —
le détail technique (traceback, chaîne de connexion) n'est **jamais** renvoyé au client
(`core/errors.py`). Le frontend affiche alors une erreur explicite
(`ApiError.code = 'internal_error'`), pas un écran vide. Après rétablissement de
`DATABASE_URL` et redémarrage, H.5 doit repasser à `200`.

---

## I. Dépannage

### I.1 Erreur de connexion à la base

**Symptôme** : `500` sur `/auth/session`, ou `sqlalchemy.exc.OperationalError`.

| Cause | Vérification | Correctif |
|---|---|---|
| `DATABASE_URL` absente | `curl $API/api/v1/system/health` → `"sqlite"` | définir la variable sur l'hébergeur |
| Schéma `postgresql://` au lieu de `postgresql+asyncpg://` | message `Can't load plugin: sqlalchemy.dialects:postgresql` | préfixer `+asyncpg` |
| Mot de passe / utilisateur erroné | `psql "$DATABASE_URL" -c 'select 1'` | reprendre la chaîne exacte (attention aux caractères spéciaux : les encoder en `%XX`) |
| Pooler saturé | erreurs `too many clients` | passer en `6543`, réduire le nombre de workers |
| SSL exigé | `server does not support SSL` | ajouter `?ssl=require` à l'URL (Supabase l'impose souvent) |

### I.2 Variables d'environnement manquantes

```bash
python -c "from app.core.config import get_settings; print(get_settings().model_dump())"
```
Toute valeur vide ou restée à son défaut de développement (`dev-only-insecure-key-change-me`)
est signalée ici. En production, `validate_runtime()` bloque le démarrage : le message est
explicite dans les journaux.

`.env` est lu depuis le **répertoire de travail** du processus : lancez uvicorn depuis
`backend/`, ou passez les variables par l'interface de l'hébergeur.

### I.3 Erreurs SQL

| Erreur | Cause probable | Correctif |
|---|---|---|
| `relation "public.users" does not exist` | migration non appliquée | exécuter `001_init.sql` (§ C.4) |
| `column "…" of relation "…" does not exist` | schéma partiel / modifié à la main | réexécuter `001_init.sql` ; comparer avec `docs/DATABASE_SCHEMA.md` |
| `new row violates row-level security policy` | rôle non propriétaire sans politique INSERT | § F.2 option durcie |
| `permission denied for table …` | `GRANT` manquant | § F.3 |
| `duplicate key value violates unique constraint "users_email_key"` | deux e-mails différant par la casse | normaliser en base (`lower(email)`) — le backend normalise déjà |

### I.4 Problèmes de permissions RLS

* **Aucune ligne renvoyée alors que la table est remplie** : `app.user_id` n'est pas posé,
  ou la politique compare un autre champ. Vérifier avec
  `select current_setting('app.user_id', true);` dans une transaction où le backend a posé
  la variable.
* **Tout est visible** : la RLS n'est pas activée sur la table
  (`select relrowsecurity from pg_class where relname = 'users';`) ou le rôle est
  propriétaire (comportement normal, § F.2).
* Après un changement de politique : `notify pgrst, 'reload schema';` si vous passez par
  l'API REST Supabase.

### I.5 Erreurs d'authentification

| Symptôme | Cause | Correctif |
|---|---|---|
| `401` juste après connexion | cookie non renvoyé | `SESSION_COOKIE_SECURE=true` en HTTPS ; `CORS_ORIGINS` exact ; `SameSite` (§ G.7) |
| `401` après quelques minutes | session expirée | `SESSION_TTL_HOURS` trop court ; rouvrir une session |
| `401` aléatoire | plusieurs backends sans base partagée | toutes les instances doivent pointer la même `DATABASE_URL` |
| `Set-Cookie` absent | réponse `204`/`500` avant `set_cookie` | vérifier les journaux (l'exception survient avant la pose du cookie) |

### I.6 Sessions qui ne persistent pas

1. `GET /auth/session` renvoie `200` avec un autre utilisateur → cookie d'un autre domaine
   ou `SESSION_COOKIE_DOMAIN` mal réglé.
2. Redémarrage du backend → sessions perdues : `DATABASE_URL` ne pointe pas la base
   Supabase (table `sessions` vide en base).
3. Cookie présent mais session révoquée : `select id, revoked_at, expires_at from sessions
   order by created_at desc limit 5;`.

### I.7 Conversations qui ne s'enregistrent pas

* Réponse `501` : c'est normal, la question **est** enregistrée (vérifier `question_persisted`).
  Si `conversation_id` est absent du `detail`, la couche base a échoué avant l'insertion :
  voir les journaux.
* `GET /conversations` vide alors qu'un message a été posté : `user_id` différent entre les
  deux appels (deux sessions, deux utilisateurs), ou `archived_at` non nul.
* Message présent mais `sequence` dupliqué : deux requêtes simultanées sur la même
  conversation — `append_message` recalcule `max(sequence) + 1` à chaque appel ; évitez les
  appels concurrents sur une même conversation.

### I.8 Erreurs d'appels API (frontend)

| Code | Signification | Action |
|---|---|---|
| `network_error` | backend injoignable / CORS | vérifier `VITE_API_BASE_URL`, le déploiement, `CORS_ORIGINS` |
| `timeout` | backend trop lent (chat, extraction vidéo) | augmenter le délai, réduire la charge |
| `internal_error` | exception non gérée (base, disque) | lire les journaux du backend ; le client ne reçoit aucun détail |
| `http_error` 401 | session expirée | se reconnecter |
| `http_error` 404 | ressource inexistante **ou** d'un autre utilisateur | vérifier l'URL et le propriétaire |
| `http_error` 413 | fichier trop volumineux | `ATTACHMENT_MAX_BYTES`, `AVATAR_MAX_BYTES` |
| `http_error` 422 | corps de requête invalide | lire `error.detail` |
| `http_error` 501 | connecteur non branché (génération, RAG) | comportement attendu, pas un bug |
| `http_error` 429 | limite de débit sur `/auth` | `RATE_LIMIT_PER_MINUTE` |

---

## Annexe A — État des connecteurs

| Connecteur | Branché | Ce qu'il faut pour le brancher |
|---|---|---|
| Sessions / profils / conversations | **oui** | rien |
| Recherche multimodale locale | **oui** | `ffmpeg`, corpus dans `MULTIMODAL_CORPUS_DIRS` |
| Génération (`GROQ_API_KEY`) | non | clé + implémentation de `GenerationAdapter.generate` (`services/adapters/stubs.py`) |
| RAG (`CHROMA_PERSIST_DIR`, `EMBEDDING_MODEL`) | non | ChromaDB + modèle d'embedding + `RagAdapter.search` |
| Catalogue média | non | `MediaAdapter.search` |
| Moteur scientifique | non | `ScienceAdapter.compute` |
| Supabase Auth / Storage / Edge Functions | non | décision produit, puis migration dédiée |

Le contrat de chaque adaptateur est dans `backend/app/services/adapters/base.py` ; l'état est
exposé par `GET /api/v1/system/capabilities`.

## Annexe B — Commandes utiles

```bash
# Démarrage local
cd backend && uvicorn app.main:app --reload --port 8000

# Tests
cd backend && python -m pytest -q                 # 66 attendus
cd .. && npm run check && npm test && npm run build

# État de l'index de recherche
curl -s -b cookies.txt http://localhost:8000/api/v1/retrieval/status

# Réindexer le corpus après un ajout de fichiers
curl -s -b cookies.txt -X POST 'http://localhost:8000/api/v1/retrieval/scan?force=true'

# Mesures de performance (voir docs/MULTIMODAL_RETRIEVAL.md § 11)
cd backend && python -m tools.retrieval_bench --repeat 3
```

## Annexe C — Où lire la suite

| Sujet | Document |
|---|---|
| Schéma détaillé, diagramme, index | `docs/DATABASE_SCHEMA.md` |
| API complète (routes, payloads, erreurs) | `docs/API_DOCUMENTATION.md` |
| Architecture générale | `docs/ARCHITECTURE.md` |
| Modèle de sécurité | `docs/SECURITY.md` |
| Moteur multimodal, corpus, performances | `docs/MULTIMODAL_RETRIEVAL.md` |
| État des tests | `docs/TEST_REPORT.md` |