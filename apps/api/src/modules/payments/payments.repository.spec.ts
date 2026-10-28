import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import { PaymentsRepository } from './payments.repository';

function repositoryWithCreate(create: ReturnType<typeof vi.fn>): PaymentsRepository {
  const prisma = { paymentWebhookEvent: { create } } as unknown as PrismaService;
  return new PaymentsRepository(prisma);
}

const eventInput = {
  provider: 'STRIPE' as const,
  externalEventId: 'evt_1',
  eventType: 'checkout.session.completed',
  payload: { id: 'evt_1' },
  signatureValid: true,
};

describe('PaymentsRepository · idempotencia de webhook', () => {
  it('devuelve null cuando el evento ya existía (unique provider+externalEventId)', async () => {
    const create = vi.fn().mockRejectedValue({ code: 'P2002' });
    const repo = repositoryWithCreate(create);

    await expect(repo.createWebhookEvent(eventInput)).resolves.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('propaga errores que no son de unicidad', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const repo = repositoryWithCreate(create);

    await expect(repo.createWebhookEvent(eventInput)).rejects.toThrow('db down');
  });

  it('crea el evento la primera vez', async () => {
    const created = { id: 'event-row-1' };
    const create = vi.fn().mockResolvedValue(created);
    const repo = repositoryWithCreate(create);

    await expect(repo.createWebhookEvent(eventInput)).resolves.toBe(created);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'STRIPE',
          externalEventId: 'evt_1',
          signatureValid: true,
        }),
      }),
    );
  });
});
