# DATABASE_SCHEMA — Frame in Freefall AI

Deux implémentations du même schéma :

| Contexte | Fichier | Remplissage |
|---|---|---|
| Production (Supabase PostgreSQL) | `backend/migrations/001_init.sql` | appliqué manuellement dans le SQL Editor Supabase |
| Développement local / tests | SQLAlchemy (`backend/app/models/`) | automatique au démarrage (`Base.metadata.create_all`) |

> La migration SQL est la **source de vérité** en production (types `uuid`, `jsonb`,
> RLS, triggers). Le schéma local est volontairement générique pour rester
> testable sans PostgreSQL.

---

## 1. Diagramme

```
users ──1:1── profiles
  │
  ├──1:N── sessions
  │
  └──1:N── conversations ──1:N── messages
                │
                └──(réservé)── user_documents ──1:N── media_assets
```

---

## 2. Tables

### `users`

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `email` | text | NOT NULL, index unique sur `lower(email)` |
| `created_at` | timestamptz | NOT NULL, `now()` |
| `last_seen_at` | timestamptz | NULL |

L'e-mail est **normalisé** côté serveur (minuscules, espaces retirés) avant insertion.

### `profiles`

| Colonne | Type | Contrainte |
|---|---|---|
| `user_id` | uuid | PK, FK → `users.id` `ON DELETE CASCADE` |
| `display_name` | text | NOT NULL |
| `bio` | text | NOT NULL, défaut `''` |
| `avatar_url` | text | NULL |
| `updated_at` | timestamptz | NOT NULL, trigger |

### `sessions`

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `users.id`, index |
| `token_hash` | text | NOT NULL, **UNIQUE**, index |
| `created_at` | timestamptz | NOT NULL |
| `expires_at` | timestamptz | NOT NULL |
| `revoked_at` | timestamptz | NULL |
| `ip_address` | text | NULL |
| `user_agent` | text | NULL |

`token_hash` = SHA-256 du jeton. Le jeton en clair n'existe que dans le cookie
`HttpOnly` du navigateur. Une session est active si `revoked_at IS NULL` **et**
`expires_at > now()`.

### `conversations`

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | NOT NULL, index |
| `title` | text | NOT NULL, défaut `'Nouvelle conversation'` |
| `created_at` | timestamptz | NOT NULL |
| `updated_at` | timestamptz | NOT NULL, trigger |
| `archived_at` | timestamptz | NULL |

Index : `(user_id, updated_at desc)`.

### `messages`

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | uuid | PK |
| `conversation_id` | uuid | FK → `conversations.id` `ON DELETE CASCADE`, index |
| `role` | text | `user` \| `assistant` \| `system` |
| `status` | text | `completed` \| `partial` \| `unavailable` \| `failed` |
| `content` | jsonb | NOT NULL, défaut `{}` |
| `sequence` | integer | NOT NULL, ordre d'affichage |
| `created_at` | timestamptz | NOT NULL |

Index : `(conversation_id, sequence)`.

`content` d'un message `user` : `{ "text": "…", "attachments": [ … ] }`, où chaque
pièce jointe suit le schéma `AttachmentRef` (voir `API_DOCUMENTATION.md` §4) :
`attachment_id`, `filename`, `media_type`, `size_bytes`, `url`.
`content` d'un message `assistant` : réponse complète au format `answer` (voir `API_DOCUMENTATION.md` §5).

### 2.1 Pièces jointes : pas de table dédiée

Les fichiers vivent sur le disque (`ATTACHMENT_DIR/<user_id>/<uuid>.<ext>`), et
leurs métadonnées sont enregistrées dans `messages.content.attachments`. Ce
choix garde une seule source de vérité pour l'historique : ce que l'utilisateur
voit est exactement ce qui a été persisté avec sa question.

Conséquences :

- aucune suppression en cascade à gérer pour un retrait d'historique ;
- la lecture d'un fichier passe toujours par `GET /api/v1/chat/attachments/{id}`,
  qui vérifie la propriété **côté serveur** : l'URL ne suffit jamais ;
- le RAG, quand il sera branché, indexera par `attachment_id` ; une table
  `attachments` deviendra utile à ce moment-là (index, cycle de vie, purge).

Les fichiers orphelins (téléversés, jamais envoyés) sont tolérés : ils sont
isolés par utilisateur et supprimables par une tâche de fond.

---

## 3. Tables réservées (non utilisées par l'API)

Créées dès maintenant pour que le RAG et le multimodal se branchent sans
migration destructive.

### `user_documents`

| Colonne | Type |
|---|---|
| `id` | uuid PK |
| `user_id` | uuid FK → users |
| `title` | text |
| `mime` | text |
| `size_bytes` | bigint |
| `storage_path` | text |
| `checksum` | text |
| `collection` | text, défaut `'user_documents'` |
| `created_at` | timestamptz |

### `media_assets` (catalogue multimédia, cf. §6.5 du cahier des charges)

| Colonne | Type |
|---|---|
| `id` | uuid PK |
| `media_type` | text (`image` \| `video`) |
| `title` | text NOT NULL |
| `description` | text |
| `source` | text |
| `experiment` | text |
| `file_path` | text |
| `thumbnail_path` | text |
| `source_url` | text |
| `license` | text |
| `duration_seconds` | numeric |
| `timestamp_seconds` | numeric |
| `associated_document_id` | uuid FK → user_documents |
| `metadata` | jsonb |
| `created_at` | timestamptz |

### `ingestion_runs`

Journal d'ingestion : `kind`, `status`, `stats` (jsonb), `started_at`, `finished_at`.
Sert de checkpoint pour un pipeline reprenable.

---

## 4. Row Level Security

Activée sur `users`, `profiles`, `sessions`, `conversations`, `messages`,
`user_documents`, `media_assets`, `ingestion_runs`.

Le contexte d'identité est fourni par le backend à chaque transaction :

```sql
set local app.user_id = '<uuid>';
```

Fonction helper :

```sql
create or replace function public.current_user_id()
returns uuid language sql stable as $$
    select nullif(current_setting('app.user_id', true), '')::uuid;
$$;
```

Politiques :

| Table | Politique |
|---|---|
| `users` | `select`/`update` sur `id = current_user_id()` |
| `profiles` | `select`/`update` sur `user_id = current_user_id()` |
| `sessions` | `select` sur `user_id = current_user_id()` |
| `conversations` | `select`/`insert`/`update`/`delete` sur `user_id = current_user_id()` |
| `messages` | `select`/`insert` si la conversation parente appartient à l'utilisateur |
| `user_documents` | `select`/`insert`/`delete` sur `user_id = current_user_id()` |
| `media_assets` | lecture publique (`true`), écriture réservée au service |
| `ingestion_runs` | aucun accès applicatif (`using (false)`) |

**Comportement fail-closed** : si `app.user_id` n'est pas défini,
`current_user_id()` renvoie `NULL` et aucune ligne n'est retournée.

---

## 5. Rôle applicatif

```sql
create role frameinff_app login password '<mot de passe fort>';
grant usage on schema public to frameinff_app;
grant select, insert, update, delete on all tables in schema public to frameinff_app;
```

Le rôle `service_role` de Supabase (ou un rôle d'admin dédié) reste requis pour
les opérations d'ingestion et de maintenance.

---

## 6. Migration depuis la version locale du frontend

L'ancienne version stockait le profil dans `localStorage['nasa-profile']`
(`name`, `email`, `bio`, `photo` en data URL). Les clés de stockage sont
désormais préfixées `frameinff-` (voir `src/lib/storage.js`).

À la première connexion, `AuthProvider` :

1. envoie `display_name` et `bio` via `PATCH /api/v1/profile` ;
2. convertit la data URL en `File` puis l'envoie via `POST /api/v1/profile/avatar` ;
3. remplace le contenu local par un cache sans photo.

Aucune donnée n'est perdue, aucune migration SQL manuelle n'est nécessaire.