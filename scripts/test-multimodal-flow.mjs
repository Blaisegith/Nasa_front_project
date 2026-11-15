/**
 * Vérification de bout en bout du moteur multimodal contre un serveur réel.
 *
 * Étapes : session, indexation du corpus, état de l'index, recherche
 * multimodale, puis question via `/chat` (la recherche doit être jointe au 501
 * et persistée dans la conversation). Les fichiers servis sont contrôlés.
 */

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8000/api/v1';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label} ${detail}`);
  }
};

async function main() {
  const email = `live-${Date.now()}@example.com`;

  const session = await fetch(`${BASE}/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, display_name: 'Live Retrieval' }),
  });
  check('session ouverte', session.status === 201, `HTTP ${session.status}`);
  const cookie = session.headers.getSetCookie?.().map((part) => part.split(';')[0]).join('; ') ?? '';

  const scan = await fetch(`${BASE}/retrieval/scan`, { method: 'POST', headers: { cookie } });
  const report = await scan.json();
  // Le corpus contient 5 fichiers, dont le .vtt (transcription) qui n'est pas
  // indexé comme document : il est rattaché à sa vidéo. Selon la fraîcheur de
  // l'index, les fichiers sont indexés ou déclarés inchangés.
  const processed = (report.indexed ?? 0) + (report.unchanged ?? 0);
  check('indexation du corpus', scan.status === 200 && processed >= 4, JSON.stringify(report).slice(0, 200));
  check('aucune erreur d’extraction', report.errors?.length === 0, JSON.stringify(report.errors));

  const again = await (await fetch(`${BASE}/retrieval/scan`, { method: 'POST', headers: { cookie } })).json();
  check('incrémental : rien de réindexé', again.indexed === 0, `indexed=${again.indexed}`);

  const status = await (await fetch(`${BASE}/retrieval/status`, { headers: { cookie } })).json();
  check('index peuplé', status.stats.frames > 0, JSON.stringify(status.stats));
  check('vidéo et images indexées', status.stats.videos >= 1 && status.stats.images >= 1);
  check('embedder déclaré', status.embedder.cross_modal === false);

  const search = await fetch(`${BASE}/retrieval/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      question: 'Montre-moi les images et les vidéos de la propagation de la flamme, et l’évolution de la température',
    }),
  });
  const payload = await search.json();
  const bundle = payload.retrieval;
  check('recherche multimodale', search.status === 200 && bundle.status === 'ok', bundle.status);
  check('documents trouvés', bundle.results.documents.length > 0);
  check('images trouvées', bundle.results.images.length > 0);
  check('vidéos trouvées', bundle.results.videos.length > 0);
  check('mesures trouvées', bundle.results.measurements.length > 0);

  const video = bundle.results.videos[0];
  check('segments horodatés', video.segments.length > 0, JSON.stringify(video.segments?.slice(0, 2)));
  check('timestamps dans la durée', video.segments.every((segment) => segment.start_s <= video.duration_s + 0.5));

  const answer = payload.answer;
  check('médias projetés dans la réponse', answer.media.length > 0);
  check('graphiques projetés', answer.charts.length > 0);
  check('aucune synthèse fabriquée', answer.summary === null);
  check('unités réelles', answer.charts.some((chart) => chart.y_unit));

  const chart = answer.charts[0];
  check('points réels du CSV', chart.series[0].points.length >= 5, `${chart.series[0].points.length} points`);

  const firstImage = bundle.results.images[0];
  const served = await fetch(`http://127.0.0.1:8000${firstImage.url}`, { headers: { cookie } });
  check('image réellement servie', served.status === 200, `HTTP ${served.status}`);

  const refused = await fetch(
    `http://127.0.0.1:8000/api/v1/retrieval/files?path=${encodeURIComponent('C:\\Windows\\win.ini')}`,
    { headers: { cookie } },
  );
  check('chemin hors index refusé', refused.status === 404, `HTTP ${refused.status}`);

  const chat = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ text: 'Montre-moi les vidéos de la combustion en microgravité et l’évolution de la température' }),
  });
  const chatBody = await chat.json();
  const detail = chatBody.error?.detail ?? {};
  check('chat : recherche jointe au 501', chat.status === 501 && detail.retrieval_status === 'ok', JSON.stringify(detail.retrieval_status));
  check('chat : question persistée', detail.question_persisted === true);
  check('chat : médias joints', detail.answer?.media?.length > 0);

  const conversation = await (await fetch(`${BASE}/conversations/${detail.conversation_id}`, { headers: { cookie } })).json();
  const roles = conversation.messages.map((message) => message.role);
  check('historique : question + résultats', roles.join(',') === 'user,assistant', roles.join(','));
  const assistant = conversation.messages[1];
  check('réponse marquée partielle', assistant.status === 'partial', assistant.status);
  check('médias dans l’historique', assistant.content.media?.length > 0);
  check('graphiques dans l’historique', assistant.content.charts?.length > 0);

  console.log('');
  console.log(failures ? `${failures} échec(s)` : 'chaîne multimodale validée de bout en bout');
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error('erreur:', error);
  process.exitCode = 1;
});