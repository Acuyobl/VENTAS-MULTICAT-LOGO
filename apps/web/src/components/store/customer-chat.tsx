'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, CustomerChat } from '@ventascatalogo/contracts';

interface CustomerChatPanelProps {
  initial: CustomerChat;
}

export function CustomerChatPanel({ initial }: CustomerChatPanelProps) {
  const [items, setItems] = useState<ChatMessage[]>(initial.items);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/me/chat', { headers: { accept: 'application/json' } });
      if (!response.ok) return;
      const payload = (await response.json()) as CustomerChat;
      setItems(payload.items);
    } catch {
      // sin conexión: se mantiene el historial en pantalla
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items.length]);

  async function send() {
    if (draft.trim().length === 0) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/me/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'No pudimos enviar el mensaje.');
      }
      const created = (await response.json()) as ChatMessage;
      setItems((current) => [...current, created]);
      setDraft('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-thread" style={{ maxWidth: '42rem' }}>
      <div className="chat-thread__head">
        <h2>Conversación con el negocio</h2>
        <span className="mono faint">
          {initial.channel === 'WHATSAPP' ? 'WhatsApp' : 'Portal'} · {items.length} mensajes
        </span>
      </div>
      <div className="chat-thread__messages">
        {items.map((message) => (
          <article key={message.id} className="chat-bubble" data-own={message.senderType === 'CUSTOMER'}>
            <span className="chat-bubble__meta">
              {message.senderName ?? (message.senderType === 'STAFF' ? 'Negocio' : 'Vos')} ·{' '}
              {message.createdAt.slice(11, 16)}
            </span>
            <p>{message.body}</p>
          </article>
        ))}
        {items.length === 0 ? (
          <p className="mono faint">
            Escribinos: contanos qué producto te interesa y te respondemos por acá.
          </p>
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
          placeholder="Escribí tu mensaje…"
          maxLength={2000}
        />
        <button className="btn" type="submit" disabled={sending || draft.trim().length === 0}>
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
      {error ? <div className="alert">{error}</div> : null}
    </div>
  );
}
