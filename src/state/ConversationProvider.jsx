import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { endpoints, SERVICE_UNAVAILABLE_MESSAGE, isServiceUnavailable } from '../lib/endpoints.js';
import { offlineReply } from '../data/constants.js';
import { useAuth } from './AuthProvider.jsx';

const ConversationContext = createContext(null);

const OFFLINE_NOTICE =
  'Mode hors ligne : vos échanges ne sont pas enregistrés. Connectez-vous pour retrouver votre historique sur tous vos appareils.';

function localMessage(role, text) {
  return {
    id: `local-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    content: { text },
    created_at: new Date().toISOString(),
    local: true,
  };
}

/**
 * Source de vérité conversationnelle **unique**.
 *
 * L'Accueil (question rapide) et le Chat lisent et écrivent dans ce même store :
 * une question posée depuis l'un est visible dans l'autre, après rechargement,
 * parce que l'historique est persisté côté serveur.
 */
export function ConversationProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
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

  const ask = useCallback(
    async (rawText) => {
      const text = String(rawText ?? '').trim();
      if (!text || isSending) return null;

      // --- Mode non authentifié : réponse locale de démonstration -----------
      if (!isAuthenticated) {
        const userMessage = localMessage('user', text);
        const replyMessage = localMessage('assistant', offlineReply(text));
        setMessages((current) => [...current, userMessage, replyMessage]);
        setNotice(OFFLINE_NOTICE);
        return { offline: true };
      }

      setNotice('');
      setError('');
      setIsSending(true);

      const pending = { ...localMessage('user', text), id: `pending-${Date.now()}`, pending: true };
      setMessages((current) => [...current, pending]);

      try {
        const response = await endpoints.chat({ conversation_id: activeId, text });
        const conversationId = response.conversation_id ?? activeId;
        if (conversationId) {
          const payload = await endpoints.getConversation(conversationId);
          setActiveId(payload.id);
          setMessages(payload.messages ?? []);
        }
        await refreshConversations();
        return { offline: false };
      } catch (caught) {
        if (isServiceUnavailable(caught)) {
          const conversationId = caught.detail?.conversation_id;
          setNotice(SERVICE_UNAVAILABLE_MESSAGE);
          if (conversationId) {
            const payload = await endpoints.getConversation(conversationId);
            setActiveId(payload.id);
            setMessages(payload.messages ?? []);
          }
          await refreshConversations();
          return { offline: false, unavailable: true };
        }

        setMessages((current) => current.filter((message) => message.id !== pending.id));
        setError(caught.message);
        return { offline: false, error: caught.message };
      } finally {
        setIsSending(false);
      }
    },
    [activeId, isAuthenticated, isSending, refreshConversations],
  );

  const value = useMemo(
    () => ({
      conversations,
      activeId,
      messages,
      isLoadingMessages,
      isSending,
      notice,
      error,
      ask,
      openConversation,
      newConversation,
      deleteConversation,
      refreshConversations,
      clearError: () => setError(''),
      clearNotice: () => setNotice(''),
    }),
    [
      conversations,
      activeId,
      messages,
      isLoadingMessages,
      isSending,
      notice,
      error,
      ask,
      openConversation,
      newConversation,
      deleteConversation,
      refreshConversations,
    ],
  );

  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

export function useConversations() {
  const context = useContext(ConversationContext);
  if (!context) throw new Error('useConversations doit être utilisé dans <ConversationProvider>.');
  return context;
}