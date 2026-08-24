import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const LEAD_SOURCES = [
  { name: 'Facebook', code: 'facebook' },
  { name: 'Instagram', code: 'instagram' },
  { name: 'Website', code: 'website' },
  { name: 'WhatsApp', code: 'whatsapp' },
  { name: 'Google Ads', code: 'google_ads' },
  { name: 'Organic', code: 'organic' },
  { name: 'Referral', code: 'referral' },
  { name: 'Marketplace', code: 'marketplace' },
  { name: 'Manual Import', code: 'manual_import' },
  { name: 'CSV Import', code: 'csv_import' },
];

const LEAD_TAGS = [
  { name: 'VIP', color: '#f59e0b' },
  { name: 'New', color: '#3b82f6' },
  { name: 'Hot', color: '#ef4444' },
  { name: 'Revisit', color: '#10b981' },
  { name: 'Deal', color: '#8b5cf6' },
];

const DEMO_PASSWORD = 'Admin@12345';

function daysAgo(days: number, hour = 10, minute = 30): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function hoursAgo(hours: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - hours, 15, 0, 0);
  return d;
}

async function main(): Promise<void> {
  console.log('⏳ Seeding database...');

  // Clean up previous demo run (children first, preserve roles/permissions/settings)
  const tables = [
    'CallEvent',
    'Call',
    'CallRecording',
    'FollowUp',
    'OrderShipment',
    'OrderInvoice',
    'Payment',
    'OrderItem',
    'Order',
    'StockMovement',
    'Note',
    'Activity',
    'AuditLog',
    'Notification',
    'PushToken',
    'Attachment',
    'Lead',
    'Address',
    'Customer',
    'Product',
    'Category',
    'RefreshToken',
  ];
  for (const t of tables) {
    // deleteMany with model lookup to be safe
    const model = (prisma as any)[t.charAt(0).toLowerCase() + t.slice(1)];
    if (model) await model.deleteMany({});
  }

  // Categories
  const cats = [
    { name: 'Audio', slug: 'audio', description: 'Headphones, speakers, earbuds' },
    { name: 'Wearables', slug: 'wearables', description: 'Smartwatches and bands' },
    { name: 'Accessories', slug: 'accessories', description: 'Chargers, cables, cases' },
    { name: 'Mobiles', slug: 'mobiles', description: 'Smartphones and tablets' },
    { name: 'Laptops', slug: 'laptops', description: 'Laptops and computers' },
  ];
  const categoryRows = [];
  for (const c of cats) {
    categoryRows.push(
      await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c }),
    );
  }

  // Products (more variety)
  const products = [
    { sku: 'AUD-1001', name: 'Wireless Earbuds Pro', price: 2499, stock: 120, categoryId: categoryRows[0].id, gstRate: 18 },
    { sku: 'AUD-1002', name: 'Over-Ear ANC Headphones', price: 5999, stock: 45, categoryId: categoryRows[0].id, gstRate: 18 },
    { sku: 'AUD-1003', name: 'Bluetooth Speaker Mini', price: 1499, stock: 3, categoryId: categoryRows[0].id, gstRate: 18 },
    { sku: 'WRB-2001', name: 'Fitness Smartwatch S2', price: 3499, stock: 80, categoryId: categoryRows[1].id, gstRate: 18 },
    { sku: 'WRB-2002', name: 'Health Monitoring Band', price: 1499, stock: 200, categoryId: categoryRows[1].id, gstRate: 18 },
    { sku: 'ACC-3001', name: '65W GaN Fast Charger', price: 1299, stock: 300, categoryId: categoryRows[2].id, gstRate: 18 },
    { sku: 'ACC-3002', name: 'USB-C Braided Cable', price: 399, stock: 8, categoryId: categoryRows[2].id, gstRate: 18 },
    { sku: 'ACC-3003', name: 'Tempered Glass Screen Protector', price: 199, stock: 600, categoryId: categoryRows[2].id, gstRate: 18 },
    { sku: 'MOB-4001', name: 'Smartphone X12 128GB', price: 15999, stock: 25, categoryId: categoryRows[3].id, gstRate: 18 },
    { sku: 'MOB-4002', name: 'Budget Phone M6', price: 6999, stock: 60, categoryId: categoryRows[3].id, gstRate: 18 },
    { sku: 'LAP-5001', name: 'Ultrabook 14" Core i5', price: 64999, stock: 12, categoryId: categoryRows[4].id, gstRate: 18 },
    { sku: 'LAP-5002', name: 'Office Laptop 15.6"', price: 42999, stock: 18, categoryId: categoryRows[4].id, gstRate: 18 },
  ];
  const productRows = [];
  for (const p of products) {
    productRows.push(await prisma.product.upsert({ where: { sku: p.sku }, update: {}, create: p }));
  }

  // Lead sources
  for (const s of LEAD_SOURCES) {
    await prisma.leadSource.upsert({ where: { code: s.code }, update: {}, create: s });
  }

  // Lead tags
  for (const t of LEAD_TAGS) {
    await prisma.leadTag.upsert({ where: { name: t.name }, update: {}, create: t });
  }

  // Roles (seeded on API boot; fall back gracefully)
  const role = async (key: string) => prisma.role.findUnique({ where: { key } });

  // ─────────────────────────────────────────────
  // EMPLOYEES (manager + agents + ops) & TEAMS
  // ─────────────────────────────────────────────
  const teamMumbai = await prisma.team.upsert({
    where: { code: 'MUM-SALES' },
    update: { name: 'Model Town Sales Team' },
    create: { name: 'Model Town Sales Team', code: 'MUM-SALES', location: 'Mumbai' },
  });
  const teamDelhi = await prisma.team.upsert({
    where: { code: 'DEL-SALES' },
    update: {},
    create: { name: 'Delhi Sales Team', code: 'DEL-SALES', location: 'Delhi' },
  });
  const teamOps = await prisma.team.upsert({
    where: { code: 'OPS' },
    update: {},
    create: { name: 'Operations Team', code: 'OPS', location: 'Bangalore' },
  });

  const passwordHash = await argon2.hash(DEMO_PASSWORD);

  const employees: Array<{
    email: string;
    phone: string;
    fullName: string;
    roleKey: string;
    team?: typeof teamMumbai;
  }> = [
    { email: 'manager@callcenter.local', phone: '9000000001', fullName: 'Priya Sharma', roleKey: 'MANAGER', team: teamMumbai },
    { email: 'tl@callcenter.local', phone: '9000000002', fullName: 'Rahul Verma', roleKey: 'TEAM_LEADER', team: teamMumbai },
    { email: 'agent.rahul@callcenter.local', phone: '9000000003', fullName: 'Amit Patel', roleKey: 'AGENT', team: teamMumbai },
    { email: 'agent.sneha@callcenter.local', phone: '9000000004', fullName: 'Sneha Iyer', roleKey: 'AGENT', team: teamMumbai },
    { email: 'agent.vikram@callcenter.local', phone: '9000000005', fullName: 'Vikram Singh', roleKey: 'AGENT', team: teamDelhi },
    { email: 'agent.pooja@callcenter.local', phone: '9000000006', fullName: 'Pooja Nair', roleKey: 'AGENT', team: teamDelhi },
    { email: 'dispatcher@callcenter.local', phone: '9000000007', fullName: 'Karan Mehta', roleKey: 'DISPATCHER', team: teamOps },
    { email: 'finance@callcenter.local', phone: '9000000008', fullName: 'Anita Desai', roleKey: 'FINANCE', team: teamOps },
    { email: 'qa@callcenter.local', phone: '9000000009', fullName: 'Mohit Jain', roleKey: 'QA', team: teamOps },
    { email: 'delivery@callcenter.local', phone: '9000000010', fullName: 'Suresh Kumar', roleKey: 'DELIVERY', team: teamOps },
    { email: 'support@callcenter.local', phone: '9000000011', fullName: 'Neha Gupta', roleKey: 'SUPPORT', team: teamDelhi },
    { email: 'viewer@callcenter.local', phone: '9000000012', fullName: 'Ravi Menon', roleKey: 'VIEWER' },
  ];

  const userRows = new Map<string, Awaited<ReturnType<typeof prisma.user.create>>>();
  for (const emp of employees) {
    const r = await role(emp.roleKey);
    if (!r) continue;
    const existing = await prisma.user.findUnique({ where: { email: emp.email } });
    let user;
    if (existing) {
      user = existing;
    } else {
      user = await prisma.user.create({
        data: {
          email: emp.email,
          phone: emp.phone,
          fullName: emp.fullName,
          passwordHash,
          roleId: r.id,
          teamId: emp.team?.id,
          isActive: true,
        },
      });
    }
    userRows.set(emp.email, user as Awaited<ReturnType<typeof prisma.user.create>>);
  }

  // Admin (SUPER_ADMIN) always present
  let admin = await prisma.user.findUnique({ where: { email: 'admin@callcenter.local' } });
  if (!admin) {
    const superRole = await role('SUPER_ADMIN');
    if (!superRole) throw new Error('Run the API once first to seed roles/permissions');
    admin = await prisma.user.create({
      data: {
        email: 'admin@callcenter.local',
        phone: '9000000000',
        fullName: 'System Administrator',
        passwordHash,
        roleId: superRole.id,
        isActive: true,
      },
    });
  }
  userRows.set('admin@callcenter.local', admin);

  const agents = [
    userRows.get('agent.rahul@callcenter.local')!,
    userRows.get('agent.sneha@callcenter.local')!,
    userRows.get('agent.vikram@callcenter.local')!,
    userRows.get('agent.pooja@callcenter.local')!,
  ];

  // ─────────────────────────────────────────────
  // CUSTOMERS
  // ─────────────────────────────────────────────
  const customerData = [
    { name: 'Aarav Gupta', phone: '9811111111', city: 'Mumbai', state: 'Maharashtra', tags: ['VIP'], customerType: 'INDIVIDUAL' },
    { name: 'Riya Kapoor', phone: '9822222222', city: 'Delhi', state: 'Delhi', tags: ['Hot'], customerType: 'INDIVIDUAL' },
    { name: 'Kunal Shah', phone: '9833333333', city: 'Ahmedabad', state: 'Gujarat', tags: ['Revisit'], customerType: 'COMPANY', company: 'Shah Traders', gst: '24ABCDE1234F1Z5' },
    { name: 'Meera Nair', phone: '9844444444', city: 'Kochi', state: 'Kerala', tags: ['New'], customerType: 'INDIVIDUAL' },
    { name: 'Arjun Reddy', phone: '9855555555', city: 'Hyderabad', state: 'Telangana', tags: ['Deal'], customerType: 'INDIVIDUAL' },
    { name: 'Sara Khan', phone: '9866666666', city: 'Lucknow', state: 'Uttar Pradesh', tags: [], customerType: 'INDIVIDUAL' },
    { name: 'Vikram Joshi', phone: '9877777777', city: 'Pune', state: 'Maharashtra', tags: ['VIP'], customerType: 'COMPANY', company: 'Joshi Electronics', gst: '27ABCDE5678F1Z7' },
    { name: 'Ananya Das', phone: '9888888888', city: 'Kolkata', state: 'West Bengal', tags: ['Hot', 'New'], customerType: 'INDIVIDUAL' },
    { name: 'Rohan Malhotra', phone: '9899999999', city: 'Chandigarh', state: 'Chandigarh', tags: ['Revisit'], customerType: 'INDIVIDUAL' },
    { name: 'Ishita Bose', phone: '9800000001', city: 'Kolkata', state: 'West Bengal', tags: [], customerType: 'INDIVIDUAL' },
    { name: 'Nikhil Chawla', phone: '9800000002', city: 'Gurugram', state: 'Haryana', tags: ['Deal'], customerType: 'COMPANY', company: 'Chawla Retail', gst: '06ABCDE1234F1Z8' },
    { name: 'Divya Menon', phone: '9800000003', city: 'Bengaluru', state: 'Karnataka', tags: ['VIP'], customerType: 'INDIVIDUAL' },
    { name: 'Farhan Ali', phone: '9800000004', city: 'Bhopal', state: 'Madhya Pradesh', tags: ['New'], customerType: 'INDIVIDUAL' },
    { name: 'Gauri Kale', phone: '9800000005', city: 'Nagpur', state: 'Maharashtra', tags: [], customerType: 'INDIVIDUAL' },
    { name: 'Aditya Rao', phone: '9800000006', city: 'Chennai', state: 'Tamil Nadu', tags: ['Hot'], customerType: 'INDIVIDUAL' },
    { name: 'Demo Customer', phone: '9876543210', email: 'demo@example.com', city: 'Mumbai', state: 'Maharashtra', country: 'IN', pincode: '400001', tags: [], customerType: 'INDIVIDUAL' },
  ];

  const customers: Array<Awaited<ReturnType<typeof prisma.customer.create>>> = [];
  for (const c of customerData) {
    const created = await prisma.customer.create({
      data: {
        name: c.name,
        phone: c.phone,
        email: c.email ?? `${c.name.toLowerCase().replace(/[^a-z]/g, '.')}@example.com`,
        city: c.city,
        state: c.state,
        country: 'IN',
        tags: c.tags,
        customerType: c.customerType as 'INDIVIDUAL' | 'COMPANY',
        company: c.company,
        gst: c.gst,
        createdById: agents[0]?.id ?? admin!.id,
        createdAt: daysAgo(20 + customers.length),
      },
    });
    customers.push(created);
  }

  // ─────────────────────────────────────────────
  // LEADS (spread across sources, agents, statuses)
  // ─────────────────────────────────────────────
  const sources = await prisma.leadSource.findMany();
  const tags = await prisma.leadTag.findMany();
  const statuses = ['NEW', 'ASSIGNED', 'CALLING', 'INTERESTED', 'CALL_BACK_REQUESTED', 'CONVERTED', 'NOT_INTERESTED', 'NO_ANSWER'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

  const leadTitles = [
    'Interested in Wireless Earbuds', 'Wants Fitness Smartwatch', 'Asked about ANC Headphones',
    'Looking for budget phone', 'Needs laptop for office', 'Interested in fast charger bundle',
    'Asked about health band', 'Wants speaker for home', 'Bulk order enquiry', 'Replacement request',
    'Wants offer on cable', 'Screen protector enquiry', 'Upgrade to Ultrabook', 'Corporate gifting',
  ];

  const leadRows: Array<Awaited<ReturnType<typeof prisma.lead.create>>> = [];
  for (let i = 0; i < leadTitles.length; i++) {
    const agent = agents[i % agents.length];
    const cust = customers[i % customers.length];
    const source = sources[i % sources.length];
    const status = statuses[i % statuses.length];
    const created = await prisma.lead.create({
      data: {
        customerId: cust.id,
        agentId: status === 'NEW' ? null : agent.id,
        teamId: agent.teamId,
        sourceId: source.id,
        status: status as never,
        priority: priorities[i % priorities.length] as never,
        title: leadTitles[i],
        description: `Enquiry about ${leadTitles[i].toLowerCase()} received from ${source.name}.`,
        assignedAt: status === 'NEW' ? null : hoursAgo(24 - i * 2),
        createdAt: hoursAgo(200 - i * 6),
        lastActivityAt: hoursAgo(30 - i),
        tags: i % 3 === 0 ? { connect: [{ id: tags[i % tags.length].id }] } : undefined,
      },
    });
    leadRows.push(created);
  }

  // ─────────────────────────────────────────────
  // CALLS (with recordings)
  // ─────────────────────────────────────────────
  const outcomes = ['CONNECTED', 'INTERESTED', 'NOT_INTERESTED', 'CALL_BACK_REQUESTED', 'NO_ANSWER', 'ORDER_CONFIRMED', 'BUSY'];
  const directions = ['INBOUND', 'OUTBOUND'];
  const callStatuses = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'MISSED', 'FAILED'];

  const calls = [];
  for (let i = 0; i < 26; i++) {
    const agent = agents[i % agents.length];
    const cust = customers[i % customers.length];
    const lead = leadRows[i % leadRows.length];
    const outcome = outcomes[i % outcomes.length];
    const direction = directions[i % directions.length] as 'INBOUND' | 'OUTBOUND';
    const duration = outcome === 'NO_ANSWER' || outcome === 'BUSY' ? 12 : 45 + (i % 4) * 60;
    const rec = await prisma.callRecording.create({
      data: {
        status: 'READY',
        durationSecs: duration,
        recordingUrl: `https://storage.example.com/recordings/call-${1000 + i}.mp3`,
      },
    });
    const call = await prisma.call.create({
      data: {
        callSid: `CA${100000 + i}`,
        provider: 'EXOTEL',
        leadId: lead.id,
        customerId: cust.id,
        agentId: agent.id,
        direction,
        status: callStatuses[i % callStatuses.length] as never,
        outcome: outcome as never,
        durationSecs: duration,
        dialedNumber: cust.phone,
        startedAt: hoursAgo(120 - i * 3),
        completedAt: hoursAgo(120 - i * 3 - 1),
        recordingId: rec.id,
        notes: `Discussed ${lead.title?.toLowerCase() ?? 'enquiry'}. Outcome: ${outcome}.`,
        metadata: { agentName: agent.fullName, outcome },
      },
    });
    calls.push(call);
  }

  // ─────────────────────────────────────────────
  // ORDERS (with items, payments, invoices, shipments)
  // ─────────────────────────────────────────────
  const orderStatuses = ['PENDING', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'DELIVERED', 'CANCELLED', 'RETURNED'];
  const paymentStatuses = ['PENDING', 'PAID', 'PAID', 'PAID', 'PAID', 'REFUNDED', 'PENDING', 'FAILED'];
  const methods = ['UPI', 'CARD', 'COD', 'CASH', 'NET_BANKING', 'UPI'];

  let orderSeq = 100;
  const orderRows = [];
  for (let i = 0; i < 18; i++) {
    const agent = agents[i % agents.length];
    const cust = customers[i % customers.length];
    const p1 = productRows[i % productRows.length];
    const p2 = productRows[(i + 3) % productRows.length];
    const qty1 = 1 + (i % 2);
    const qty2 = 1;
    const unitPrice1 = Number(p1.price);
    const unitPrice2 = Number(p2.price);
    const line1 = unitPrice1 * qty1;
    const line2 = unitPrice2 * qty2;
    const itemsTotal = line1 + line2;
    const discount = i % 3 === 0 ? 200 : 0;
    const gstTotal = Math.round(((itemsTotal - discount) * 0.18) * 100) / 100;
    const shipping = itemsTotal > 5000 ? 0 : 49;
    const total = Math.round((itemsTotal - discount + gstTotal + shipping) * 100) / 100;
    const placedAt = hoursAgo(200 - i * 9);
    orderSeq += 1;

    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${String(orderSeq).padStart(6, '0')}`,
        customerId: cust.id,
        agentId: agent.id,
        leadId: i % 2 === 0 ? leadRows[i % leadRows.length].id : undefined,
        status: orderStatuses[i % orderStatuses.length] as never,
        paymentStatus: paymentStatuses[i % paymentStatuses.length] as never,
        itemsTotal,
        discount,
        gstTotal,
        shippingCharges: shipping,
        total,
        notes: i % 4 === 0 ? 'Customer asked for gift wrap' : undefined,
        placedAt,
        createdAt: placedAt,
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: p1.id,
        quantity: qty1,
        unitPrice: unitPrice1,
        lineTotal: line1,
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: p2.id,
        quantity: qty2,
        unitPrice: unitPrice2,
        lineTotal: line2,
      },
    });

    // Invoice for every order
    await prisma.orderInvoice.create({
      data: {
        invoiceNumber: `INV-${String(orderSeq).padStart(6, '0')}`,
        orderId: order.id,
        status: order.paymentStatus === 'PAID' ? 'PAID' : 'ISSUED',
        totalAmount: total,
        gstBreakup: { cgst: gstTotal / 2, sgst: gstTotal / 2 },
        issuedAt: placedAt,
        dueAt: new Date(placedAt.getTime() + 14 * 86400000),
        paidAt: order.paymentStatus === 'PAID' ? hoursAgo(200 - i * 9 + 1) : null,
      },
    });

    // Payment for paid orders
    if (order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: total,
          method: methods[i % methods.length] as never,
          status: order.paymentStatus === 'REFUNDED' ? 'REFUNDED' : 'PAID',
          transactionId: `TXN${9000000 + orderSeq}`,
          currency: 'INR',
          receivedById: userRows.get('finance@callcenter.local')!.id,
          paidAt: hoursAgo(200 - i * 9 + 2),
        },
      });
    }

    // Shipment for dispatched/delivered orders
    if (['DISPATCHED', 'DELIVERED', 'RETURNED'].includes(order.status)) {
      await prisma.orderShipment.create({
        data: {
          orderId: order.id,
          courierName: i % 2 === 0 ? 'BlueDart' : 'Delhivery',
          trackingId: `BLD${3000000 + orderSeq}`,
          status: order.status === 'DELIVERED' ? 'DELIVERED' : order.status === 'RETURNED' ? 'RETURNED' : 'IN_TRANSIT',
          shippedAt: hoursAgo(200 - i * 9 + 3),
          deliveredAt: order.status === 'DELIVERED' ? hoursAgo(200 - i * 9 + 20) : null,
          address: {
            line1: `${cust.name}'s address`,
            city: cust.city,
            state: cust.state,
            pincode: cust.pincode ?? '400001',
          },
        },
      });
    }

    // Stock movement
    await prisma.stockMovement.create({
      data: {
        productId: p1.id,
        quantity: -qty1,
        reason: 'Order sale',
        reference: order.orderNumber,
        userId: agent.id,
        createdAt: placedAt,
      },
    });

    orderRows.push(order);
  }

  // ─────────────────────────────────────────────
  // TODAY'S ACTIVITY (so agent dashboards look alive)
  // ─────────────────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const agent = agents[i % agents.length];
    const cust = customers[i % customers.length];
    const source = sources[i % sources.length];
    const created = await prisma.lead.create({
      data: {
        customerId: cust.id,
        agentId: agent.id,
        teamId: agent.teamId,
        sourceId: source.id,
        status: 'NEW',
        priority: 'HIGH',
        title: `Fresh enquiry: ${leadTitles[i]}`,
        description: `New lead received today from ${source.name}.`,
        assignedAt: new Date(),
        createdAt: new Date(Date.now() - i * 3600000),
        lastActivityAt: new Date(Date.now() - i * 1800000),
      },
    });
    leadRows.push(created);
  }

  for (let i = 0; i < 3; i++) {
    const agent = agents[i % agents.length];
    const cust = customers[i % customers.length];
    const lead = leadRows[leadRows.length - 3 + i];
    const duration = 90 + i * 45;
    const rec = await prisma.callRecording.create({
      data: { status: 'READY', durationSecs: duration, recordingUrl: `https://storage.example.com/recordings/today-${100 + i}.mp3` },
    });
    await prisma.call.create({
      data: {
        callSid: `CAT${500000 + i}`,
        provider: 'EXOTEL',
        leadId: lead.id,
        customerId: cust.id,
        agentId: agent.id,
        direction: 'OUTBOUND',
        status: 'COMPLETED',
        outcome: i === 0 ? 'INTERESTED' : i === 1 ? 'CALL_BACK_REQUESTED' : 'CONNECTED',
        durationSecs: duration,
        dialedNumber: cust.phone,
        startedAt: new Date(Date.now() - i * 5400000),
        completedAt: new Date(Date.now() - i * 5400000 + duration * 1000),
        recordingId: rec.id,
        notes: `Today's follow-up call with ${cust.name}.`,
        metadata: { agentName: agent.fullName },
      },
    });
  }

  for (let i = 0; i < 3; i++) {
    const agent = agents[i % agents.length];
    const cust = customers[i % customers.length];
    const lead = leadRows[leadRows.length - 3 + i];
    await prisma.followUp.create({
      data: {
        leadId: lead.id,
        customerId: cust.id,
        agentId: agent.id,
        scheduledFor: new Date(Date.now() + (i + 2) * 3600000),
        completedAt: null,
        isDone: false,
        title: 'Follow up on today\'s enquiry',
        description: `Re-connect with ${cust.name} about their enquiry.`,
      },
    });
  }

  const todayOrderAgent = agents[0];
  const todayCust = customers[0];
  orderSeq += 1;
  const todaysOrder = await prisma.order.create({
    data: {
      orderNumber: `ORD-${String(orderSeq).padStart(6, '0')}`,
      customerId: todayCust.id,
      agentId: todayOrderAgent.id,
      status: 'CONFIRMED',
      paymentStatus: 'PENDING',
      itemsTotal: 2499,
      discount: 0,
      gstTotal: 449.82,
      shippingCharges: 49,
      total: 2997.82,
      placedAt: new Date(Date.now() - 2 * 3600000),
      createdAt: new Date(Date.now() - 2 * 3600000),
    },
  });
  await prisma.orderItem.create({
    data: {
      orderId: todaysOrder.id,
      productId: productRows[0].id,
      quantity: 1,
      unitPrice: 2499,
      lineTotal: 2499,
    },
  });
  await prisma.orderInvoice.create({
    data: {
      invoiceNumber: `INV-${String(orderSeq).padStart(6, '0')}`,
      orderId: todaysOrder.id,
      status: 'ISSUED',
      totalAmount: 2997.82,
      gstBreakup: { cgst: 224.91, sgst: 224.91 },
      issuedAt: new Date(Date.now() - 2 * 3600000),
    },
  });
  orderRows.push(todaysOrder);

  // ─────────────────────────────────────────────
  // FOLLOW-UPS
  // ─────────────────────────────────────────────
  const followUpTitles = [
    'Call back for earbuds deal',
    'Confirm delivery slot',
    'Follow up on laptop quote',
    'Send WhatsApp catalog',
    'Payment reminder',
    'Check interest in smartwatch',
  ];
  for (let i = 0; i < 10; i++) {
    const agent = agents[i % agents.length];
    const cust = customers[i % customers.length];
    const lead = leadRows[i % leadRows.length];
    const isDone = i % 2 === 0;
    const scheduled = isDone ? hoursAgo(30 - i) : new Date(Date.now() + (i + 1) * 3600000 * 6);
    await prisma.followUp.create({
      data: {
        leadId: lead.id,
        customerId: cust.id,
        agentId: agent.id,
        scheduledFor: scheduled,
        completedAt: isDone ? hoursAgo(30 - i - 1) : null,
        isDone,
        title: followUpTitles[i % followUpTitles.length],
        description: `Follow-up regarding ${lead.title?.toLowerCase() ?? 'customer enquiry'}.`,
      },
    });
  }

  // ─────────────────────────────────────────────
  // NOTES + ACTIVITIES + NOTIFICATIONS
  // ─────────────────────────────────────────────
  const noteBodies = [
    'Customer prefers WhatsApp communication. Avoid calls after 8 PM.',
    'Interested in the ANC headphones once price drops below ₹5,500.',
    'Has a corporate discount request — discuss with manager.',
    'Complained about delayed delivery last time. Prioritize this order.',
    'Requested order on COD. Verify address before dispatch.',
    'Asked about EMI options for the Ultrabook.',
    'Prefers to visit store for pickup instead of shipping.',
    'Family member usually places the order — save both numbers.',
  ];
  for (let i = 0; i < 8; i++) {
    const cust = customers[i % customers.length];
    const agent = agents[i % agents.length];
    await prisma.note.create({
      data: {
        userId: agent.id,
        customerId: cust.id,
        leadId: leadRows[i % leadRows.length].id,
        body: noteBodies[i],
        pinned: i === 0,
        createdAt: hoursAgo(90 - i * 7),
      },
    });
  }

  for (let i = 0; i < 6; i++) {
    const agent = agents[i % agents.length];
    const cust = customers[i % customers.length];
    await prisma.notification.create({
      data: {
        userId: agent.id,
        type: 'SYSTEM',
        title: 'New lead assigned',
        body: `New lead "${leadRows[i].title}" assigned to you.`,
        entity: 'LEAD',
        entityId: leadRows[i].id,
        readAt: i % 2 === 0 ? hoursAgo(10) : null,
        createdAt: hoursAgo(30 - i),
      },
    });
  }

  await prisma.notification.create({
    data: {
      userId: admin!.id,
      type: 'SYSTEM',
      title: 'Demo environment ready',
      body: 'Sample data seeded. Explore dashboards, customers, orders and reports.',
      entity: 'SYSTEM',
      readAt: null,
      createdAt: new Date(),
    },
  });

  // System settings
  const settings = [
    { key: 'company.name', value: 'Call Center CRM', description: 'Company display name' },
    { key: 'company.currency', value: 'INR', description: 'Default currency' },
    { key: 'company.timezone', value: 'Asia/Kolkata', description: 'Default timezone' },
    { key: 'calls.default_outcome', value: 'CONNECTED', description: 'Default call outcome' },
    { key: 'orders.gst_rate', value: 18, description: 'Default GST rate (%)' },
    { key: 'notifications.sms_enabled', value: true, description: 'Enable SMS notifications' },
  ];
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value, description: s.description },
      create: { key: s.key, value: s.value as never, description: s.description, updatedById: admin!.id },
    });
  }

  // Audit trail
  await prisma.auditLog.create({
    data: {
      userId: admin!.id,
      action: 'OTHER',
      entity: 'System',
      entityId: null,
      newValue: { message: 'Demo data seeded' },
      ipAddress: '127.0.0.1',
      userAgent: 'seed',
      reason: 'Seed script',
    },
  });

  console.log('✅ Seed complete');
  console.log('');
  console.log('── DEMO LOGINS ──────────────────────────────');
  console.log('Admin    : admin@callcenter.local  / Admin@12345');
  console.log('Manager  : manager@callcenter.local  / Admin@12345');
  console.log('TeamLead : tl@callcenter.local  / Admin@12345');
  console.log('Agents   : agent.rahul@callcenter.local');
  console.log('           agent.sneha@callcenter.local');
  console.log('           agent.vikram@callcenter.local');
  console.log('           agent.pooja@callcenter.local');
  console.log('Ops      : dispatcher@callcenter.local / finance@callcenter.local / qa@callcenter.local / delivery@callcenter.local');
  console.log('Other    : support@callcenter.local / viewer@callcenter.local');
  console.log('All passwords: Admin@12345');
  console.log('────────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
