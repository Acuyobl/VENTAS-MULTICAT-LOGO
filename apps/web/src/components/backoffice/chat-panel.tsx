'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
  ChatMessageListResponse,
  ConversationSummary,
} from '@ventascatalogo/contracts';

interface ChatPanelProps {
  initialConversations: ConversationSummary[];
}

export function ChatPanel({ initialConversations }: ChatPanelProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/chat/conversations', {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { items: ConversationSummary[] };
      setConversations(payload.items);
      setSelectedId((current) => current ?? payload.items[0]?.id ?? null);
    } catch {
      // silencioso: la lista previa sigue en pantalla
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/chat/conversations/${conversationId}/messages`,
        { headers: { accept: 'application/json' } },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'No pudimos cargar la conversación.');
      }
      const payload = (await response.json()) as ChatMessageListResponse;
      setMessages(payload.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setInterval(() => {
      void loadMessages(selectedId);
      void loadConversations();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [selectedId, loadMessages, loadConversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send() {
    if (!selectedId || draft.trim().length === 0) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/chat/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'No pudimos enviar el mensaje.');
      }
      const created = (await response.json()) as ChatMessage;
      setMessages((current) => [...current, created]);
      setDraft('');
      void loadConversations();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setSending(false);
    }
  }

  if (conversations.length === 0) {
    return (
      <div className="empty">
        <span className="empty__mark">∅</span>
        <h3>Sin conversaciones</h3>
        <p>
          Cuando un cliente escriba desde la tienda o por WhatsApp, la conversación aparece acá.
        </p>
      </div>
    );
  }

  return (
    <div className="chat-layout">
      <aside className="chat-list">
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            className="chat-list__item"
            data-active={conversation.id === selectedId}
            onClick={() => setSelectedId(conversation.id)}
          >
            <strong>{conversation.customerName ?? 'Cliente'}</strong>
            <span className="mono faint">
              {conversation.lastMessagePreview ?? conversation.subject ?? 'Sin mensajes'}
            </span>
            <span className="chat-list__meta">
              {conversation.status}
              {conversation.unreadCount > 0 ? ` · ${conversation.unreadCount} sin leer` : ''}
            </span>
          </button>
        ))}
      </aside>

      <section className="chat-thread">
        <div className="chat-thread__head">
          <h2>
            {conversations.find((item) => item.id === selectedId)?.customerName ?? 'Conversación'}
          </h2>
          <span className="mono faint">
            {loading ? 'Cargando…' : `${messages.length} mensajes`}
          </span>
        </div>

        <div className="chat-thread__messages">
          {messages.map((message) => (
            <article key={message.id} className="chat-bubble" data-own={message.senderType === 'STAFF'}>
              <span className="chat-bubble__meta">
                {message.senderName ?? message.senderType} ·{' '}
                {message.createdAt.slice(11, 16)}
              </span>
              <p>{message.body}</p>
            </article>
          ))}
          {messages.length === 0 && !loading ? (
            <p className="mono faint">Todavía no hay mensajes.</p>
          ) : null}
          <div ref={endRef} />
        </div>

        <form
          className="chat-compose"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            className="input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escribí una respuesta…"
            maxLength={2000}
          />
          <button className="btn" type="submit" disabled={sending || draft.trim().length === 0}>
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
        {error ? <div className="alert">{error}</div> : null}
      </section>
    </div>
  );
}
