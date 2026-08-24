import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';
import { normalizeLimit, normalizePage } from '../../common/utils/pagination';

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateNoteDto, userId: string) {
    return this.prisma.note.create({
      data: {
        body: dto.body,
        userId,
        customerId: dto.customerId,
        leadId: dto.leadId,
        pinned: dto.pinned ?? false,
      },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    });
  }

  async list(params: { customerId?: string; leadId?: string; userId?: string; page?: number; limit?: number }) {
    const page = normalizePage(params.page);
    const limit = normalizeLimit(params.limit);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.note.count({
        where: {
          deletedAt: null,
          ...(params.customerId ? { customerId: params.customerId } : {}),
          ...(params.leadId ? { leadId: params.leadId } : {}),
          ...(params.userId ? { userId: params.userId } : {}),
        },
      }),
      this.prisma.note.findMany({
        where: {
          deletedAt: null,
          ...(params.customerId ? { customerId: params.customerId } : {}),
          ...(params.leadId ? { leadId: params.leadId } : {}),
          ...(params.userId ? { userId: params.userId } : {}),
        },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items, total };
  }

  async update(id: string, dto: UpdateNoteDto, userId: string) {
    const note = await this.prisma.note.findFirst({ where: { id, deletedAt: null, userId } });
    if (!note) throw new NotFoundException('Note not found or not owned by you');
    return this.prisma.note.update({
      where: { id },
      data: {
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
      },
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    const note = await this.prisma.note.findFirst({ where: { id, deletedAt: null, userId } });
    if (!note) throw new NotFoundException('Note not found or not owned by you');
    await this.prisma.note.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}