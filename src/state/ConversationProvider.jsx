import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { endpoints, isServiceUnavailable } from '../lib/endpoints.js';
import { offlineReply } from '../data/constants.js';
import { useAuth } from './AuthProvider.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

const ConversationContext = createContext(null);

function localMessage(role, text, extra = {}) {
  return {
    id: `local-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    content: { text, ...extra },
    created_at: new Date().toISOString(),
    local: true,
  };
}

/**
 * Source de vérité conversationnelle **unique**.
 *
 * L'Accueil et le Chat lisent et écrivent dans ce même store : une question
 * posée depuis l'Accueil est persistée côté serveur et se retrouve donc dans le
 * Chat après rechargement. Aucun second historique n'existe.
 */
export function ConversationProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { t, locale } = useI18n();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const refreshConversations = useCallback(async () => {
    if (!isAuthenticated) {
      setConversations([]);
      return;
    }
    try {
      const payload = await endpoints.listConversations();
      setConversations(payload.items ?? []);
    } catch {
      /* la liste reste vide : l'interface ne bloque pas */
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshConversations();
    } else {
      setConversations([]);
      setActiveId(null);
      setMessages([]);
      setNotice('');
      setError('');
      setPhase('idle');
    }
  }, [isAuthenticated, refreshConversations]);

  const openConversation = useCallback(
    async (conversationId) => {
      if (!isAuthenticated) return;
      setIsLoadingMessages(true);
      setError('');
      try {
        const payload = await endpoints.getConversation(conversationId);
        setActiveId(payload.id);
        setMessages(payload.messages ?? []);
        setPhase('idle');
      } catch (caught) {
        setError(caught.message);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [isAuthenticated],
  );

  const newConversation = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setNotice('');
    setError('');
    setPhase('idle');
  }, []);

  const deleteConversation = useCallback(
    async (conversationId) => {
      try {
        await endpoints.deleteConversation(conversationId);
        if (activeId === conversationId) newConversation();
        await refreshConversations();
        return true;
      } catch (caught) {
        setError(caught.message);
        return false;
      }
    },
    [activeId, newConversation, refreshConversations],
  );

  const loadConversation = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      const payload = await endpoints.getConversation(conversationId);
      setActiveId(payload.id);
      setMessages(payload.messages ?? []);
    } catch {
      /* l'historique détaillé est indisponible : on garde l'état courant */
    }
  }, []);

  /**
   * Envoie une question.
   *
   * L'Accueil comme le Chat appellent cette fonction : la question est
   * enregistrée par le backend avant toute génération, ce qui garantit qu'elle
   * apparaît dans les deux vues, même si le service de génération n'est pas
   * branché.
   *
   * @returns {object|null} `{ offline, unavailable, component, conversation_id, error }`
   */
  const ask = useCallback(
    async (rawText, attachments = []) => {
      const text = String(rawText ?? '').trim();
      if (!text || isSending) return null;

      const files = (attachments ?? []).map((item) => ({
        attachment_id: item.attachment_id,
        filename: item.filename,
        media_type: item.media_type,
        size_bytes: item.size_bytes,
        url: item.url,
      }));

      // --- Mode non authentifié : réponse locale de démonstration -----------
      if (!isAuthenticated) {
        const userMessage = localMessage('user', text, files.length ? { attachments: files } : {});
        const replyMessage = localMessage('assistant', offlineReply(text, locale));
        setMessages((current) => [...current, userMessage, replyMessage]);
        setNotice(t('answer.offline'));
        setPhase('idle');
        return { offline: true, conversation_id: null };
      }

      setNotice('');
      setError('');
      setIsSending(true);
      setPhase('sending');

      const pending = {
        ...localMessage('user', text, files.length ? { attachments: files } : {}),
        id: `pending-${Date.now()}`,
        pending: true,
      };
      setMessages((current) => [...current, pending]);

      try {
        setPhase('waiting');
        const response = await endpoints.chat({
          conversation_id: activeId,
          text,
          attachments: files.map((item) => ({ attachment_id: item.attachment_id })),
        });

        const conversationId = response.conversation_id ?? activeId;
        if (conversationId) await loadConversation(conversationId);
        await refreshConversations();
        setPhase('done');
        return { offline: false, conversation_id: conversationId, answer: response.answer ?? null };
      } catch (caught) {
        if (isServiceUnavailable(caught)) {
          // La question est enregistrée : on recharge la conversation pour
          // afficher l'échange réel, sans fabriquer de réponse.
          const conversationId = caught.detail?.conversation_id ?? null;
          const detail = caught.detail ?? {};
          // Le backend joint les résultats de recherche réels au 501 : s'il y en
          // a, on l'annonce, sinon on signale seulement l'absence de génération.
          const retrieval = detail.retrieval ?? null;
          const hasEvidence = Boolean(
            retrieval
              && (retrieval.results?.images?.length
                || retrieval.results?.videos?.length
                || retrieval.results?.documents?.length
                || retrieval.results?.measurements?.length),
          );
          setNotice(hasEvidence ? t('answer.evidenceOnly') : t('answer.serviceUnavailable'));
          setPhase('unavailable');
          if (conversationId) await loadConversation(conversationId);
          await refreshConversations();
          return {
            offline: false,
            unavailable: true,
            component: detail.component ?? 'generation',
            conversation_id: conversationId,
            question_persisted: Boolean(detail.question_persisted),
            retrieval,
            has_evidence: hasEvidence,
          };
        }

        setMessages((current) => current.filter((message) => message.id !== pending.id));
        setError(caught.message);
        setPhase('error');
        return { offline: false, error: caught.message };
      } finally {
        setIsSending(false);
      }
    },
    [activeId, isAuthenticated, isSending, loadConversation, refreshConversations, locale, t],
  );

  const resetPhase = useCallback(() => setPhase('idle'), []);

  const value = useMemo(
    () => ({
      conversations,
      activeId,
      messages,
      isLoadingMessages,
      isSending,
      phase,
      notice,
      error,
      ask,
      openConversation,
      newConversation,
      deleteConversation,
      refreshConversations,
      resetPhase,
      clearError: () => setError(''),
      clearNotice: () => setNotice(''),
    }),
    [
      conversations,
      activeId,
      messages,
      isLoadingMessages,
      isSending,
      phase,
      notice,
      error,
      ask,
      openConversation,
      newConversation,
      deleteConversation,
      refreshConversations,
      resetPhase,
    ],
  );

  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

export function useConversations() {
  const context = useContext(ConversationContext);
  if (!context) throw new Error('useConversations doit être utilisé dans <ConversationProvider>.');
  return context;
}