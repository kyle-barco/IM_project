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

// All orders
router.get('/orders', async (req, res) => {
  const orders = await prisma.order.findMany({
    include: { student: true, orderLines: { include: { menuItem: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.render('admin/orders', { title: 'All Orders – ByteMarket', orders });
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

// User management
router.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { role: 'asc' } });
  res.render('admin/users', { title: 'Users – ByteMarket', users });
});

module.exports = router;
