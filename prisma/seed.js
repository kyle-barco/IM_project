require('dotenv').config(); // Load environment variables from .env

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Set up the driver adapter using your DATABASE_URL environment variable
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

// Pass the adapter directly into the constructor
const prisma = new PrismaClient({ adapter });


async function main() {
  console.log('Seeding database...');

  // Admin user
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: await bcrypt.hash('admin123', 10),
      role: 'ADMIN',
    },
  });

  // Student user
  await prisma.user.upsert({
    where: { username: 'student1' },
    update: {},
    create: {
      username: 'student1',
      password: await bcrypt.hash('student123', 10),
      role: 'STUDENT',
    },
  });

  // Vendor user (linked to a vendor stall)
  await prisma.user.upsert({
    where: { username: 'vendor1' },
    update: {},
    create: {
      username: 'vendor1',
      password: await bcrypt.hash('vendor123', 10),
      role: 'VENDOR',
    },
  });

  // Vendors
  const jollibee = await prisma.vendor.upsert({
    where: { stallNumber: 'A1' },
    update: {},
    create: {
      name: "Mama's Kitchen",
      stallNumber: 'A1',
      description: 'Home-cooked Filipino meals',
      isOpen: true,
    },
  });

  const silog = await prisma.vendor.upsert({
    where: { stallNumber: 'A2' },
    update: {},
    create: {
      name: 'Silog Masters',
      stallNumber: 'A2',
      description: 'All-day breakfast silog meals',
      isOpen: true,
    },
  });

  const drinks = await prisma.vendor.upsert({
    where: { stallNumber: 'B1' },
    update: {},
    create: {
      name: 'Sip & Chill',
      stallNumber: 'B1',
      description: 'Cold drinks, milk tea, and refreshments',
      isOpen: true,
    },
  });

  // Menu items for Mama's Kitchen
  const menuItems = [
    { name: 'Adobo Rice Meal', price: 75, stock: 20, category: 'Rice Meals', vendorId: jollibee.id, description: 'Classic chicken adobo with steamed rice' },
    { name: 'Sinigang na Baboy', price: 85, stock: 15, category: 'Soups', vendorId: jollibee.id, description: 'Pork sinigang with vegetables' },
    { name: 'Pork Nilaga', price: 80, stock: 10, category: 'Soups', vendorId: jollibee.id, description: 'Tender pork nilaga with potatoes' },
    // Silog Masters
    { name: 'Tapsilog', price: 70, stock: 25, category: 'Silog', vendorId: silog.id, description: 'Beef tapa, sinangag, itlog' },
    { name: 'Longsilog', price: 65, stock: 25, category: 'Silog', vendorId: silog.id, description: 'Longganisa, sinangag, itlog' },
    { name: 'Bangsilog', price: 75, stock: 20, category: 'Silog', vendorId: silog.id, description: 'Bangus, sinangag, itlog' },
    // Sip & Chill
    { name: 'Milk Tea (Large)', price: 65, stock: 50, category: 'Milk Tea', vendorId: drinks.id, description: 'Classic milk tea with pearls' },
    { name: 'Fresh Buko Juice', price: 35, stock: 30, category: 'Juices', vendorId: drinks.id, description: 'Fresh buko juice with coconut meat' },
    { name: 'Iced Coffee', price: 45, stock: 40, category: 'Coffee', vendorId: drinks.id, description: 'Creamy iced coffee' },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.create({ data: { name: item.name, price: item.price, stockQuantity: item.stock, category: item.category, vendorId: item.vendorId, description: item.description } });
  }

  console.log('Seeding complete!');
  console.log('Logins: admin/admin123 | student1/student123 | vendor1/vendor123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
