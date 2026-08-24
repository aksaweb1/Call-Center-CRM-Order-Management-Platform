import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { normalizeLimit, normalizePage } from '../../common/utils/pagination';
import {
  CreateCategoryDto,
  CreateProductDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateStockDto,
} from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Categories ────────────────────────────────────────────────
  listCategories() {
    return this.prisma.category.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { products: true } }, children: true },
      orderBy: { name: 'asc' },
    });
  }

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug ?? this.slugify(dto.name),
        description: dto.description,
        parentId: dto.parentId,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Category not found');
    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      },
    });
  }

  async removeCategory(id: string): Promise<void> {
    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Products ──────────────────────────────────────────────────
  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    categoryId?: string;
    lowStock?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = normalizePage(params.page);
    const limit = normalizeLimit(params.limit);
    const { search, categoryId, lowStock, sortBy, sortOrder } = params;
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(lowStock ? { stock: { lte: 10 } } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: this.parseSort(sortBy, sortOrder),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { total, items };
  }

  async create(dto: CreateProductDto, userId: string) {
    return this.prisma.product.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        discount: dto.discount ?? 0,
        gstRate: dto.gstRate ?? 18,
        imageUrls: dto.imageUrls ?? [],
        stock: dto.stock ?? 0,
        lowStockAt: dto.lowStockAt ?? 10,
        variants: (dto.variants as object) ?? undefined,
        categoryId: dto.categoryId,
        createdById: userId,
      },
      include: { category: true },
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Product not found');
    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.discount !== undefined ? { discount: dto.discount } : {}),
        ...(dto.gstRate !== undefined ? { gstRate: dto.gstRate } : {}),
        ...(dto.imageUrls !== undefined ? { imageUrls: dto.imageUrls } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.variants !== undefined ? { variants: dto.variants as object } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      },
      include: { category: true },
    });
  }

  /** Adjust stock atomically with an audit trail of stock movements. */
  async adjustStock(id: string, dto: UpdateStockDto, userId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          productId: id,
          quantity: dto.quantity,
          reason: dto.reason,
          reference: dto.reference,
          userId,
        },
      });
      const newProduct = await tx.product.update({
        where: { id },
        data: { stock: { increment: dto.quantity } },
      });
      return { movement, product: newProduct };
    });

    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private parseSort(
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'asc',
  ): Prisma.ProductOrderByWithRelationInput {
    const allowed: Record<string, Prisma.ProductOrderByWithRelationInput> = {
      name: { name: sortOrder },
      price: { price: sortOrder },
      stock: { stock: sortOrder },
      createdAt: { createdAt: sortOrder },
    };
    return allowed[sortBy ?? 'name'] ?? allowed.name;
  }

  private slugify(text: string): string {
    return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
}