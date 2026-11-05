import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { CustomerChat } from '@ventascatalogo/contracts';
import { tryApiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { CustomerChatPanel } from '@/components/store/customer-chat';

export const metadata: Metadata = {
  title: 'Chat con el negocio',
};

export const dynamic = 'force-dynamic';

export default async function CustomerChatPage() {
  const user = await getSession();
  if (!user || user.audience !== 'customer') redirect('/mi-cuenta/entrar?next=/mi-cuenta/chat');

  const chat = await tryApiFetch<CustomerChat>('/me/chat');

  return (
    <section className="stack" style={{ gap: '1rem' }}>
      <span className="eyebrow">Portal · chat</span>
      <h1 className="portal__title display">
        Hablar con <em>el negocio</em>.
      </h1>
      <p className="portal__lead">
        Las respuestas quedan en tu cuenta y el equipo las ve en su bandeja. Podés escribir en
        cualquier momento.
      </p>
      {chat ? (
        <CustomerChatPanel initial={chat} />
      ) : (
        <div className="alert">
          No pudimos abrir la conversación. Verificá tu conexión o intentá de nuevo más tarde.
        </div>
      )}
      <Link className="btn btn--ghost" href="/mi-cuenta">
        ← Volver a mi cuenta
      </Link>
    </section>
  );
}
