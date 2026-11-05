import type { Metadata } from 'next';
import type { ConversationListResponse } from '@ventascatalogo/contracts';
import { tryApiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { ChatPanel } from '@/components/backoffice/chat-panel';
import { WhatsappConnectPanel } from '@/components/backoffice/whatsapp-connect-panel';

export const metadata: Metadata = {
  title: 'Chat',
};

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const [conversations, session] = await Promise.all([
    tryApiFetch<ConversationListResponse>('/chat/conversations'),
    getSession(),
  ]);
  const canWrite = session?.permissions.includes('catalog:write') ?? false;

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Atención · chat</span>
          <h1 className="display">
            Conversar para <em>vender</em>.
          </h1>
          <p>
            Las consultas de la tienda y de WhatsApp llegan acá. Respondé desde el backoffice; si el
            cliente manda un archivo, podés descargarlo o importarlo directo a su catálogo.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{conversations?.items.length ?? 0}</strong>
          <span>conversaciones activas</span>
        </div>
      </header>

      <div style={{ marginBottom: '1.25rem' }}>
        <WhatsappConnectPanel canManage={canWrite} />
      </div>

      <ChatPanel
        initialConversations={conversations?.items ?? []}
        canWrite={canWrite}
      />
    </div>
  );
}
