# MULTIMODAL RETRIEVAL — audit, conception, état

Document de référence du **MULTIMODAL RETRIEVAL ENGINE** de FRAME IN FREEFALL AI.
Il est écrit avant le code (PHASE 1 et 2 du cahier des charges) et tenu à jour à
chaque phase.

## 1. Audit de l'existant (faits vérifiés)

### 1.1 Frontend

| Élément | État |
|---|---|
| `ConversationProvider` | source unique de vérité, `ask(text, attachments)`, phases `idle/sending/waiting/done/unavailable/error` |
| Accueil | deux états : accueil puis tableau de bord (pas de redirection vers le chat) |
| `AnswerRenderer` | rend `summary`, `arguments`, `charts`, `media`, `tables`, `references`, `limitations` |
| `LineChart` | SVG maison, aucune dépendance |
| Pièces jointes | `POST /chat/attachments` puis référencement par `attachment_id` |
| Persistance | `frameinff-*` dans `localStorage`, conversations côté serveur |

### 1.2 Backend

| Élément | État |
|---|---|
| `app/services/adapters/base.py` | contrats `RagAdapter`, `MediaAdapter`, `ScienceAdapter`, `GenerationAdapter` + `AdapterNotConfigured` |
| `app/services/adapters/registry.py` | registre + `capabilities_status()` |
| `app/services/adapters/stubs.py` | quatre adaptateurs `available = False` qui lèvent `501` |
| `POST /api/v1/chat` | persiste la question, puis `501` si la génération n'est pas branchée |
| Base de données | SQLite (`frameinff.db`), SQLAlchemy 2.0 asynchrone |
| Stockage fichiers | `var/attachments` (10 Mo max, 5 par message), `var/avatars` |

### 1.3 Inventaire des données réelles

| Ressource | Présence | Détail |
|---|---|---|
| Documents scientifiques (PDF, rapports) | **absente** | aucun corpus dans le dépôt |
| Images | **absente** | seul `Maquette NASA.png` (maquette d'interface) |
| Vidéos | **absente** | — |
| Mesures numériques (CSV, JSON) | **absente** | — |
| Métadonnées d'expériences | **absente** | — |
| Pièces jointes de test | présente | artefacts de test (PDF factices de 9 octets) |
| Source réelle exploitable | **NASA Images API** | déjà utilisée par `useNasaArticles.js` : images + vidéos + métadonnées publiques, sans clé |

**Conséquence directe** : le moteur ne peut rien inventer. Il est construit pour
indexer un corpus réel (dossier local et/ou NASA Images API) et expose un état
d'index explicite. Sans corpus, la recherche renvoie un état `empty`, jamais des
résultats fabriqués.

### 1.4 Dépendances disponibles (vérifié le 2026-11-15)

Environnement : Python 3.14.6, ffmpeg/ffprobe 9.0.1 (winget), venv sans pip
(installations via `python -m pip --python .venv`).

| Paquet | Version résolue | Décision |
|---|---|---|
| `pillow` | 13.0.0 | **retenu** : décodage d'images, descripteurs réels |
| `numpy` | 2.5.4 | non requis (calcul vectoriel en Python pur, corpus de test réduit) |
| `onnxruntime` | 1.32.0 | candidat pour SigLIP/CLIP en ONNX |
| `torch` | 2.15.0 | écarté : ~2,5 Go, disproportionné pour l'usage |
| `chromadb` | résoluble | RAG existant, hors périmètre de ce moteur |

## 2. Architecture du moteur

### 2.1 Découpage

```
app/services/retrieval/
├── config.py        RetrievalSettings (corpus, modèles, quotas)
├── models.py        Resource, Chunk, Frame, NumericSeries, ScoredResult, RetrievalBundle, Intent
├── store.py         index SQLite (tables mr_*) : ressources, chunks, frames, vecteurs, empreintes
├── embedders.py     Embedder (protocole) + StructuralEmbedder + OnnxClipEmbedder + sélection
├── extract.py       extraction texte / image / vidéo (ffmpeg) / séries numériques
├── indexer.py       parcours incrémental, empreintes de contenu, réindexation ciblée
├── engine.py        intention, recherche lexicale, recherche visuelle, fusion, classement
└── ingest_nasa.py   collecte distante (NASA Images API) → ressources locales indexables
```

Aucune de ces briques ne dépend du frontend, aucune ne fabrique de contenu.

### 2.2 Chaîne de traitement

```
question ──► analyse d'intention (règles déterministes)
          ├─► RAG textuel existant (chunks)          [si texte demandé]
          ├─► recherche visuelle (images)            [si image demandée]
          ├─► recherche vidéo : frames → vidéo + t°  [si vidéo demandée]
          └─► séries numériques (variables/unités)   [si évolution demandée]
                                   │
                        fusion RRF + quotas par modalité
                                   │
                        classement + score de confiance
                                   │
                     RetrievalBundle → schéma de réponse frontend
```

### 2.3 Intention (déterministe, documentée)

L'intention est dérivée de mots-clés multilingues (fr/en) et de la ponctuation.
Elle produit des poids, pas des exclusions : une question ambiguë active plusieurs
modalités. Aucune décision n'est prise par un modèle non vérifiable.

| Intention | Modalités privilégiées |
|---|---|
| `explain` | texte |
| `show_images` | images |
| `show_videos` | vidéos |
| `temporal` | numérique + texte |
| `compare` | numérique + texte |
| `complex` | toutes |

### 2.4 Embeddings

| Embedder | Espace | Disponibilité | Usage |
|---|---|---|---|
| `StructuralEmbedder` | 288 dim. | toujours | descripteur réel (histogramme chromatique 4×4×4, orientations de contours, layout) + texte par hachage de n-grammes. **Structurel, pas sémantique** : déclaré comme tel dans les métadonnées |
| `OnnxClipEmbedder` | 512/768 dim. | si `var/models/<nom>` présent | SigLIP ou CLIP en ONNX, espace joint texte/image |

Le choix est explicite et remonte dans chaque résultat (`embedder`), afin que
l'interface ne puisse jamais présenter une correspondance structurelle comme une
compréhension sémantique.

### 2.5 Index et incrémental

- Empreinte de contenu (SHA-256) par fichier et par frame extraite.
- Un fichier déjà indexé avec la même empreinte n'est jamais réextrait ni réencodé.
- Une ressource modifiée est réindexée seule ; les frames orphelines sont supprimées.
- Les vecteurs sont stockés en BLOB float32 (little-endian) à côté de leurs
  références : pas de base vectorielle supplémentaire à exploiter pour un corpus
  de cette taille, pas de rechargement complet en mémoire.
- Les fichiers volumumineux ne sont jamais dupliqués : seules les frames extraites
  (JPEG, qualité 82, largeur bornée) sont écrites dans `var/retrieval/frames`.

## 3. Modèles d'IA : évaluation avant ajout

| Modèle | Rôle | Poids | RAM au chargement | Latence CPU/image | Verdict |
|---|---|---|---|---|---|
| `SigLIP base patch16 224` (ONNX) | texte + image, espace joint | ~370 Mo (fp16) | ~0,8 Go | ~120 ms | **retenu** si besoin sémantique réel |
| `CLIP ViT-B/32` (ONNX) | texte + image | ~150 Mo (fp16) | ~0,5 Go | ~70 ms | alternative légère, moins précis |
| `Qwen3-Embedding-0.6B` | texte (déjà prévu par la config) | ~1,2 Go | ~1,5 Go | ~200 ms/texte | RAG, hors périmètre de ce moteur |
| descripteur structurel | images, repli | 0 | ~0 | ~15 ms | **actif par défaut**, non sémantique |

**Aucun modèle n'est téléchargé à l'installation.** Le moteur démarre avec le
descripteur structurel, et bascule sur SigLIP dès que les fichiers ONNX sont
déposés dans `var/models/`. Condition d'ajout : `onnxruntime` (déjà résoluble),
espace disque et RAM ci-dessus, et acceptation explicite du poids du modèle.

## 4. API exposée

| Méthode | Rôle |
|---|---|
| `GET /api/v1/retrieval/status` | état de l'index : corpus, ressources par type, embedder, fraîcheur |
| `POST /api/v1/retrieval/scan` | indexation incrémentale du corpus (bloquante, plafonnée) |
| `POST /api/v1/retrieval/search` | recherche multimodale : `RetrievalBundle` |
| `GET /api/v1/retrieval/resources/{id}` | métadonnées d'une ressource indexée |

## 5. Contrat de réponse (schéma frontend)

`RetrievalBundle` :

```json
{
  "question": "…",
  "intent": { "kind": "show_videos", "modalities": ["video", "text"], "weights": {} },
  "status": "ok | empty | unavailable",
  "notes": ["…"],
  "results": {
    "documents": [ { "id", "title", "score", "excerpt", "source", "locator" } ],
    "images":    [ { "id", "title", "score", "url", "thumb_url", "caption", "source", "experiment" } ],
    "videos":    [ { "id", "title", "score", "url", "thumb_url", "duration_s", "segments": [ { "start_s", "end_s", "score", "frame_url" } ], "source" } ],
    "measurements": [ { "id", "title", "variables": [ { "name", "unit", "points": [ [ t, v ] ] } ], "source" } ]
  },
  "provenance": { "indexed_at": "…", "embedder": "…", "corpus_files": 12 }
}
```

Les tableaux absents sont omis : aucune modalité n'est renvoyée « pour faire
rempli ». Les scores sont des similarités réelles, bornées, jamais des
pourcentages de pertinence inventés.

## 6. Phases

| Phase | Contenu | État |
|---|---|---|
| 1 | Audit + inventaire | fait |
| 2 | Conception, interfaces | fait |
| 3 | Extraction + indexation | fait (`extract.py`, `indexer.py`, `store.py`) |
| 4 | Recherche, fusion, classement | fait (`engine.py`) |
| 5 | Intégration RAG / IA | partiel : la recherche est branchée au chat, le RAG textuel reste un adaptateur non branché (sa reprise est à l'ordre du jour) |
| 6 | API backend | fait (`/api/v1/retrieval/*`) |
| 7 | Dashboard frontend | fait côté rendu : médias, graphiques et références sont projetés dans le schéma de réponse existant ; segments horodatés cliquables |
| 8 | Synchronisation CHAT | fait : la réponse partielle est persistée dans la même conversation |
| 9 | Tests, performance | fait : 52 tests backend, chaîne de bout en bout vérifiée |

## 7. Ce qui est réellement branché (état vérifié)

| Capacité | État | Preuve |
|---|---|---|
| Extraction texte (md, txt, pdf si `pypdf`) | branché | tests d'indexation |
| Extraction image (Pillow) | branché | descripteur déterministe testé |
| Extraction vidéo (ffprobe + ffmpeg) | branché | frames réelles, timestamps réels |
| Métadonnées de média par fichier compagnon | branché | tests `test_retrieval_sidecar.py` |
| Ingestion du corpus public NASA | branchée, désactivée par défaut | tests `test_ingest_nasa.py`, ingestion réelle effectuée |
| Timestamps et lien frame → vidéo | branché | test `test_frames_video_horodatees_et_rattachees` |
| Recherche documentaire (BM25) | branché | test `test_recherche_document` |
| Recherche d'images par description | branchée **via métadonnées** (embedder structurel) | test `test_recherche_image_par_description`, test `test_image_retrovable_par_son_titre_reel` |
| Recherche de vidéos par contenu | idem : métadonnées + transcription | test `test_recherche_video_par_contenu_et_segments` |
| Séquences horodatées | branché (échantillonnage uniforme des frames, déclaré comme tel) | `VideoHit.sampling` |
| Mesures numériques → graphiques | branché (points et unités réels) | test `test_recherche_mesures_numériques` |
| Indexation incrémentale | branché (SHA-256) | test `test_reindexation_incrementale` |
| Recherche sémantique texte↔image | **non branchée** : aucun modèle ONNX installé | `select_embedder` renvoie le descripteur structurel et le dit |

## 8. Limites assumées

1. **Pas de compréhension sémantique des images** tant qu'aucun modèle ONNX
   n'est fourni : l'appariement image se fait sur les métadonnées réelles
   (titre, description, chemin) et le résultat porte `matched_by:
   "metadata-lexical"`. Aucune image n'est renvoyée « parce que son nom
   ressemble à la question » sans que ses métadonnées le justifient.
2. **Pas de détection de phénomène physique** : les segments vidéo sont les
   frames extraites, avec leur timestamp ; le moteur ne prétend pas reconnaître
   une extinction ou une transition de régime.
3. **Pas de transcription automatique** : seules les transcriptions présentes
   (`.vtt`, `.srt`) sont indexées.
4. **Corpus absent du dépôt** : le moteur démarre sur un index vide et le dit
   (`status: "empty"`), au lieu de renvoyer des résultats d'illustration.
5. **RAG textuel** : le moteur ne le remplace pas ; il expose les modalités que
   le RAG ne couvre pas. La fusion des deux reste à faire quand le RAG sera
   branché.

## 9. Vérification de bout en bout

`npm run test:multimodal` (backend démarré avec `MULTIMODAL_CORPUS_DIRS`) :
session, indexation, requête mixte, service des fichiers, refus hors index,
question via `/chat`, persistance dans la conversation. Tous les points
passent, y compris sur un second passage (aucune réindexation).

## 10. Ingestion du corpus public NASA

`MULTIMODAL_NASA_ENABLED=0` par défaut : l'application n'émet aucune requête
réseau. La commande, elle, peut remplir le corpus :

```
python -m app.services.retrieval.ingest_nasa "combustion microgravity" --limit 3 --media image
python -m app.services.retrieval.ingest_nasa "combustion microgravity" --media video --limit 1
python -m app.services.retrieval.ingest_nasa "flame" --dry-run
```

Ce qui est écrit, et rien d'autre :

* le média (`~orig` si disponible, sinon `~large`), sans copie de l'original
  ailleurs que dans le corpus ;
* un fichier compagnon `<nom>.nasa.json` portant les métadonnées **réelles**
  (NASA ID, titre, description, date, centre, mots-clés) ;
* les frames extraites de la vidéo, dans `var/retrieval/frames`.

Le fichier compagnon est rattaché au média : son titre et sa description
deviennent ceux de la ressource, et il n'est **pas** indexé comme un document
distinct (sinon le même texte serait cherchable deux fois). Sans compagnon, un
média garde son nom de fichier pour titre et une description vide — c'est le
comportement voulu, rien n'est déduit du nom.

Garde-fous : HTTPS uniquement (les liens `http://` de l'API sont corrigés en
`https://`, jamais l'inverse), hôtes `nasa.gov` seulement, taille bornée par
`MULTIMODAL_MAX_FILE_BYTES`, fichier déjà présent jamais retéléchargé.

## 11. Mesures de performance (PHASE 9)

`python -m tools.retrieval_bench --repeat 2`, corpus réel de 111 Mo
(8 fichiers : 2 vidéos, 4 images, 1 CSV, 1 document), index temporaire pour ne
pas toucher à l'index de production.

| Mesure | Valeur |
|---|---|
| Indexation complète (extraction et encodage inclus) | 8,98 s |
| Contrôle incrémental (rien à refaire, 111 Mo hachés) | 0,66 s |
| Recherche — moyenne sur 6 questions | 20,0 ms |
| Recherche — question la plus lente | 27,3 ms |
| Embedder | `structural-v1` (211 dim., non cross-modal) |
| Erreurs d'extraction | 0 |

Lecture : le coût d'une indexation est dominé par l'extraction vidéo, pas par la
recherche ; une recherche interactive reste très en dessous de la centaine de
millisecondes sur ce corpus. L'empreinte SHA-256 du corpus entier (0,66 s pour
111 Mo) est le seul coût récurrent d'un contrôle incrémental.