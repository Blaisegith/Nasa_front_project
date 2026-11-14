# TEST_REPORT — TechLabs

Date : 14 novembre 2026 · Branche `feature/techlabs-platform-integration`

---

## 1. Résumé

| Suite | Commande | Résultat |
|---|---|---|
| Build frontend | `npm run build` | **OK** — 1585 modules, 1,39 s |
| Backend | `python -m pytest` | **17 passés**, 0 échec |
| Vérification HTTP | session, profil, chat, conversations | **OK** |
| Proxy Vite `/api` | `GET /api/v1/system/health` | **200** |

---

## 2. Build frontend

```
vite v8.3.5 building client environment for production...
✓ 1585 modules transformed.
dist/index.html                   0.58 kB │ gzip:  0.36 kB
dist/assets/index-*.css          62.37 kB │ gzip: 13.24 kB
dist/assets/index-*.js          274.54 kB │ gzip: 85.81 kB
✓ built in 1.39s
```

Aucun avertissement. Le CSS passe de 55,45 à 62,37 kB à cause des nouveaux
composants de réponse (`src/styles/answer.css`), les règles existantes n'étant
pas modifiées.

---

## 3. Tests backend (`pytest`)

| # | Test | Vérifie | Résultat |
|---|---|---|---|
| 1 | `test_health_and_capabilities` | `/health` et les 4 connecteurs à `false` | ✅ |
| 2 | `test_create_session_sets_httponly_cookie` | 201, cookie `HttpOnly` + `SameSite=lax`, `weak_auth` | ✅ |
| 3 | `test_email_is_normalized_and_reused` | casse/espaces → même `user_id` | ✅ |
| 4 | `test_session_requires_authentication` | 401 sur session et profil sans cookie | ✅ |
| 5 | `test_invalid_email_rejected` | 422 sur e-mail invalide | ✅ |
| 6 | `test_logout_revokes_session` | 204 puis 401 | ✅ |
| 7 | `test_forged_user_id_is_ignored` | `X-User-Id` falsifié ignoré | ✅ |
| 8 | `test_profile_update_and_read` | PATCH profil + `/auth/me` | ✅ |
| 9 | `test_empty_display_name_rejected` | nom vide rejeté | ✅ |
| 10 | `test_conversation_isolation` | Bob → 404 sur la conversation d'Alice | ✅ |
| 11 | `test_chat_persists_question_even_when_not_configured` | 501 + question enregistrée, **aucune** réponse fabriquée | ✅ |
| 12 | `test_conversation_shared_between_views` | liste et détail renvoient la même conversation | ✅ |
| 13 | `test_conversations_of_other_user_are_not_listed` | `items: []`, `total: 0` | ✅ |
| 14 | `test_media_and_science_are_open_but_not_connected` | 501 sur média et science | ✅ |
| 15 | `test_avatar_upload_and_fetch` | 201, URL d'avatar, restitution octet pour octet | ✅ |
| 16 | `test_avatar_of_another_user_is_not_readable` | Bob → 404 sur l'avatar d'Alice | ✅ |
| 17 | `test_avatar_rejects_unsupported_type` | 422 sur `text/plain` | ✅ |

---

## 4. Vérification HTTP réelle (serveur démarré)

| Étape | Requête | Résultat |
|---|---|---|
| Santé | `GET /api/v1/system/health` | `200` — `{"status":"ok",…,"database":"sqlite"}` |
| Session | `POST /api/v1/auth/session` | `201` — profil + expiration |
| Session | `GET /api/v1/auth/me` | `200` — même `user_id` |
| Profil | `PATCH /api/v1/profile` | `200` — `display_name` mis à jour |
| Chat | `POST /api/v1/chat` | `501` — `not_implemented`, question persistée |
| Historique | `GET /api/v1/conversations` | `200` — 1 conversation, aperçu correct |
| Frontend | `GET http://127.0.0.1:5173/` | `200` |
| Proxy | `GET /api/v1/system/health` via Vite | `200` |

---

## 5. Ce qui n'est pas encore testé

| Élément | Raison |
|---|---|
| Upload d'avatar (multipart) | couvert par `test_avatar.py` ; volume et formats réels à compléter |
| PostgreSQL / Supabase réel | aucune instance disponible ; les tests tournent sur SQLite |
| Politiques RLS en base | nécessite PostgreSQL ; à valider avec `SET LOCAL app.user_id` |
| Rendu des réponses multimodales | aucun générateur branché (par conception) |
| Accessibilité automatisée | pas d'axe ni de test e2e installé |
| Tests frontend | pas de Vitest/Testing Library installé |
| Limitation de débit | couverte par le code, non testée (limite montée à 500 en test) |

---

## 6. Prochaines étapes de test

1. `httpx` + `files=` pour l'avatar (200/201, 413, 422).
2. Instance Supabase jetable : appliquer `001_init.sql`, exécuter deux utilisateurs
   en SQL avec `SET LOCAL app.user_id` et vérifier l'isolation.
3. Vitest + Testing Library : rendu du chat, de l'accueil, de la modale de profil.
4. Playwright : parcours complet (connexion → question → historique → rechargement).