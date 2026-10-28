import { Injectable } from '@nestjs/common';
import type { CustomerCreateInput, CustomerSummary } from '@ventascatalogo/contracts';
import type { Customer } from '@prisma/client';
import { CustomersRepository, type CustomerListQuery } from './customers.repository';

/** El contrato lo define como enum; `Customer` no tiene columna propia todavía. */
export type CustomerType = 'PERSON' | 'COMPANY';

/**
 * `Customer` no tiene columna `type` y la tarea prohíbe migraciones nuevas. Para
 * no perder el dato entre POST y GET se guarda en `notes` como sobre JSON; cuando
 * exista la columna (deuda de migración) esta capa se reemplaza por el campo real.
 */
interface CustomerNotesEnvelope {
  t: CustomerType;
  n: string | null;
}

function encodeCustomerNotes(type: CustomerType, notes: string | undefined): string | null {
  if (!notes && type === 'PERSON') return null;
  const envelope: CustomerNotesEnvelope = { t: type, n: notes ?? null };
  return JSON.stringify(envelope);
}

export function decodeCustomerType(notes: string | null): CustomerType {
  if (!notes) return 'PERSON';
  try {
    const parsed = JSON.parse(notes) as Partial<CustomerNotesEnvelope>;
    return parsed.t === 'COMPANY' ? 'COMPANY' : 'PERSON';
  } catch {
    return 'PERSON';
  }
}

export function toCustomerSummary(customer: Customer): CustomerSummary {
  return {
    id: customer.id,
    type: decodeCustomerType(customer.notes),
    fullName: customer.name,
    phone: customer.phone,
    email: customer.email,
    idNumber: customer.taxId,
    createdAt: customer.createdAt.toISOString(),
  };
}

@Injectable()
export class CustomersService {
  constructor(private readonly repo: CustomersRepository) {}

  async list(
    organizationId: string,
    query: CustomerListQuery,
  ): Promise<{ items: CustomerSummary[]; nextCursor: string | null }> {
    const page = await this.repo.list(organizationId, query);
    return {
      items: page.items.map(toCustomerSummary),
      nextCursor: page.nextCursor,
    };
  }

  async create(organizationId: string, input: CustomerCreateInput): Promise<CustomerSummary> {
    const customer = await this.repo.create(
      organizationId,
      input,
      encodeCustomerNotes(input.type, input.notes),
    );
    return toCustomerSummary(customer);
  }
}
