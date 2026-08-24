import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { Permissions } from '../permissions.constants';

interface RoleSeed {
  key: string;
  permissions: string[];
}

/**
 * Registers the canonical permission set and default roles on boot.
 * Idempotent upsert — safe to run at every startup.
 */
@Injectable()
export class PermissionSeeder implements OnModuleInit {
  private readonly logger = new Logger(PermissionSeeder.name);

  private readonly roleSeeds: RoleSeed[] = [
    { key: 'SUPER_ADMIN', permissions: Object.values(Permissions) },
    {
      key: 'ADMIN',
      // Everything except lead.create and permission-management —
      // only SUPER_ADMIN can add leads or grant/revoke permissions.
      permissions: Object.values(Permissions).filter(
        (p) => p !== Permissions.LEAD_CREATE &&
          p !== Permissions.USER_PERMISSION_READ &&
          p !== Permissions.USER_PERMISSION_UPDATE,
      ),
    },
    {
      key: 'MANAGER',
      permissions: [
        Permissions.USER_READ, Permissions.ROLE_READ, Permissions.CUSTOMER_READ,
        Permissions.CUSTOMER_CREATE, Permissions.CUSTOMER_UPDATE,
        Permissions.LEAD_READ, Permissions.LEAD_UPDATE,
        Permissions.LEAD_ASSIGN, Permissions.PRODUCT_READ, Permissions.CATEGORY_READ,
        Permissions.INVENTORY_READ, Permissions.ORDER_READ, Permissions.ORDER_CREATE,
        Permissions.PAYMENT_READ, Permissions.INVOICE_READ, Permissions.SHIPMENT_READ,
        Permissions.CALL_READ, Permissions.CALL_UPDATE, Permissions.FOLLOWUP_READ, Permissions.NOTE_READ,
        Permissions.NOTE_CREATE, Permissions.NOTIFICATION_READ, Permissions.AUDIT_READ,
        Permissions.DASHBOARD_READ, Permissions.REPORT_READ, Permissions.SETTINGS_READ,
      ],
    },
    {
      key: 'TEAM_LEADER',
      permissions: [
        Permissions.USER_READ, Permissions.CUSTOMER_READ, Permissions.CUSTOMER_UPDATE,
        Permissions.LEAD_READ, Permissions.LEAD_UPDATE,
        Permissions.LEAD_ASSIGN, Permissions.PRODUCT_READ, Permissions.CATEGORY_READ,
        Permissions.INVENTORY_READ, Permissions.ORDER_READ, Permissions.ORDER_CREATE,
        Permissions.PAYMENT_UPDATE, Permissions.INVOICE_READ, Permissions.SHIPMENT_READ,
        Permissions.CALL_READ, Permissions.CALL_UPDATE,
        Permissions.FOLLOWUP_READ, Permissions.FOLLOWUP_UPDATE,
        Permissions.NOTE_READ, Permissions.NOTE_CREATE, Permissions.NOTIFICATION_READ,
        Permissions.DASHBOARD_READ, Permissions.REPORT_READ,
      ],
    },
    {
      key: 'AGENT',
      permissions: [
        Permissions.CUSTOMER_READ, Permissions.CUSTOMER_CREATE, Permissions.CUSTOMER_UPDATE,
        Permissions.LEAD_READ, Permissions.LEAD_UPDATE,
        Permissions.PRODUCT_READ, Permissions.CATEGORY_READ,
        Permissions.ORDER_READ, Permissions.ORDER_CREATE,
        Permissions.PAYMENT_CREATE,
        Permissions.CALL_READ, Permissions.CALL_CREATE, Permissions.CALL_UPDATE,
        Permissions.FOLLOWUP_READ, Permissions.FOLLOWUP_CREATE, Permissions.FOLLOWUP_UPDATE,
        Permissions.NOTE_READ, Permissions.NOTE_CREATE, Permissions.NOTE_UPDATE,
        Permissions.ATTACHMENT_UPLOAD, Permissions.NOTIFICATION_READ,
        Permissions.DASHBOARD_READ,
      ],
    },
    {
      key: 'QA',
      permissions: [Permissions.CALL_READ, Permissions.CUSTOMER_READ, Permissions.LEAD_READ, Permissions.USER_READ],
    },
    {
      key: 'DISPATCHER',
      permissions: [Permissions.ORDER_READ, Permissions.ORDER_UPDATE, Permissions.SHIPMENT_READ, Permissions.SHIPMENT_CREATE, Permissions.SHIPMENT_UPDATE, Permissions.CUSTOMER_READ],
    },
    {
      key: 'FINANCE',
      permissions: [Permissions.ORDER_READ, Permissions.PAYMENT_READ, Permissions.PAYMENT_UPDATE, Permissions.INVOICE_READ, Permissions.REPORT_READ, Permissions.CUSTOMER_READ],
    },
    {
      key: 'SUPPORT',
      permissions: [Permissions.CUSTOMER_READ, Permissions.CUSTOMER_UPDATE, Permissions.ORDER_READ, Permissions.LEAD_READ, Permissions.NOTE_READ, Permissions.NOTE_CREATE, Permissions.CALL_READ],
    },
    {
      key: 'DELIVERY',
      permissions: [Permissions.ORDER_READ, Permissions.ORDER_UPDATE, Permissions.SHIPMENT_READ, Permissions.SHIPMENT_UPDATE, Permissions.CUSTOMER_READ],
    },
    { key: 'VIEWER', permissions: [Permissions.CUSTOMER_READ, Permissions.LEAD_READ, Permissions.ORDER_READ, Permissions.PRODUCT_READ, Permissions.DASHBOARD_READ, Permissions.REPORT_READ] },
  ];

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.seedPermissions();
    await this.seedRoles();
    this.logger.log('Permissions & roles seeded');
  }

  private async seedPermissions(): Promise<void> {
    const moduleGroups = new Map<string, string[]>();
    for (const key of Object.values(Permissions)) {
      const module = key.split('.')[0];
      const list = moduleGroups.get(module) ?? [];
      list.push(key);
      moduleGroups.set(module, list);
    }

    const data: Prisma.PermissionCreateManyInput[] = [];
    for (const [module, keys] of moduleGroups) {
      for (const key of keys) {
        data.push({
          key,
          name: key.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          module,
        });
      }
    }
    await this.prisma.permission.createMany({ data, skipDuplicates: true });
  }

  private async seedRoles(): Promise<void> {
    for (const seed of this.roleSeeds) {
      const role = await this.prisma.role.upsert({
        where: { key: seed.key },
        update: { isSystem: true, deletedAt: null },
        create: { key: seed.key, name: this.titleize(seed.key), isSystem: true },
      });

      const perms = await this.prisma.permission.findMany({
        where: { key: { in: seed.permissions } },
        select: { id: true },
      });
      await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await this.prisma.rolePermission.createMany({
        data: perms.map((p: { id: string }) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
  }

  private titleize(key: string): string {
    return key.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}