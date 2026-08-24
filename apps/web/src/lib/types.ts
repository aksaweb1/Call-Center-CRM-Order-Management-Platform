import type { PageResult } from './api';

export type { PageResult };

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  teamId: string | null;
  permissions: string[];
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  isActive?: boolean;
  role?: { id: string; key: string; name: string } | null;
  team?: { id: string; name: string; code: string } | null;
}

export interface PermissionModule {
  module: string;
  permissions: Array<{ key: string; name: string }>;
}

export interface UserEffectivePermissions {
  role: string;
  rolePermissions: string[];
  granted: string[];
  revoked: string[];
  effective: string[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  tags: string[];
  createdAt: string;
}

export interface CustomerDetail extends Customer {
  alternatePhone?: string | null;
  gst?: string | null;
  dob?: string | null;
  customerType: string;
  country?: string | null;
  pincode?: string | null;
  addresses: Array<{
    id: string;
    label?: string | null;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    pincode: string;
    isDefault: boolean;
  }>;
  _count: {
    leads: number;
    orders: number;
    calls: number;
    followUps: number;
  };
}

export interface Note {
  id: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  user?: { id: string; fullName: string } | null;
}

export interface Lead {
  id: string;
  title?: string | null;
  description?: string | null;
  status: string;
  priority: string;
  createdAt: string;
  assignedAt?: string | null;
  lastActivityAt?: string | null;
  customerId: string;
  customer?: { id: string; name: string; phone: string; email?: string | null };
  agent?: { id: string; fullName: string } | null;
  sourceRef?: { id: string; name: string; code: string } | null;
  tags?: Array<{ id: string; name: string; color?: string | null }>;
  convertedOrder?: { id: string; orderNumber: string; total: string; status: string } | null;
  metadata?: {
    remark?: string | null;
    remarkDate?: string | null;
    importSource?: string | null;
    importType?: string | null;
    sheetDates?: string[] | null;
    agentHistory?: Array<{ agent: string; agentId: string; date: string; dateIso: string | null; remark: string }> | null;
    [key: string]: unknown;
  } | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: string;
  placedAt: string;
  itemsTotal?: string;
  discount?: string;
  gstTotal?: string;
  shippingCharges?: string;
  notes?: string | null;
  customer?: { id: string; name: string; phone: string };
  agent?: { id: string; fullName: string } | null;
  lead?: { id: string; title: string; status: string } | null;
  items?: { id: string; quantity: number; unitPrice: string; lineTotal: string; product: { id: string; name: string; sku: string } }[];
  payments?: { id: string; amount: string; method: string; status: string; transactionId?: string | null }[];
  invoice?: { id: string; invoiceNumber: string; status: string; totalAmount: string } | null;
  shipment?: { id?: string; courierName?: string | null; trackingId?: string | null; status: string } | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: string;
  stock: number;
  isActive: boolean;
  description?: string | null;
  discount?: number;
  gstRate?: number;
  lowStockAt?: number;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
}

export interface Category {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  isActive?: boolean;
  parentId?: string | null;
}

export interface Call {
  id: string;
  provider: string;
  direction: string;
  status: string;
  dialedNumber: string;
  startedAt: string;
  durationSecs?: number | null;
  outcome?: string | null;
  notes?: string | null;
  agent?: { id: string; fullName: string } | null;
  customer?: { id: string; name: string; phone: string };
}

export interface FollowUp {
  id: string;
  title?: string | null;
  description?: string | null;
  scheduledFor: string;
  isDone: boolean;
  completedAt?: string | null;
  customer?: { id: string; name: string; phone: string };
  agent?: { id: string; fullName: string } | null;
  lead?: { id: string; title?: string | null; status?: string | null } | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  entity?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface AgentDashboard {
  leadsToday: number;
  callsToday: number;
  averageCallSecs: number;
  totalCalls: number;
  pendingFollowUps: number;
  pendingOrders: number;
  salesToday: number;
  paidOrdersToday: number;
  ordersToday: number;
  conversionPercent: number;
}

export interface LeadFunnel {
  status: string;
  _count: { _all: number };
}

export interface ManagerDashboard {
  revenue: number;
  totalOrders: number;
  pendingFollowUps: number;
  leadFunnel: LeadFunnel[];
  ordersByStatus: { status: string; _count: { _all: number } }[];
  agentRanking: { agentId: string | null; agentName: string; orders: number; revenue: number }[];
  callStats: { total: number; avgDurationSecs: number };
}

export interface CeoDashboard {
  revenue: number;
  totalOrders: number;
  cancellationRate: number;
  topProducts: { id: string | null; name: string; sku: string | null; quantity: number; lineTotal: number }[];
  leadBySource: { sourceId: string | null; sourceName: string; count: number }[];
  monthlyRevenue: { month: string; total: number }[];
}
