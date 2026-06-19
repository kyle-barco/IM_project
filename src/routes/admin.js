const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/auth');
const prisma = require('../config/db');

router.use(requireRole('ADMIN'));

// Dashboard: aggregate analytics
router.get('/dashboard', async (req, res) => {
  const [totalOrders, totalRevenue, topItems, vendors] = await Promise.all([
    prisma.order.count(),
    prisma.$queryRaw`SELECT COALESCE(SUM("totalPrice"), 0) AS revenue FROM orders WHERE status = 'COMPLETED'`,
    prisma.$queryRaw`
      SELECT mi.name, v.name AS vendor, SUM(ol.quantity) AS units_sold,
             SUM(ol.quantity * ol."unitPrice") AS revenue
      FROM order_lines ol
      JOIN menu_items mi ON ol."itemId" = mi.id
      JOIN vendors v ON mi."vendorId" = v.id
      JOIN orders o ON ol."orderId" = o.id
      WHERE o.status = 'COMPLETED'
      GROUP BY mi.name, v.name
      ORDER BY revenue DESC LIMIT 5
    `,
    prisma.vendor.findMany({ include: { _count: { select: { menuItems: true } } } }),
  ]);

  res.render('admin/dashboard', {
    title: 'Admin Dashboard – ByteMarket',
    totalOrders,
    totalRevenue: parseFloat(totalRevenue[0]?.revenue || 0),
    topItems,
    vendors,
  });
});

// Vendor management
router.get('/vendors', async (req, res) => {
  const vendors = await prisma.vendor.findMany({ include: { _count: { select: { menuItems: true } } } });
  res.render('admin/vendors', { title: 'Manage Vendors – ByteMarket', vendors });
});

router.post('/vendors', async (req, res) => {
  const { name, stallNumber, description } = req.body;
  try {
    await prisma.vendor.create({ data: { name, stallNumber, description } });
    req.flash('success', 'Vendor added.');
  } catch {
    req.flash('error', 'Stall number already exists.');
  }
  res.redirect('/admin/vendors');
});

router.post('/vendors/:id/toggle', async (req, res) => {
  const vendor = await prisma.vendor.findUnique({ where: { id: parseInt(req.params.id) } });
  await prisma.vendor.update({ where: { id: parseInt(req.params.id) }, data: { isOpen: !vendor.isOpen } });
  res.redirect('/admin/vendors');
});

// ── Menu Management ──────────────────────────────────────
router.get('/menu', async (req, res) => {
  const items = await prisma.menuItem.findMany({
    include: { vendor: true },
    orderBy: [{ vendorId: 'asc' }, { category: 'asc' }],
  });
  const vendors = await prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  const apiVendors = await prisma.vendor.findMany({ where: { stallNumber: { startsWith: 'API-' } }, select: { id: true } });
  const apiVendorIds = new Set(apiVendors.map(v => v.id));
  res.render('admin/menu', { title: 'Manage Menu – ByteMarket', items, vendors, apiVendorIds });
});

router.post('/menu', async (req, res) => {
  const { name, description, price, stockQuantity, category, vendorId } = req.body;
  try {
    await prisma.menuItem.create({
      data: { name, description, price: parseFloat(price), stockQuantity: parseInt(stockQuantity), category, vendorId: parseInt(vendorId) },
    });
    req.flash('success', 'Menu item added.');
  } catch {
    req.flash('error', 'Failed to add menu item.');
  }
  res.redirect('/admin/menu');
});

router.post('/menu/:id/edit', async (req, res) => {
  const { name, description, price, stockQuantity, category, vendorId } = req.body;
  try {
    await prisma.menuItem.update({
      where: { id: parseInt(req.params.id) },
      data: { name, description, price: parseFloat(price), stockQuantity: parseInt(stockQuantity), category, vendorId: parseInt(vendorId) },
    });
    req.flash('success', 'Menu item updated.');
  } catch {
    req.flash('error', 'Failed to update menu item.');
  }
  res.redirect('/admin/menu');
});

router.post('/menu/:id/delete', async (req, res) => {
  await prisma.menuItem.delete({ where: { id: parseInt(req.params.id) } });
  req.flash('success', 'Menu item deleted.');
  res.redirect('/admin/menu');
});

// ── User Management ──────────────────────────────────────
router.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { role: 'asc' } });
  res.render('admin/users', { title: 'Users – ByteMarket', users });
});

router.post('/users/:id/edit', async (req, res) => {
  const { username, role } = req.body;
  const targetId = parseInt(req.params.id);

  // Cannot change your own role
  if (targetId === req.session.user.id) {
    req.flash('error', 'Cannot edit your own account.');
    return res.redirect('/admin/users');
  }

  try {
    await prisma.user.update({
      where: { id: targetId },
      data: { username, role },
    });
    req.flash('success', 'User updated.');
  } catch {
    req.flash('error', 'Failed to update user.');
  }
  res.redirect('/admin/users');
});

router.post('/users/:id/delete', async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.session.user.id) {
    req.flash('error', 'Cannot delete your own account.');
    return res.redirect('/admin/users');
  }
  await prisma.user.delete({ where: { id: targetId } });
  req.flash('success', 'User deleted.');
  res.redirect('/admin/users');
});

// ── Order Management ─────────────────────────────────────
router.get('/orders', async (req, res) => {
  const orders = await prisma.order.findMany({
    include: { student: true, orderLines: { include: { menuItem: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.render('admin/orders', { title: 'All Orders – ByteMarket', orders });
});

router.get('/orders/:id', async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: parseInt(req.params.id) },
    include: { student: true, orderLines: { include: { menuItem: { include: { vendor: true } } } } },
  });
  if (!order) { req.flash('error', 'Order not found.'); return res.redirect('/admin/orders'); }
  res.render('admin/order-detail', { title: `Order #${order.id} – ByteMarket`, order });
});

router.post('/orders/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];
  if (!validStatuses.includes(status)) {
    req.flash('error', 'Invalid status.');
    return res.redirect('/admin/orders');
  }
  await prisma.order.update({ where: { id: parseInt(req.params.id) }, data: { status } });
  req.flash('success', `Order #${req.params.id} marked as ${status}.`);
  res.redirect('/admin/orders');
});

module.exports = router;
