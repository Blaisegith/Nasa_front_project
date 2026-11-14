# API_DOCUMENTATION — TechLabs

Base URL : `http://localhost:8000` (développement), `/api` via proxy Vite en dev, même origine en production.

Documentation interactive générée automatiquement : `http://localhost:8000/docs` (OpenAPI).

Toutes les réponses d'erreur suivent le même format :

```json
{
  "error": {
    "code": "not_implemented",
    "message": "La génération de réponse n'est pas encore connectée.",
    "detail": { "component": "generation", "conversation_id": "…" }
  }
}
```

---

## 1. Santé et capacités

### `GET /api/v1/system/health`

```json
{ "status": "ok", "app": "TechLabs API", "env": "development", "database": "sqlite" }
```

### `GET /api/v1/system/capabilities`

Indique au frontend ce qui est réellement branché.

```json
{
  "capabilities": {
    "rag":        { "name": "rag-unavailable",        "connected": false },
    "media":      { "name": "media-unavailable",      "connected": false },
    "science":    { "name": "science-unavailable",    "connected": false },
    "generation": { "name": "generation-unavailable", "connected": false }
  },
  "chat": "/api/v1/chat",
  "media": "/api/v1/media/search",
  "science": "/api/v1/science/compute"
}
```

---

## 2. Session (authentification)

> Avertissement : la connexion par e-mail sans mot de passe est un **accès faible**.
> Elle ne prouve pas l'identité et ne convient pas à des données confidentielles.

### `POST /api/v1/auth/session`

Crée l'utilisateur s'il n'existe pas, puis ouvre une session.

```json
{ "email": "alice@example.com", "display_name": "Alice Martin" }
```

`display_name` est optionnel : à défaut, il est déduit de l'e-mail.

**201 Created** + cookie `techlabs_session` (`HttpOnly`, `SameSite=Lax`, `Secure` si configuré) :

```json
{
  "profile": {
    "user_id": "3581ac3e-…",
    "email": "alice@example.com",
    "display_name": "Alice Martin",
    "bio": "",
    "avatar_url": null,
    "updated_at": "2026-11-14T17:37:06Z"
  },
  "session_expires_at": "2026-11-21T17:37:06Z",
  "weak_auth": true
}
```

Codes d'erreur : `422` e-mail invalide, `429` trop de tentatives.

### `GET /api/v1/auth/session`

Réponse identique si la session est valide, `401` sinon.

### `GET /api/v1/auth/me`

Alias de `GET /auth/session`.

### `DELETE /api/v1/auth/session`

**204 No Content** : la session est révoquée côté serveur et le cookie supprimé.

---

## 3. Profil

Toutes ces routes exigent une session valide (`401` sinon).

### `GET /api/v1/profile`

```json
{
  "user_id": "3581ac3e-…",
  "email": "alice@example.com",
  "display_name": "Alice Martin",
  "bio": "Ingénieure combustion.",
  "avatar_url": "/api/v1/profile/avatar/<user_id>/<fichier>.jpg",
  "updated_at": "2026-11-14T18:02:11Z"
}
```

### `PATCH /api/v1/profile`

```json
{ "display_name": "Alice M.", "bio": "Études des flammes en microgravité." }
```

Les deux champs sont optionnels. `display_name` vide → `422`.

### `POST /api/v1/profile/avatar`

`multipart/form-data`, champ `file`.

- Formats acceptés : `image/jpeg`, `image/png`, `image/webp` (configurable).
- Taille maximale : 2 Mo (`413` au-delà).
- Réponse **201** : `{ "avatar_url": "/api/v1/profile/avatar/<user_id>/<fichier>.jpg" }`

### `GET /api/v1/profile/avatar/{filename}`

Renvoie l'avatar du porteur de session. L'accès est revérifié serveur : un autre
`user_id` dans l'URL ne donne pas accès au fichier.

---

## 4. Conversations

Toutes les requêtes sont filtrées par `user_id`. La conversation d'un autre
utilisateur renvoie `404` (son existence n'est pas révélée).

### `GET /api/v1/conversations?limit=20&offset=0`

```json
{
  "items": [
    {
      "id": "…",
      "title": "Pourquoi la flamme est-elle sphérique ?",
      "created_at": "…",
      "updated_at": "…",
      "message_count": 1,
      "preview": "Pourquoi la flamme est-elle sphérique ?"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### `POST /api/v1/conversations`

```json
{ "title": "Flammes sphériques" }
```

**201 Created** → conversation vide.

### `GET /api/v1/conversations/{conversation_id}`

```json
{
  "id": "…",
  "title": "…",
  "created_at": "…",
  "updated_at": "…",
  "messages": [
    {
      "id": "…",
      "conversation_id": "…",
      "role": "user",
      "status": "completed",
      "content": { "text": "Pourquoi la flamme est-elle sphérique ?" },
      "sequence": 1,
      "created_at": "…"
    }
  ]
}
```

### `DELETE /api/v1/conversations/{conversation_id}`

**204 No Content**. `404` si la conversation n'existe pas ou n'appartient pas au porteur.

---

## 5. Chat — point d'entrée du RAG et de la génération

### `POST /api/v1/chat`

```json
{ "conversation_id": null, "text": "Pourquoi la flamme est-elle sphérique ?" }
```

- `conversation_id` absent : une conversation est créée avec le titre = début de la question.
- La question est **enregistrée avant** toute génération.
- Si le générateur n'est pas branché : **501** avec `detail.conversation_id`,
  `detail.message_id` et `detail.question_persisted = true`.

Exemple de réponse en production (générateur branché) :

```json
{
  "conversation_id": "…",
  "message_id": "…",
  "status": "completed",
  "answer": {
    "schema_version": "1.0",
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

---

## 6. Multimodal et science — contrats ouverts

### `GET /api/v1/media/search?q=flamme&media_type=image,video&limit=8`

**501** tant que le catalogue n'est pas branché :

```json
{ "error": { "code": "not_implemented", "message": "…", "detail": { "component": "media", "query": "flamme" } } }
```

### `POST /api/v1/science/compute`

**501** tant que le moteur scientifique n'est pas branché.

---

## 7. Conventions

| Sujet | Règle |
|---|---|
| Identité | `user_id` dérivé du cookie de session, jamais du corps de la requête |
| Isolement | toute ressource est filtrée par `user_id` ; une ressource d'autrui → `404` |
| Format de réponse | `schema_version` obligatoire, sections optionnelles |
| Contenu inventé | interdit : une section absente n'est pas rendue |
| Quotas | `429` avec `Retry-After` sur `/auth/*` |
| Secrets | aucune clé côté client ; `SUPABASE_SERVICE_ROLE_KEY` et `GROQ_API_KEY` restent serveur |