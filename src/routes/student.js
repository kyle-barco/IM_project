const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/auth');
const prisma = require('../config/db');

router.use(requireRole('STUDENT'));

// Browse all vendors & menu
router.get('/menu', async (req, res) => {
  const vendors = await prisma.vendor.findMany({
    where: { isOpen: true },
    include: { menuItems: { where: { isAvailable: true, stockQuantity: { gt: 0 } } } },
    orderBy: { stallNumber: 'asc' },
  });
  res.render('student/menu', { title: 'Food Court – ByteMarket', vendors });
});

// Cart page
router.get('/cart', (req, res) => {
  const cart = req.session.cart || [];
  res.render('student/cart', { title: 'Your Cart – ByteMarket', cart });
});

// Add to cart (stores in session)
router.post('/cart/add', async (req, res) => {
  const { itemId, quantity } = req.body;
  const qty = parseInt(quantity) || 1;
  const item = await prisma.menuItem.findUnique({
    where: { id: parseInt(itemId) },
    include: { vendor: true },
  });
  if (!item || item.stockQuantity < qty) {
    req.flash('error', 'Item unavailable or insufficient stock.');
    return res.redirect('/student/menu');
  }

  req.session.cart = req.session.cart || [];
  const existing = req.session.cart.find(c => c.itemId === item.id);
  if (existing) {
    existing.quantity += qty;
  } else {
    req.session.cart.push({
      itemId: item.id,
      name: item.name,
      price: parseFloat(item.price),
      vendorName: item.vendor.name,
      vendorId: item.vendorId,
      quantity: qty,
    });
  }
  req.flash('success', `${item.name} added to cart.`);
  res.redirect('/student/menu');
});

// Remove from cart
router.post('/cart/remove', (req, res) => {
  const { itemId } = req.body;
  req.session.cart = (req.session.cart || []).filter(c => c.itemId !== parseInt(itemId));
  res.redirect('/student/cart');
});

// Checkout — create order
router.post('/checkout', async (req, res) => {
  const cart = req.session.cart || [];
  if (!cart.length) {
    req.flash('error', 'Your cart is empty.');
    return res.redirect('/student/cart');
  }

  const total = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);

  try {
    // Use raw SQL for the ORDER INSERT as per project spec
    const orderResult = await prisma.$queryRaw`
      INSERT INTO orders ("studentId", "totalPrice", status, "createdAt")
      VALUES (${req.session.user.id}, ${total}, 'PENDING', NOW())
      RETURNING id
    `;
    const orderId = orderResult[0].id;

    // Insert order lines and decrement stock
    for (const item of cart) {
      await prisma.$queryRaw`
        INSERT INTO order_lines ("orderId", "itemId", quantity, "unitPrice")
        VALUES (${orderId}, ${item.itemId}, ${item.quantity}, ${item.price})
      `;
      await prisma.$queryRaw`
        UPDATE menu_items SET "stockQuantity" = "stockQuantity" - ${item.quantity}
        WHERE id = ${item.itemId}
      `;
    }

    req.session.cart = [];
    req.flash('success', 'Order placed successfully!');
    res.redirect(`/student/orders/${orderId}`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Checkout failed. Please try again.');
    res.redirect('/student/cart');
  }
});

// Order history
router.get('/orders', async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { studentId: req.session.user.id },
    include: { orderLines: { include: { menuItem: { include: { vendor: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.render('student/orders', { title: 'My Orders – ByteMarket', orders });
});

// Single order receipt
router.get('/orders/:id', async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: parseInt(req.params.id), studentId: req.session.user.id },
    include: { orderLines: { include: { menuItem: { include: { vendor: true } } } } },
  });
  if (!order) { req.flash('error', 'Order not found.'); return res.redirect('/student/orders'); }
  res.render('student/receipt', { title: `Order #${order.id} – ByteMarket`, order });
});

module.exports = router;
