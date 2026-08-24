import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { normalizeLimit, normalizePage } from '../../common/utils/pagination';
import { ActivityService } from '../activity/activity.service';
import { LeadsRepository } from '../leads/leads.repository';
import {
  CreateOrderDto,
  CreateShipmentDto,
  RecordPaymentDto,
  UpdateOrderStatusDto,
  UpdateShipmentStatusDto,
} from './dto/order.dto';

const orderInclude = {
  customer: true,
  agent: { select: { id: true, fullName: true } },
  lead: { select: { id: true, title: true, status: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
  payments: true,
  invoice: true,
  shipment: true,
} satisfies Prisma.OrderInclude;

/** Allowed order status transitions — terminal states allow no moves. */
const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED', 'REFUNDED'],
  RETURNED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/** Allowed shipment status transitions. */
const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  PENDING: ['PICKED'],
  PICKED: ['IN_TRANSIT', 'FAILED_DELIVERY'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'RETURNED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED_DELIVERY'],
  FAILED_DELIVERY: ['PICKED', 'RETURNED'],
  DELIVERED: [],
  RETURNED: [],
};

/** Shipment statuses that drive the parent order status. */
const SHIPMENT_TO_ORDER: Partial<Record<ShipmentStatus, OrderStatus>> = {
  DELIVERED: 'DELIVERED',
  RETURNED: 'RETURNED',
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly leadsRepository: LeadsRepository,
  ) {}

  async create(dto: CreateOrderDto, agentId: string) {
    // Retry the whole transaction if a concurrent order/invoice number
    // collides on its unique constraint (count-based numbering races).
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) =>
          this.createInTransaction(dto, agentId, tx),
        );
      } catch (e) {
        const isCollision =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!isCollision || attempt >= 4) throw e;
      }
    }
  }

  private async createInTransaction(
    dto: CreateOrderDto,
    agentId: string,
    tx: Prisma.TransactionClient,
  ) {
    // Linked lead must exist, belong to the same customer, and not already be converted.
    let lead: {
      id: string;
      customerId: string;
      status: string;
      convertedOrderId: string | null;
    } | null = null;
    if (dto.leadId) {
      lead = await tx.lead.findFirst({
        where: { id: dto.leadId, deletedAt: null },
        select: { id: true, customerId: true, status: true, convertedOrderId: true },
      });
      if (!lead) throw new NotFoundException('Lead not found');
      if (lead.customerId !== dto.customerId) {
        throw new BadRequestException('Lead does not belong to this customer');
      }
      if (lead.convertedOrderId || ['ORDER_CREATED', 'CONVERTED'].includes(lead.status)) {
        throw new ConflictException('This lead has already been converted to an order');
      }
    }

    // Resolve products + prices (server-side authoritative pricing — the
    // client cannot influence unit price, discount, or GST).
    const productIds = dto.items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, deletedAt: null, isActive: true },
    });
    if (products.length !== dto.items.length) {
      throw new BadRequestException('One or more products not found or inactive');
    }
    const productMap = new Map(products.map((p) => [p.id, p]));

    let itemsTotal = 0;
    let discountTotal = 0;
    let gstTotal = 0;

    const itemsData = dto.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const unitPrice = Number(product.price);
      const discount = Number(product.discount ?? 0);
      const gstRate = Number(product.gstRate ?? 18);
      const base = unitPrice * item.quantity;
      const discountAmt = base * (discount / 100);
      const gstAmt = (base - discountAmt) * (gstRate / 100);
      const lineTotal = base - discountAmt + gstAmt;

      itemsTotal += base;
      discountTotal += discountAmt;
      gstTotal += gstAmt;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        discount,
        gstRate,
        lineTotal,
      };
    });

    const shippingCharges = dto.shippingCharges ?? 0;
    const total = itemsTotal - discountTotal + gstTotal + shippingCharges;
    const orderNumber = await this.generateOrderNumber(tx);

    const order = await tx.order.create({
      data: {
        orderNumber,
        customerId: dto.customerId,
        agentId,
        leadId: dto.leadId,
        itemsTotal,
        discount: discountTotal,
        gstTotal,
        shippingCharges,
        couponCode: dto.couponCode,
        total,
        billingAddress: (dto.billingAddress as object) ?? undefined,
        shippingAddress: (dto.shippingAddress as object) ?? undefined,
        notes: dto.notes,
        items: { create: itemsData },
      },
      include: orderInclude,
    });

    // Deduct stock conditionally + record movements. The conditional update
    // makes the check-and-decrement atomic, so concurrent orders can never
    // oversell into negative stock.
    for (const item of dto.items) {
      const decremented = await tx.product.updateMany({
        where: {
          id: item.productId,
          deletedAt: null,
          isActive: true,
          stock: { gte: item.quantity },
        },
        data: { stock: { decrement: item.quantity } },
      });
      if (decremented.count === 0) {
        throw new BadRequestException(
          `Insufficient stock for ${productMap.get(item.productId)!.name}`,
        );
      }
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          quantity: -item.quantity,
          reason: 'ORDER_PLACED',
          reference: orderNumber,
          userId: agentId,
        },
      });
    }

    // Auto-generate invoice (COD default pending payment)
    await tx.orderInvoice.create({
      data: {
        invoiceNumber: await this.generateInvoiceNumber(tx),
        orderId: order.id,
        status: 'ISSUED',
        totalAmount: total,
        gstBreakup: { gstTotal, itemsTotal, discount: discountTotal },
        issuedAt: new Date(),
      },
    });

    // Link the lead: ORDER_CREATED now; CONVERTED when the order is delivered.
    if (lead) {
      await this.leadsRepository.markOrderCreated(lead.id, order.id, tx);
    }

    await this.activityService.record({
      userId: agentId,
      customerId: dto.customerId,
      leadId: dto.leadId,
      orderId: order.id,
      action: 'Order Placed',
      metadata: { orderNumber, total },
    }, tx);

    return order;
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    paymentStatus?: string;
    agentId?: string;
    customerId?: string;
    from?: string;
    to?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = normalizePage(query.page);
    const limit = normalizeLimit(query.limit);
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status as OrderStatus } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus as PaymentStatus } : {}),
      ...(query.agentId ? { agentId: query.agentId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.from || query.to
        ? { placedAt: { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' } },
              { customer: { name: { contains: query.search, mode: 'insensitive' } } },
              { customer: { phone: { contains: query.search } } },
            ],
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { ...orderInclude, timeline: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, userId: string) {
    const order = await this.prisma.order.findFirst({ where: { id, deletedAt: null } });
    if (!order) throw new NotFoundException('Order not found');

    const current = order.status;
    const next = dto.status as OrderStatus;
    if (next === current) return this.findById(id);

    const allowed = ORDER_TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot change order status from ${current} to ${next}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id },
        data: { status: next },
        include: orderInclude,
      });

      // Delivery settles COD payment (only if still pending — never flips
      // prepaid orders) and converts the linked lead.
      if (next === 'DELIVERED') {
        if (updatedOrder.paymentStatus === 'PENDING') {
          await tx.order.update({ where: { id }, data: { paymentStatus: 'PAID' } });
          updatedOrder.paymentStatus = 'PAID';
        }
        if (order.leadId) {
          await this.leadsRepository.markConverted(order.leadId, tx);
          updatedOrder.lead = updatedOrder.lead
            ? { ...updatedOrder.lead, status: 'CONVERTED' }
            : updatedOrder.lead;
        }
      }

      // Cancelling/returning restores stock; cancelling also voids the invoice.
      if (next === 'CANCELLED' || next === 'RETURNED') {
        await this.restockOrderItems(
          tx,
          id,
          order.orderNumber,
          next === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ORDER_RETURNED',
          userId,
        );
      }
      if (next === 'CANCELLED') {
        await tx.orderInvoice.updateMany({
          where: { orderId: id, status: { in: ['DRAFT', 'ISSUED', 'OVERDUE'] } },
          data: { status: 'CANCELLED' },
        });
      }

      // Refund flips the payment state so revenue reports stay consistent.
      if (next === 'REFUNDED') {
        await tx.order.update({ where: { id }, data: { paymentStatus: 'REFUNDED' } });
        updatedOrder.paymentStatus = 'REFUNDED';
      }

      return updatedOrder;
    });

    await this.activityService.record({
      userId,
      customerId: order.customerId,
      orderId: order.id,
      action: 'Order Status Changed',
      metadata: { from: current, to: next, reason: dto.reason },
    });
    return updated;
  }

  /** Restores stock for every line of an order (cancel/return) and logs movements. */
  private async restockOrderItems(
    tx: Prisma.TransactionClient,
    orderId: string,
    orderNumber: string,
    reason: string,
    userId: string,
  ) {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { productId: true, quantity: true },
    });
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          quantity: item.quantity,
          reason,
          reference: orderNumber,
          userId,
        },
      });
    }
  }

  async recordPayment(orderId: string, dto: RecordPaymentDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { payments: { where: { status: 'PAID', deletedAt: null } } },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (['CANCELLED', 'REFUNDED'].includes(order.status)) {
        throw new BadRequestException(
          `Cannot record a payment on a ${order.status.toLowerCase()} order`,
        );
      }

      // Idempotency: reject a repeated gateway transaction id.
      if (dto.transactionId) {
        const dupe = await tx.payment.findFirst({
          where: { transactionId: dto.transactionId, deletedAt: null },
          select: { id: true },
        });
        if (dupe) throw new ConflictException('This transaction ID has already been recorded');
      }

      const payment = await tx.payment.create({
        data: {
          orderId,
          amount: dto.amount,
          method: dto.method,
          status: 'PAID',
          transactionId: dto.transactionId,
          receivedById: userId,
          paidAt: new Date(),
        },
      });

      // Cumulative successful payments decide the order's payment state —
      // partial collections keep it PENDING instead of falsely marking PAID.
      const paidSum =
        order.payments.reduce((sum, p) => sum + Number(p.amount), 0) + Number(dto.amount);
      const fullyPaid = paidSum >= Number(order.total);

      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: fullyPaid ? 'PAID' : 'PENDING' },
      });

      if (fullyPaid) {
        await tx.orderInvoice.updateMany({
          where: { orderId, status: { in: ['DRAFT', 'ISSUED', 'OVERDUE'] } },
          data: { status: 'PAID', paidAt: new Date() },
        });
      }

      await this.activityService.record({
        userId,
        customerId: order.customerId,
        orderId,
        action: 'Payment Received',
        metadata: { amount: dto.amount, method: dto.method, fullyPaid },
      }, tx);

      return payment;
    });
  }

  async createShipment(orderId: string, dto: CreateShipmentDto, userId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, deletedAt: null } });
    if (!order) throw new NotFoundException('Order not found');
    if (!['CONFIRMED', 'PACKED'].includes(order.status)) {
      throw new BadRequestException(
        `Cannot dispatch an order in ${order.status} status`,
      );
    }

    const shipment = await this.prisma.$transaction(async (tx) => {
      const s = await tx.orderShipment.upsert({
        where: { orderId },
        create: {
          orderId,
          courierName: dto.courierName,
          trackingId: dto.trackingId,
          address: (dto.shipmentAddress as object) ?? undefined,
          shippedAt: new Date(),
        },
        update: {
          courierName: dto.courierName,
          trackingId: dto.trackingId,
          address: (dto.shipmentAddress as object) ?? undefined,
        },
      });
      await tx.order.update({ where: { id: orderId }, data: { status: 'DISPATCHED' } });
      return s;
    });

    await this.activityService.record({
      userId,
      customerId: order.customerId,
      orderId: order.id,
      action: 'Shipment Created',
      metadata: { trackingId: dto.trackingId, courier: dto.courierName },
    });
    return shipment;
  }

  async updateShipmentStatus(
    orderId: string,
    dto: UpdateShipmentStatusDto,
    userId: string,
  ) {
    const shipment = await this.prisma.orderShipment.findUnique({ where: { orderId } });
    if (!shipment) throw new NotFoundException('Shipment not found');

    const next = dto.status as ShipmentStatus;
    if (next !== shipment.status) {
      const allowed = SHIPMENT_TRANSITIONS[shipment.status] ?? [];
      if (!allowed.includes(next)) {
        throw new BadRequestException(
          `Cannot change shipment status from ${shipment.status} to ${next}`,
        );
      }
    }

    const order = await this.prisma.order.findFirst({ where: { id: orderId, deletedAt: null } });
    if (!order) throw new NotFoundException('Order not found');
    if (['CANCELLED', 'REFUNDED'].includes(order.status)) {
      throw new BadRequestException(`Order is ${order.status.toLowerCase()}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const s = await tx.orderShipment.update({
        where: { orderId },
        data: {
          status: next,
          ...(dto.trackingId ? { trackingId: dto.trackingId } : {}),
          ...(next === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
          ...(next === 'IN_TRANSIT' && !shipment.shippedAt ? { shippedAt: new Date() } : {}),
        },
      });

      const orderNext = SHIPMENT_TO_ORDER[next];
      if (orderNext && orderNext !== order.status) {
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: orderNext,
            // COD collected on delivery — never flips prepaid orders.
            ...(orderNext === 'DELIVERED' && order.paymentStatus === 'PENDING'
              ? { paymentStatus: 'PAID' }
              : {}),
          },
        });
        if (orderNext === 'DELIVERED' && order.leadId) {
          await this.leadsRepository.markConverted(order.leadId, tx);
        }
        if (orderNext === 'RETURNED') {
          await this.restockOrderItems(tx, orderId, order.orderNumber, 'ORDER_RETURNED', userId);
        }
      }
      return s;
    });

    await this.activityService.record({
      userId,
      orderId,
      action: 'Shipment Status Changed',
      metadata: { from: shipment.status, to: next },
    });
    return updated;
  }

  private async generateOrderNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const count = await tx.order.count();
    return `ORD-${String(count + 1).padStart(6, '0')}`;
  }

  private async generateInvoiceNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const count = await tx.orderInvoice.count();
    return `INV-${String(count + 1).padStart(6, '0')}`;
  }
}