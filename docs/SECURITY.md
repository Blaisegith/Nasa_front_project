# SECURITY — Frame in Freefall AI

Périmètre de cette version : sessions utilisateurs, profils, conversations,
pièces jointes du chat.
Le RAG, le multimodal, le stockage de documents privés et le déploiement ne sont
pas encore branchés ; les mesures correspondantes sont indiquées comme à venir.

---

## 1. Modèle d'authentification (et ses limites)

| Élément | Mise en œuvre |
|---|---|
| Connexion | e-mail (+ nom optionnel), **sans mot de passe** |
| Nature | **accès faible** : ne prouve pas l'identité |
| Vérification | intégralement côté serveur |
| Jeton | 32 octets aléatoires (`secrets.token_urlsafe`), **jamais** stocké en clair |
| Stockage | cookie `HttpOnly`, `SameSite=Lax`, `Secure` si HTTPS, `Path=/` |
| Empreinte | SHA-256 du jeton en base (`sessions.token_hash`, index unique) |
| Expiration | 7 jours par défaut (`SESSION_TTL_HOURS`) |
| Révocation | `DELETE /auth/session` ; `revoked_at` renseigné |
| Rotation | nouvelle session à chaque connexion, l'ancienne n'est pas réutilisée |
| Comparaison | `hmac.compare_digest` |
| Anti-abus | 20 requêtes/minute/IP sur `/api/v1/auth/*`, `Retry-After` en réponse |

**Ce que ce modèle ne protège pas** : une personne connaissant l'adresse e-mail
d'un utilisateur peut ouvrir une session à sa place. Cette faiblesse est assumée
pour le prototype. Avant toute mise en production avec des données réelles :

- ajouter un e-mail de confirmation ou un lien magique signé à durée limitée ;
- ou activer l'authentification Supabase (e-mail + mot de passe / OTP).

---

## 2. Ce qui est appliqué

| Mesure | Détail |
|---|---|
| `user_id` non falsifiable | jamais lu depuis le corps, l'URL ou un en-tête ; dérivé du cookie signé |
| Isolation | toute requête filtrée par `user_id` ; ressource d'autrui → `404` |
| RLS | activée sur toutes les tables privées, en fail-closed (`current_user_id()` NULL → 0 ligne) |
| Contexte RLS | `app.user_id` posé à chaque requête authentifiée (`core/rls.py`, transaction courante) ; sans effet en SQLite |
| Avatars | chemin disque dérivé de l'`user_id` de session, jamais fourni par le client |
| Uploads (avatars) | type MIME et taille (2 Mo) validés serveur ; extension reconstruite |
| Pièces jointes du chat | liste blanche de types MIME, 10 Mo max, 5 par question, nom assaini, nom de fichier aléatoire, un dossier par utilisateur |
| Lecture des pièces jointes | `GET /api/v1/chat/attachments/{id}` revérifie la propriété côté serveur : `404` pour un fichier d'autrui |
| Fichiers déposés | jamais exécutés, jamais servis depuis un chemin fourni par le client |
| Erreurs | aucun détail technique renvoyé au client (`500` générique) |
| CORS | origines déclarées explicitement, `allow_credentials` activé, aucune `*` |
| Secrets | jamais dans le bundle : seul `VITE_*` est exposé au navigateur |
| Transport | HTTPS requis en production (`SESSION_COOKIE_SECURE`) |
| Journalisation | logs applicatifs, aucune donnée personnelle journalisée |

---

## 3. Vérifications effectuées

| Contrôle | Résultat |
|---|---|
| Secrets dans l'historique Git (`sk-`, `AIza`, JWT, `SUPABASE_*`, `GROQ_API_KEY`, clés privées) | **aucun** |
| Secrets dans l'arborescence de travail | **aucun** (`npm run check:secrets`, code de sortie non nul si trouvés) |
| `.env` committé | **non** (`.gitignore` : `.env`, `.env.*`, `!.env.example`) |
| Clé de session par défaut en production | **bloquée** au démarrage (`validate_runtime`) |
| `SESSION_COOKIE_SECURE=false` en production | **bloqué** au démarrage |
| Accès à la conversation d'un autre utilisateur | **404** (test automatisé) |
| `user_id` envoyé par le client | **ignoré** (test automatisé) |
| Session révoquée | **401** (test automatisé) |
| E-mail dupliqué / espaces / majuscules | normalisé, même compte (test automatisé) |
| Téléversement d'un type non autorisé | **422** (test automatisé) |
| Fichier vide / trop volumineux | **422** / **413** (test automatisé) |
| Lecture de la pièce jointe d'un autre utilisateur | **404** (test automatisé) |
| Identifiant de pièce jointe inconnu dans `POST /chat` | **404**, question non enregistrée (test automatisé) |

---

## 4. À faire avant une mise en production

| Priorité | Action |
|---|---|
| Haute | Remplacer l'accès faible par une authentification Supabase ou un lien magique |
| Haute | `SESSION_COOKIE_SECURE=true` + HTTPS (obligatoire) |
| Haute | `BACKEND_SECRET_KEY` aléatoire (48 octets) |
| Haute | `CORS_ORIGINS` limité au(x) domaine(s) Cloudflare Pages |
| Moyenne | Rate limiting distribué (actuellement par processus) |
| Moyenne | Rotation et expiration des sessions côté Supabase (cron) |
| Moyenne | CSP stricte, `X-Frame-Options`, `Strict-Transport-Security` |
| Moyenne | Journalisation des connexions (succès/échecs) avec conservation limitée |
| Basse | Validation du type MIME réel (magic bytes) plutôt que l'en-tête |

---

## 5. Données personnelles

- Les conversations sont privées et rattachées à un utilisateur.
- Aucune donnée de conversation n'est accessible sans session valide.
- Le corpus scientifique commun (`nasa_scientific_corpus`) sera en lecture
  partagée ; les documents personnels (`user_documents`) resteront isolés par
  `user_id`, côté backend **et** côté RLS.
- Le navigateur ne contacte jamais ChromaDB : tout passe par l'API.