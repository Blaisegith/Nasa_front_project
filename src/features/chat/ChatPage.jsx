import { useEffect, useRef } from 'react';
import {
  ArrowUpRight, Check, Loader2, MessageSquarePlus, Paperclip, Send, Sparkles, Trash2, TriangleAlert,
} from 'lucide-react';
import AnswerRenderer from '../../components/AnswerRenderer.jsx';
import { chatSuggestions } from '../../data/constants.js';
import { formatTime } from '../../lib/format.js';
import { useAuth } from '../../state/AuthProvider.jsx';
import { useConversations } from '../../state/ConversationProvider.jsx';

function MessageRow({ message }) {
  const isUser = message.role === 'user';
  const content = message.content ?? {};
  const answer = content.schema_version ? content : null;

  return (
    <div className={`message-row ${message.role}`}>
      {!isUser && (
        <div className="message-avatar">
          <span className="nasa-mark nasa-mark-mini"><span>NASA</span><i /></span>
        </div>
      )}
      <div className="message-content">
        {isUser || !answer ? (
          <div className="message-bubble">{content.text ?? ''}</div>
        ) : (
          <div className="message-bubble message-bubble-answer">
            <AnswerRenderer answer={answer} />
          </div>
        )}
        <span className="message-time">
          {formatTime(message.created_at)}
          {isUser && !message.pending && <Check size={12} />}
          {message.pending && <Loader2 size={12} className="spin" />}
        </span>
      </div>
    </div>
  );
}

function ConversationStrip({ onRequestSignIn }) {
  const {
    conversations, activeId, openConversation, newConversation, deleteConversation,
  } = useConversations();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="chat-history chat-history-empty">
        <span>Historique partagé</span>
        <p>Connectez-vous pour retrouver vos conversations sur tous vos appareils.</p>
        <button className="button-secondary" onClick={onRequestSignIn}>Se connecter</button>
      </div>
    );
  }

  return (
    <div className="chat-history">
      <button
        className={`chat-history-new ${activeId === null ? 'active' : ''}`}
        onClick={newConversation}
      >
        <MessageSquarePlus size={14} /> Nouvelle
      </button>
      <div className="chat-history-list">
        {conversations.length === 0 && <span className="chat-history-hint">Aucune conversation enregistrée.</span>}
        {conversations.slice(0, 12).map((conversation) => (
          <span
            key={conversation.id}
            className={`chat-history-chip ${activeId === conversation.id ? 'active' : ''}`}
          >
            <button onClick={() => openConversation(conversation.id)} title={conversation.preview ?? conversation.title}>
              {conversation.title || 'Sans titre'}
            </button>
            <button
              className="chat-history-delete"
              aria-label="Supprimer la conversation"
              onClick={() => deleteConversation(conversation.id)}
            >
              <Trash2 size={12} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ChatPage({ draft, setDraft, onRequestSignIn }) {
  const {
    messages, ask, isSending, isLoadingMessages, notice, error, clearError, clearNotice,
  } = useConversations();
  const streamRef = useRef(null);

  useEffect(() => {
    const node = streamRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, isSending]);

  const submit = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await ask(text);
  };

  return (
    <section className="chat-workspace">
      <ConversationStrip onRequestSignIn={onRequestSignIn} />

      {notice && (
        <div className="chat-notice" role="status">
          <TriangleAlert size={15} />
          <span>{notice}</span>
          <button aria-label="Masquer" onClick={clearNotice}>×</button>
        </div>
      )}

      {error && (
        <div className="chat-notice chat-notice-error" role="alert">
          <TriangleAlert size={15} />
          <span>{error}</span>
          <button aria-label="Masquer" onClick={clearError}>×</button>
        </div>
      )}

      <div
        className={`chat-stream ${messages.length === 0 ? 'is-empty' : ''}`}
        aria-live="polite"
        aria-busy={isSending || isLoadingMessages}
        ref={streamRef}
      >
        {isLoadingMessages && messages.length === 0 && (
          <div className="chat-loading"><Loader2 size={18} className="spin" /> Chargement de la conversation…</div>
        )}

        {messages.length === 0 && !isLoadingMessages && (
          <div className="chat-welcome">
            <span className="chat-welcome-mark"><Sparkles size={19} /></span>
            <h1>Que souhaitez-vous explorer ?</h1>
            <p>Posez une question sur le feu en microgravité.</p>
          </div>
        )}

        {messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}

        {isSending && (
          <div className="message-row assistant">
            <div className="message-avatar">
              <span className="nasa-mark nasa-mark-mini"><span>NASA</span><i /></span>
            </div>
            <div className="message-content">
              <div className="message-bubble chat-typing">
                <Loader2 size={14} className="spin" /> Analyse de votre question…
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-dock">
        {messages.length === 0 && (
          <div className="chat-suggestions">
            {chatSuggestions.map((question) => (
              <button
                key={question}
                onClick={() => {
                  setDraft(question);
                  document.querySelector('.chat-input')?.focus();
                }}
              >
                {question}<ArrowUpRight size={13} />
              </button>
            ))}
          </div>
        )}
        <form className="chat-composer" onSubmit={submit}>
          <button className="icon-button attach-button" type="button" aria-label="Joindre un document (bientôt disponible)">
            <Paperclip size={18} />
          </button>
          <textarea
            className="chat-input"
            rows="1"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Posez une question"
            aria-label="Votre question"
          />
          <button className="send-button" type="submit" aria-label="Envoyer" disabled={isSending}>
            <Send size={16} />
          </button>
        </form>
        <div className="chat-disclaimer">
          Les réponses peuvent contenir des erreurs. Vérifiez les informations importantes.
        </div>
      </div>
    </section>
  );
}