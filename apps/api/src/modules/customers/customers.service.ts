import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { CustomersRepository } from './customers.repository';
import { normalizeLimit, normalizePage } from '../../common/utils/pagination';

export interface FindAllCustomersQuery {
  page?: number;
  limit?: number;
  search?: string;
  tag?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

type FindPageCustomersQuery = FindAllCustomersQuery;

@Injectable()
export class CustomersService {
  constructor(private readonly repository: CustomersRepository) {}

  async create(dto: CreateCustomerDto, createdById: string) {
    const duplicate = await this.repository.findByDuplicates(dto.phone, dto.email);
    if (duplicate) {
      throw new ConflictException(
        `Existing customer found with this phone (id=${duplicate.id})`,
      );
    }
    return this.repository.create(dto, createdById);
  }

  async findAll(query: FindPageCustomersQuery) {
    const page = normalizePage(query.page);
    const limit = normalizeLimit(query.limit);
    const { total, items } = await this.repository.findAll({
      page,
      limit,
      search: query.search,
      tag: query.tag,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    const customer = await this.repository.findById(id);
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findById(id);
    return this.repository.update(id, dto);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.repository.softDelete(id);
  }
}