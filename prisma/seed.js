require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const VENDOR_MAP = {
  burgers:        'Burger Station',
  pizzas:         'Pizza Corner',
  'best-foods':   'Best Bites',
  'fried-chicken': 'Crispy Chick',
  drinks:         'Sip & Go',
  desserts:       'Sweet Spot',
  'ice-cream':    'Chill Zone',
  sandwiches:     'Sandwich Hub',
  steaks:         'Grill House',
  bbqs:           'BBQ Pit',
  breads:         'The Bakery',
  chocolates:     'Choco World',
  porks:          'Pork Palace',
  sausages:       'Sausage Co.',
};

function stallSlug(name) {
  return 'API-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function userSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  console.log('Seeding database...');

  // ── Create / update all vendor records ──────────────────
  const localVendors = [
    { name: "Mama's Kitchen", stallNumber: 'A1', description: 'Home-cooked Filipino meals' },
    { name: 'Silog Masters',  stallNumber: 'A2', description: 'All-day breakfast silog meals' },
    { name: 'Sip & Chill',    stallNumber: 'B1', description: 'Cold drinks, milk tea, and refreshments' },
  ];

  const apiVendorDefs = Object.entries(VENDOR_MAP).map(([cat, name]) => ({
    name,
    stallNumber: stallSlug(name),
    description: `Food stall serving ${cat.replace(/-/g, ' ')}`,
  }));

  const allVendorDefs = [...localVendors, ...apiVendorDefs];

  // Upsert all vendors and collect them
  const vendorRecords = {};
  for (const def of allVendorDefs) {
    const v = await prisma.vendor.upsert({
      where: { stallNumber: def.stallNumber },
      update: { name: def.name, description: def.description },
      create: { name: def.name, stallNumber: def.stallNumber, description: def.description, isOpen: true },
    });
    vendorRecords[def.name] = v;
  }

  // ── Create user accounts for each vendor ────────────────
  // vendor1 → Mama's Kitchen (backward-compat, skip dupe mamas-kitchen)
  const genericAccounts = [
    { username: 'vendor1', password: 'vendor123', vendorName: "Mama's Kitchen" },
  ];

  const perVendorAccounts = allVendorDefs
    .filter(def => def.name !== "Mama's Kitchen") // covered by vendor1
    .map(def => ({
      username: userSlug(def.name),
      password: userSlug(def.name),
      vendorName: def.name,
    }));

  const vendorUserDefs = [...genericAccounts, ...perVendorAccounts];
  for (const def of vendorUserDefs) {
    const vendor = vendorRecords[def.vendorName];
    if (!vendor) {
      console.warn(`  ⚠ Vendor record not found for "${def.vendorName}", skipping user ${def.username}`);
      continue;
    }
    await prisma.user.upsert({
      where: { username: def.username },
      update: { vendorId: vendor.id },
      create: {
        username: def.username,
        password: await bcrypt.hash(def.password, 10),
        role: 'VENDOR',
        vendorId: vendor.id,
      },
    });
  }

  // ── Admin & Student (unchanged) ─────────────────────────
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password: await bcrypt.hash('admin123', 10), role: 'ADMIN' },
  });

  await prisma.user.upsert({
    where: { username: 'student1' },
    update: {},
    create: { username: 'student1', password: await bcrypt.hash('student123', 10), role: 'STUDENT' },
  });

  // ── Menu items for DB-based vendors ─────────────────────
  const mamasKitchen = vendorRecords["Mama's Kitchen"];
  const silogMasters = vendorRecords['Silog Masters'];
  const sipChill     = vendorRecords['Sip & Chill'];

  const menuItems = [
    { name: 'Adobo Rice Meal',   price: 75, stock: 20, category: 'Rice Meals', vendorId: mamasKitchen.id, description: 'Classic chicken adobo with steamed rice' },
    { name: 'Sinigang na Baboy', price: 85, stock: 15, category: 'Soups',      vendorId: mamasKitchen.id, description: 'Pork sinigang with vegetables' },
    { name: 'Pork Nilaga',       price: 80, stock: 10, category: 'Soups',      vendorId: mamasKitchen.id, description: 'Tender pork nilaga with potatoes' },
    { name: 'Tapsilog',          price: 70, stock: 25, category: 'Silog',      vendorId: silogMasters.id, description: 'Beef tapa, sinangag, itlog' },
    { name: 'Longsilog',         price: 65, stock: 25, category: 'Silog',      vendorId: silogMasters.id, description: 'Longganisa, sinangag, itlog' },
    { name: 'Bangsilog',         price: 75, stock: 20, category: 'Silog',      vendorId: silogMasters.id, description: 'Bangus, sinangag, itlog' },
    { name: 'Milk Tea (Large)',  price: 65, stock: 50, category: 'Milk Tea',   vendorId: sipChill.id,     description: 'Classic milk tea with pearls' },
    { name: 'Fresh Buko Juice',  price: 35, stock: 30, category: 'Juices',     vendorId: sipChill.id,     description: 'Fresh buko juice with coconut meat' },
    { name: 'Iced Coffee',       price: 45, stock: 40, category: 'Coffee',     vendorId: sipChill.id,     description: 'Creamy iced coffee' },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.create({ data: { name: item.name, price: item.price, stockQuantity: item.stock, category: item.category, vendorId: item.vendorId, description: item.description } });
  }

  console.log('Seeding complete!');
  console.log('\n── Logins ──────────────────────────────────');
  console.log('  admin / admin123');
  console.log('  student1 / student123');
  console.log('');
  console.log('  All vendor passwords match their username:');
  console.log('  vendor1 / vendor123');
  for (const def of allVendorDefs) {
    console.log(`  ${userSlug(def.name)} / ${userSlug(def.name)}   ← ${def.name}`);
  }
  console.log('────────────────────────────────────────────\n');
}

main().catch(console.error).finally(() => prisma.$disconnect());
