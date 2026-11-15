# BACKEND_AUDIT — TechLabs

> Périmètre : dépôt officiel `Blaisegith/Nasa_front_project`, branche `main` (commit `bd70c47`).
> Date de l'audit : 14 nov. 2026.
>
> **Note** : ce rapport décrit l'état du projet **avant** intégration (phase 0). L'état après intégration est décrit dans `ARCHITECTURE.md`, `API_DOCUMENTATION.md` et `TEST_REPORT.md`.

---

## 1. Constat principal

**Il n'existe aucun backend dans le dépôt officiel.**

Vérifications effectuées :

| Recherche | Résultat |
|---|---|
| `git log --all --name-only` (toute l'historique) | uniquement `.gitignore`, `index.html`, `Maquette NASA.png`, `package.json`, `package-lock.json`, `src/App.jsx`, `src/main.jsx`, `src/styles.css` |
| Fichier `requirements.txt`, `pyproject.toml`, `main.py`, `Dockerfile`, `docker-compose.yml` | **absents** |
| Dossier `backend/`, `api/`, `server/`, `supabase/` | **absents** |
| Migrations SQL | **absentes** |
| `.env` / `.env.example` dans le dépôt | **absents** (le `.gitignore` les ignore) |
| Clés API dans l'historique Git | **aucune** (scan `sk-`, `AIza`, JWT, `SUPABASE_*`, `GROQ_API_KEY`, clés privées) → **aucun secret exposé, aucune rotation requise** |

Autrement dit : le frontend est un SPA statique autonome, sans couche serveur.

---

## 2. Éléments « serveur » réellement présents

Un seul appel réseau existe, et il est exécuté **depuis le navigateur** :

```
GET https://images-api.nasa.gov/search?q=SoFIE%20Growth%20Extinction%20Limits&media_type=image&page_size=8
```

(`src/App.jsx:115`)

- Pas d'authentification, pas de clé.
- Aucun contrôle de quota, aucun cache, aucune journalisation.
- Aucun mécanisme de repli contrôlé en cas d'échec (`.catch(() => {})`).

Ce n'est pas un backend : c'est une dépendance tierce directe. Elle devra être proxifiée à terme (le backend deviendra le seul point de sortie réseau).

---

## 3. RAG / ChromaDB / IA / Science / Multimodal

**Aucun de ces composants n'est présent dans ce dépôt.**

- Pas de script d'ingestion.
- Pas de collection ChromaDB, pas de configuration d'embedding (ni `Qwen3-Embedding-0.6B`, ni autre).
- Pas d'appel à Groq ou à un autre fournisseur.
- Pas de modèle numérique (XGBoost, modèle temporel).
- Pas de pipeline média (miniatures, extraction d'images clés, transcription).

Le RAG mentionné dans le cahier des charges a été développé **séparément** et ne se trouve pas dans ce dépôt. Conséquence directe sur la stratégie d'intégration :

> Le RAG, la science, le multimodal et l'IA générative seront **branchés sur des interfaces ouvertes** (contrats Python + routes HTTP + schémas de réponse), **sans être connectés** dans cette phase. Les implémentations livrées seront des **adaptateurs neutres** (réponses vides / `501` explicites), jamais des réponses inventées.

---

## 4. Ce que le backend devra fournir

Périmètre validé pour cette mission : **sessions utilisateurs et profils uniquement**, avec des points de branchement ouverts pour le reste.

### 4.1 Sessions et utilisateurs

- **Connexion simplifiée** : nom + adresse e-mail, sans mot de passe, sans OTP, sans e-mail (contrainte zéro budget assumée). Implémentée comme un **accès faible**, documenté comme tel.
- La vérification est faite **côté serveur** : le frontend ne choisit jamais un `user_id`.
- Jeton de session opaque, stocké en **cookie `HttpOnly` + `Secure` + `SameSite=Lax`**, avec :
  - expiration (configurable, 7 jours par défaut),
  - rotation à la connexion,
  - révocation (déconnexion, changement de profil, suppression de compte),
  - comparaison en temps constant,
  - limitation de débit sur `/auth/session` (protection anti-abus).
- Un utilisateur peut être créé à la volée par e-mail ; l'e-mail est **normalisé** (minuscules, trim) et **unique**.
- Un même e-mail ne peut pas créer deux comptes : la connexion renvoie la session existante (comportement « magic link » sans lien).

### 4.2 Profils

- `id` (UUID stable, côté serveur), `display_name`, `email`, `bio`, `avatar_url`, `created_at`, `updated_at`.
- L'avatar est **téléversé** vers le backend, qui le redimensionne et le stocke, puis renvoie une URL. Le frontend cesse de stocker une data URL dans `localStorage`.
- `GET /me` renvoie le profil du porteur de session. **Aucune route ne permet de lire le profil d'un autre utilisateur.**

### 4.3 Isolation

- Un utilisateur ne peut jamais lire ni modifier les conversations, documents ou médias d'un autre utilisateur.
- Côté PostgreSQL : **Row Level Security activée** avec des politiques `auth.uid() = user_id`, testées.
- Côté ChromaDB : la collection `user_documents` sera filtrée par `user_id` **dans le backend uniquement** (jamais dans le navigateur).

### 4.4 Points de branchement ouverts (non connectés)

| Interface | Route | État livré |
|---|---|---|
| Recherche documentaire (RAG) | `POST /api/v1/chat` | Passerelle définie, adaptateur `null` → `501` |
| Recherche multimédia | `GET /api/v1/media/search` | Passerelle définie, adaptateur `null` → `501` |
| Calcul scientifique | `POST /api/v1/science/compute` | Passerelle définie, adaptateur `null` → `501` |
| Génération | incluse dans `/chat` | Passerelle définie, adaptateur `null` → `501` |
| Ingestion documents | `POST /api/v1/admin/ingest` | Définie, protégée par jeton d'administration |

Ces routes existent, sont documentées, **ne renvoient jamais de contenu inventé**, et pourront être implémentées sans toucher au frontend.

---

## 5. État de l'environnement d'exécution local

| Élément | Constat |
|---|---|
| Python 3.15.1 (`C:\Python315`) | Disponible, mais **écosystème scientifique pas garanti** (roues `pydantic-core`, `numpy`, `chromadb`) |
| Python 3.14.6 | Disponible, **recommandé** pour le backend |
| FastAPI / Uvicorn / Pydantic | **Non installés** |
| Node 24.22.1 / npm | OK, build validé |
| Docker | Non vérifié (installation présente : `C:\Users\user\.docker`) |
| `gh` CLI | Installé (v2.93.0) mais **non authentifié** → `git push` nécessitera une authentification explicite |

**Décision recommandée** : créer un environnement virtuel Python **3.14** (`backend/.venv`) et y épingler les dépendances. Tester l'installation avant d'écrire du code applicatif (risque de roues manquantes sur 3.14/3.15 pour les futures dépendances RAG).

---

## 6. Configuration et secrets

Aucune configuration d'environnement n'existe dans le dépôt. Un fichier `.env.example` sera créé à la racine (jamais `.env`), avec :

```
# Backend
BACKEND_HOST
BACKEND_PORT
BACKEND_ENV
BACKEND_SECRET_KEY
BACKEND_SESSION_TTL_HOURS
CORS_ORIGINS

# Supabase (PostgreSQL)
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # serveur uniquement

# Fournisseur génératif (non branché)
GROQ_API_KEY

# RAG / ChromaDB (non branché)
CHROMA_PERSIST_DIR
EMBEDDING_MODEL

# Frontend
VITE_API_BASE_URL
```

Règles :
- `SUPABASE_SERVICE_ROLE_KEY` et `GROQ_API_KEY` ne doivent **jamais** apparaître côté client.
- Le préfixe `VITE_` est la seule chose exposée au navigateur.
- Vérification systématique avant tout commit : `git diff --cached` + recherche de motifs de secrets.

---

## 7. Risques identifiés

| Risque | Impact | Mitigation |
|---|---|---|
| Accès faible par e-mail sans mot de passe | Usurpation possible si l'e-mail est connu | Documenté comme prototype, rate limiting, cookies `HttpOnly`, pas de données sensibles, avertissement dans l'UI |
| `user_id` falsifié | Fuite entre utilisateurs | Jamais lu depuis le client ; `user_id` dérivé du cookie signé côté serveur |
| Erreur de politique RLS | Fuite de conversations | Tests automatisés d'isolation (§18 du cahier des charges) |
| Stockage d'avatars | Dérive du volume | Redimensionnement serveur, formats `webp`/`jpeg`, taille maximale, URL signées |
| Dépendances Python non installables | Blocage | Vérification immédiate, environnement virtuel dédié, versions épinglées |
| `git push` impossible (pas d'authentification) | Livraison bloquée | Authentification explicite à demander à l'utilisateur ; aucun push sans accord |

---

## 8. Conclusion

Le backend est à **créer intégralement**, mais le périmètre est clair et sans ambiguïté :

1. FastAPI modulaire (`app/api`, `app/core`, `app/models`, `app/schemas`, `app/services`, `app/middleware`, `app/utils`).
2. Sessions par cookie signé + profils, adossés à Supabase PostgreSQL avec RLS.
3. Frontend connecté via un client API unique.
4. **Quatre adaptateurs ouverts** (RAG, média, science, génération) qui lèvent `501` proprement jusqu'à leur implémentation.

Le frontend actuel ne sera pas réécrit : il sera **branché**. Aucune route ne sera supprimée, aucune donnée existante ne sera perdue (le profil local sera migré vers le serveur à la première connexion).