/**
 * Vérification de bout en bout du parcours « question depuis l'Accueil ».
 *
 * 1. ouvre une session ;
 * 2. téléverse une pièce jointe ;
 * 3. pose une question avec cette pièce jointe ;
 * 4. vérifie que la question est persistée même quand la génération n'est pas
 *    branchée (501), et qu'aucune réponse n'est fabriquée ;
 * 5. relit la conversation : la question, ses pièces jointes et l'absence de
 *    réponse doivent être visibles.
 *
 * C'est le contrat que le tableau de bord de l'Accueil exploite.
 */

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8000';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label} ${detail}`);
  }
};

async function main() {
  const email = `dashboard-${Date.now()}@example.com`;

  const session = await fetch(`${BASE}/api/v1/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, display_name: 'Test Dashboard' }),
  });
  check('session ouverte', session.status === 201, `HTTP ${session.status}`);
  const cookie = session.headers.getSetCookie?.().map((part) => part.split(';')[0]).join('; ') ?? '';
  check('cookie de session reçu', cookie.length > 0);

  // Pièce jointe réelle : un PDF minimal.
  const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])], { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', pdf, 'mesures.pdf');
  const upload = await fetch(`${BASE}/api/v1/chat/attachments`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  const uploaded = await upload.json();
  check('pièce jointe téléversée', upload.status === 201, `HTTP ${upload.status}`);

  const question = 'Analyse la propagation de la flamme en microgravité.';
  const chat = await fetch(`${BASE}/api/v1/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ text: question, attachments: [{ attachment_id: uploaded.attachment_id }] }),
  });
  const chatBody = await chat.json();
  check('génération non branchée → 501', chat.status === 501, `HTTP ${chat.status}`);

  const detail = chatBody.error?.detail ?? {};
  check('question persistée', detail.question_persisted === true);
  check('pièce jointe rattachée', detail.attachments_persisted?.[0] === uploaded.attachment_id);
  check('aucune réponse fabriquée', chatBody.error?.message && !chatBody.answer);

  const conversationId = detail.conversation_id;
  check('identifiant de conversation rendu', Boolean(conversationId));

  const conversation = await fetch(`${BASE}/api/v1/conversations/${conversationId}`, { headers: { cookie } });
  const payload = await conversation.json();
  check('conversation relue', conversation.status === 200, `HTTP ${conversation.status}`);

  const userMessage = payload.messages?.find((message) => message.role === 'user');
  check('question enregistrée', userMessage?.content?.text === question);
  check('pièce jointe visible dans l’historique', userMessage?.content?.attachments?.[0]?.attachment_id === uploaded.attachment_id);

  // Un corpus indexé produit une réponse « de preuve » : médias et graphiques
  // réels, aucune synthèse. Un corpus vide ne produit aucun message assistant.
  // Les deux cas sont corrects ; ce qui ne l'est jamais, c'est une prose inventée.
  const assistantMessage = payload.messages?.find((message) => message.role === 'assistant');
  const hasProse = (content) => Boolean(content?.text) || Boolean(content?.summary) || Boolean(content?.scientific_explanation);
  check(
    'aucun message assistant inventé',
    !assistantMessage || (assistantMessage.status === 'partial' && !hasProse(assistantMessage.content)),
    assistantMessage ? `statut ${assistantMessage.status}` : 'aucun message assistant (corpus vide)',
  );
  if (assistantMessage) {
    check(
      'réponse de preuve : médias réels joints',
      Array.isArray(assistantMessage.content?.media) && assistantMessage.content.media.length > 0,
    );
  }

  // Le même échange doit rester lisible depuis le Chat : c'est la même API.
  const list = await fetch(`${BASE}/api/v1/conversations?limit=5`, { headers: { cookie } });
  const listed = await list.json();
  check('échange listé dans l’historique', listed.items?.some((item) => item.id === conversationId));

  // Fermeture de session : le tableau de bord retombe en mode invité.
  const out = await fetch(`${BASE}/api/v1/auth/session`, { method: 'DELETE', headers: { cookie } });
  check('déconnexion', out.status === 204, `HTTP ${out.status}`);

  console.log('');
  console.log(failures ? `${failures} échec(s)` : 'parcours complet validé');
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error('erreur:', error);
  process.exitCode = 1;
});