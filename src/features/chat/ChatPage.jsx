import { useEffect, useRef } from 'react';
import {
  ArrowUpRight, Check, Loader2, MessageSquarePlus, Sparkles, Trash2, TriangleAlert,
} from 'lucide-react';
import AnswerRenderer from '../../components/AnswerRenderer.jsx';
import QuestionComposer from '../../components/QuestionComposer.jsx';
import Logo from '../../components/Logo.jsx';
import { chatSuggestions } from '../../data/constants.js';
import { formatTime } from '../../lib/format.js';
import { useAuth } from '../../state/AuthProvider.jsx';
import { useConversations } from '../../state/ConversationProvider.jsx';
import { useI18n } from '../../i18n/I18nProvider.jsx';

function MessageRow({ message }) {
  const { t } = useI18n();
  const isUser = message.role === 'user';
  const content = message.content ?? {};
  const answer = content.schema_version ? content : null;

  return (
    <div className={`message-row ${message.role}`}>
      {!isUser && (
        <div className="message-avatar">
          <span className="message-logo"><Logo size="xs" /></span>
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
  const { t } = useI18n();

  if (!isAuthenticated) {
    return (
      <div className="chat-history chat-history-empty">
        <span>{t('chat.historyTitle')}</span>
        <p>{t('chat.historyText')}</p>
        <button className="button-secondary" onClick={onRequestSignIn}>{t('common.signIn')}</button>
      </div>
    );
  }

  return (
    <div className="chat-history">
      <button
        className={`chat-history-new ${activeId === null ? 'active' : ''}`}
        onClick={newConversation}
      >
        <MessageSquarePlus size={14} /> {t('chat.newConversation')}
      </button>
      <div className="chat-history-list">
        {conversations.length === 0 && <span className="chat-history-hint">{t('chat.historyHint')}</span>}
        {conversations.slice(0, 12).map((conversation) => (
          <span
            key={conversation.id}
            className={`chat-history-chip ${activeId === conversation.id ? 'active' : ''}`}
          >
            <button
              type="button"
              onClick={() => openConversation(conversation.id)}
              title={conversation.preview ?? conversation.title}
            >
              {conversation.title || t('common.new')}
            </button>
            <button
              type="button"
              className="chat-history-delete"
              aria-label={t('chat.deleteConversation')}
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
  const { t, locale } = useI18n();
  const streamRef = useRef(null);

  useEffect(() => {
    const node = streamRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, isSending]);

  const submit = async (text, attachments = []) => {
    if (!text) return;
    setDraft('');
    await ask(text, attachments);
  };

  const suggestions = chatSuggestions[locale] ?? chatSuggestions.fr;

  return (
    <section className="chat-workspace">
      <ConversationStrip onRequestSignIn={onRequestSignIn} />

      {notice && (
        <div className="chat-notice" role="status">
          <TriangleAlert size={15} />
          <span>{notice}</span>
          <button type="button" aria-label={t('chat.hide')} onClick={clearNotice}>×</button>
        </div>
      )}

      {error && (
        <div className="chat-notice chat-notice-error" role="alert">
          <TriangleAlert size={15} />
          <span>{error}</span>
          <button type="button" aria-label={t('chat.hide')} onClick={clearError}>×</button>
        </div>
      )}

      <div
        className={`chat-stream ${messages.length === 0 ? 'is-empty' : ''}`}
        aria-live="polite"
        aria-busy={isSending || isLoadingMessages}
        ref={streamRef}
      >
        {isLoadingMessages && messages.length === 0 && (
          <div className="chat-loading">
            <Loader2 size={18} className="spin" /> {t('chat.loadingConversation')}
          </div>
        )}

        {messages.length === 0 && !isLoadingMessages && (
          <div className="chat-welcome">
            <span className="chat-welcome-mark"><Sparkles size={19} /></span>
            <h1>{t('chat.welcomeTitle')}</h1>
            <p>{t('chat.welcomeText')}</p>
          </div>
        )}

        {messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}

        {isSending && (
          <div className="message-row assistant">
            <div className="message-avatar">
              <span className="message-logo"><Logo size="xs" /></span>
            </div>
            <div className="message-content">
              <div className="message-bubble chat-typing">
                <Loader2 size={14} className="spin" /> {t('chat.typing')}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-dock">
        {messages.length === 0 && (
          <div className="chat-suggestions">
            {suggestions.map((question) => (
              <button
                type="button"
                key={question}
                onClick={() => {
                  setDraft(question);
                  document.querySelector('.composer-input')?.focus();
                }}
              >
                {question}
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
        )}
        <QuestionComposer
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          isSending={isSending}
          compact
          placeholder={t('chat.placeholder')}
          ariaLabel={t('chat.placeholder')}
          hint={t('chat.disclaimer')}
        />
      </div>
    </section>
  );
}