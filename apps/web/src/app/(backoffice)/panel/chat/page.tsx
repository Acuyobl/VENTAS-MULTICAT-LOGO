import type { Metadata } from 'next';
import type { ConversationListResponse } from '@ventascatalogo/contracts';
import { tryApiFetch } from '@/lib/api';
import { ChatPanel } from '@/components/backoffice/chat-panel';

export const metadata: Metadata = {
  title: 'Chat',
};

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const conversations = await tryApiFetch<ConversationListResponse>('/chat/conversations');

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Atención · chat</span>
          <h1 className="display">
            Conversar para <em>vender</em>.
          </h1>
          <p>
            Las consultas de la tienda y de WhatsApp llegan acá. Respondé desde el backoffice; el
            historial queda asociado al cliente y al pedido.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{conversations?.items.length ?? 0}</strong>
          <span>conversaciones activas</span>
        </div>
      </header>

      <ChatPanel initialConversations={conversations?.items ?? []} />
    </div>
  );
}
