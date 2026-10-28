import { Injectable } from '@nestjs/common';
import type { CustomerCreateInput, CustomerSummary } from '@ventascatalogo/contracts';
import type { Customer } from '@prisma/client';
import { CustomersRepository, type CustomerListQuery } from './customers.repository';

export function toCustomerSummary(customer: Customer): CustomerSummary {
  return {
    id: customer.id,
    type: customer.type,
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
    const customer = await this.repo.create(organizationId, input);
    return toCustomerSummary(customer);
  }
}
