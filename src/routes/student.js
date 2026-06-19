const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/auth');
const prisma = require('../config/db');

router.use(requireRole('STUDENT', 'VENDOR'));

// Cart page
router.get('/cart', (req, res) => {
  const cart = req.session.cart || [];
  res.render('student/cart', { title: 'Your Cart – ByteMarket', cart });
});

// Cart count (JSON) for live badge updates
router.get('/cart/count', (req, res) => {
  const cart = req.session.cart || [];
  const count = cart.reduce((s, c) => s + c.quantity, 0);
  res.json({ count });
});

// Add to cart (stores in session)
router.post('/cart/add', async (req, res) => {
  const { itemId, quantity, apiItem, name, price, vendorName, category, description } = req.body;
  const qty = parseInt(quantity) || 1;

  // API menu items: create in local DB on-the-fly
  if (apiItem === 'true') {
    let apiVendor = await prisma.vendor.findFirst({
      where: { name: 'International Food Court' }
    });
    if (!apiVendor) {
      apiVendor = await prisma.vendor.create({
        data: {
          name: 'International Food Court',
          stallNumber: 'API-001',
          description: 'Global dishes from our API partners',
          isOpen: true,
        }
      });
    }

    let menuItem = await prisma.menuItem.findFirst({
      where: { name, vendorId: apiVendor.id }
    });

    if (!menuItem) {
      menuItem = await prisma.menuItem.create({
        data: {
          name,
          description: description || '',
          price: parseFloat(price) || 0,
          stockQuantity: 999,
          isAvailable: true,
          category: category || 'general',
          vendorId: apiVendor.id,
        },
        include: { vendor: true }
      });
    } else {
      await prisma.menuItem.update({
        where: { id: menuItem.id },
        data: { stockQuantity: 999 }
      });
    }

    req.session.cart = req.session.cart || [];
    const existing = req.session.cart.find(c => c.itemId === menuItem.id);
    if (existing) {
      existing.quantity += qty;
    } else {
      req.session.cart.push({
        itemId: menuItem.id,
        name: menuItem.name,
        price: parseFloat(menuItem.price),
        vendorName: vendorName || 'International Food Court',
        vendorId: menuItem.vendorId,
        quantity: qty,
      });
    }
    req.flash('success', `${menuItem.name} added to cart.`);
    return res.redirect('/student/api-menu');
  }

  // Normal flow: internal DB menu items
  const item = await prisma.menuItem.findUnique({
    where: { id: parseInt(itemId) },
    include: { vendor: true },
  });
  if (!item || item.stockQuantity < qty) {
    req.flash('error', 'Item unavailable or insufficient stock.');
    return res.redirect('/student/api-menu');
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
  res.redirect('/student/api-menu');
});

// Remove from cart

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

// Order count (JSON) for badge — active orders only
router.get('/orders/count', async (req, res) => {
  const count = await prisma.order.count({
    where: {
      studentId: req.session.user.id,
      status: { in: ['PENDING', 'PREPARING', 'READY'] },
    }
  });
  res.json({ count });
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

// Cancel a pending order
router.post('/orders/:id/cancel', async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: parseInt(req.params.id), studentId: req.session.user.id, status: 'PENDING' },
  });
  if (!order) { req.flash('error', 'Order not found or cannot be cancelled.'); return res.redirect('/student/orders'); }
  await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
  req.flash('success', `Order #${order.id} cancelled.`);
  res.redirect('/student/orders');
});

// ── API menu cache ──────────────────────────────────────────
let menuCache = null;
let menuCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;
const FETCH_TIMEOUT = 5000;
const BATCH_SIZE = 4;

const CATEGORIES = [
  'burgers', 'pizzas', 'best-foods', 'fried-chicken',
  'drinks', 'desserts', 'ice-cream', 'sandwiches',
  'steaks', 'bbqs', 'breads', 'chocolates', 'porks', 'sausages',
];

async function fetchCategory(cat) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(`https://free-food-menus-api-two.vercel.app/${cat}`, {
      signal: controller.signal,
    });
    if (!res.ok) return { category: cat, items: [] };
    const data = await res.json();
    return { category: cat, items: Array.isArray(data) ? data : [] };
  } catch {
    return { category: cat, items: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllMenu() {
  const results = [];
  for (let i = 0; i < CATEGORIES.length; i += BATCH_SIZE) {
    const batch = CATEGORIES.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(fetchCategory));
    results.push(...batchResults);
  }
  return results.filter(c => c.items.length > 0);
}

// Browse external food menu from free API (cached)
router.get('/api-menu', async (req, res) => {
  try {
    const now = Date.now();
    if (!menuCache || now - menuCacheTime > CACHE_TTL) {
      menuCache = await fetchAllMenu();
      menuCacheTime = now;
    }

    // Load real stock from DB for API items that have been ordered
    const apiVendor = await prisma.vendor.findFirst({
      where: { name: 'International Food Court' },
      include: { menuItems: true },
    });
    const stockMap = {};
    if (apiVendor) {
      apiVendor.menuItems.forEach(item => {
        stockMap[item.name] = item.stockQuantity;
      });
    }

    res.render('student/api-menu', {
      title: 'Food Menu – ByteMarket',
      menu: menuCache,
      stockMap,
    });
  } catch (err) {
    console.error(err);
    if (!menuCache) {
      return res.render('student/api-menu', { title: 'Food Menu – ByteMarket', menu: [], stockMap: {} });
    }
    res.render('student/api-menu', { title: 'Food Menu – ByteMarket', menu: menuCache, stockMap: {} });
  }
});

module.exports = router;
