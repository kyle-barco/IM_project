const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/auth');
const prisma = require('../config/db');

router.use(requireRole('VENDOR'));

// For demo: vendor sees stall A1
async function getVendor(req) {
  // In production, link users to vendors via a vendorId on the User model
  return await prisma.vendor.findFirst({ orderBy: { id: 'asc' } });
}

// Dashboard: live order queue
router.get('/dashboard', async (req, res) => {
  const vendor = await getVendor(req);
  const orders = await prisma.$queryRaw`
    SELECT o.id, o.status, o."createdAt", u.username AS student,
           SUM(ol.quantity * ol."unitPrice") AS subtotal
    FROM orders o
    JOIN users u ON o."studentId" = u.id
    JOIN order_lines ol ON ol."orderId" = o.id
    JOIN menu_items mi ON ol."itemId" = mi.id
    WHERE mi."vendorId" = ${vendor.id}
      AND o.status IN ('PENDING','PREPARING','READY')
    GROUP BY o.id, u.username
    ORDER BY o."createdAt" ASC
  `;
  res.render('vendor/dashboard', { title: 'Order Queue – ByteMarket', vendor, orders });
});

// Update order status
router.post('/orders/:id/status', async (req, res) => {
  const { status } = req.body;
  await prisma.order.update({ where: { id: parseInt(req.params.id) }, data: { status } });
  req.flash('success', `Order #${req.params.id} marked as ${status}.`);
  res.redirect('/vendor/dashboard');
});

// Menu management
router.get('/menu', async (req, res) => {
  const vendor = await getVendor(req);
  const items = await prisma.menuItem.findMany({ where: { vendorId: vendor.id }, orderBy: { category: 'asc' } });
  res.render('vendor/menu', { title: 'Manage Menu – ByteMarket', vendor, items });
});

// Add menu item
router.post('/menu', async (req, res) => {
  const vendor = await getVendor(req);
  const { name, description, price, stockQuantity, category } = req.body;
  await prisma.menuItem.create({
    data: { name, description, price: parseFloat(price), stockQuantity: parseInt(stockQuantity), category, vendorId: vendor.id },
  });
  req.flash('success', 'Menu item added.');
  res.redirect('/vendor/menu');
});

// Update stock
router.post('/menu/:id/stock', async (req, res) => {
  const { stockQuantity } = req.body;
  await prisma.menuItem.update({ where: { id: parseInt(req.params.id) }, data: { stockQuantity: parseInt(stockQuantity) } });
  req.flash('success', 'Stock updated.');
  res.redirect('/vendor/menu');
});

// Toggle item availability
router.post('/menu/:id/toggle', async (req, res) => {
  const item = await prisma.menuItem.findUnique({ where: { id: parseInt(req.params.id) } });
  await prisma.menuItem.update({ where: { id: parseInt(req.params.id) }, data: { isAvailable: !item.isAvailable } });
  res.redirect('/vendor/menu');
});

// Sales report
router.get('/sales', async (req, res) => {
  const vendor = await getVendor(req);
  const salesData = await prisma.$queryRaw`
    SELECT mi.name, SUM(ol.quantity) AS units_sold,
           SUM(ol.quantity * ol."unitPrice") AS total_revenue
    FROM order_lines ol
    JOIN menu_items mi ON ol."itemId" = mi.id
    JOIN orders o ON ol."orderId" = o.id
    WHERE mi."vendorId" = ${vendor.id}
      AND o.status = 'COMPLETED'
    GROUP BY mi.name
    ORDER BY total_revenue DESC
  `;
  const totalRevenue = salesData.reduce((s, r) => s + parseFloat(r.total_revenue || 0), 0);
  res.render('vendor/sales', { title: 'Sales Report – ByteMarket', vendor, salesData, totalRevenue });
});

module.exports = router;
