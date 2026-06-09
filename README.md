# 🍱 ByteMarket
**University Multi-Vendor Food Court Ordering Information System (ByteMIS)**

> Group 9 – Palattao, Gabriel Achilles S. | Benito Jr., Tracy L. | Barco, Jazther Kyle D.

---

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| View Engine | EJS |
| ORM | Prisma |
| Database | PostgreSQL (via Docker) |
| Auth | express-session + bcryptjs |
| Styles | Vanilla CSS (Space Grotesk + IBM Plex Mono) |

---

## Project Structure
```
bytemarket/
├── prisma/
│   ├── schema.prisma      ← Data model (User, Vendor, MenuItem, Order, OrderLine)
│   └── seed.js            ← Demo data seeder
├── src/
│   ├── app.js             ← Express entry point
│   ├── middleware/
│   │   └── auth.js        ← Session auth guards
│   ├── routes/
│   │   ├── auth.js        ← Login / Register / Logout
│   │   ├── student.js     ← Menu browse, cart, checkout, orders
│   │   ├── vendor.js      ← Order queue, menu mgmt, sales report
│   │   └── admin.js       ← Dashboard, all orders, vendor & user mgmt
│   └── public/css/
│       └── main.css       ← All styles
└── views/
    ├── partials/          ← head, navbar, flash
    ├── auth/              ← login, register
    ├── student/           ← menu, cart, orders, receipt
    ├── vendor/            ← dashboard, menu, sales
    └── admin/             ← dashboard, orders, vendors, users
```

---

## Quick Start

### 1. Prerequisites
- [Node.js 18+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 2. Clone & configure
```bash
git clone <your-repo>
cd bytemarket
cp .env.example .env
# Edit .env if needed (default credentials match docker-compose.yml)
```

### 3. Start the database
```bash
docker compose up -d
```

### 4. Install, migrate & seed
```bash
npm run setup
# Equivalent to:
#   npm install
#   npx prisma generate
#   npx prisma migrate dev --name init
#   node prisma/seed.js
```

### 5. Run the server
```bash
npm run dev      # development (nodemon auto-reload)
# or
npm start        # production
```

Open **http://localhost:3000**

---

## Demo Accounts

| Role | Username | Password |
|------|----------|----------|
| Student | `student1` | `student123` |
| Vendor | `vendor1` | `vendor123` |
| Admin | `admin` | `admin123` |

---

## Role Capabilities

### 🎓 Student
- Browse all open vendors and available menu items
- Add items from **multiple vendors** into one unified cart (session-based)
- Single unified checkout → order auto-split per vendor
- View order history and receipts

### 🍳 Vendor
- Live order queue (PENDING → PREPARING → READY → COMPLETED)
- Add / manage menu items; update stock quantity; toggle visibility
- Sales analytics via raw SQL `GROUP BY` aggregation

### 🛡 Admin
- Aggregate dashboard: total orders, revenue, top-selling items
- View all orders across all vendors
- Add / toggle vendors open/closed
- View all users

---

## Raw SQL Usage (Prisma `$queryRaw`)

Per project spec, analytical queries use raw SQL through Prisma:

```javascript
// Order insert
await prisma.$queryRaw`
  INSERT INTO orders ("studentId", "totalPrice", status, "createdAt")
  VALUES (${userId}, ${total}, 'PENDING', NOW())
  RETURNING id
`;

// Sales aggregation
await prisma.$queryRaw`
  SELECT mi.name, SUM(ol.quantity) AS units_sold,
         SUM(ol.quantity * ol."unitPrice") AS total_revenue
  FROM order_lines ol
  JOIN menu_items mi ON ol."itemId" = mi.id
  WHERE mi."vendorId" = ${vendorId}
  GROUP BY mi.name
  ORDER BY total_revenue DESC
`;
```

---

## Database Schema (ERD Summary)

```
USER ──< ORDER ──< ORDER_LINE >── MENU_ITEM >── VENDOR
```

| Table | Key Fields |
|-------|-----------|
| `users` | id, username, password, role (STUDENT/VENDOR/ADMIN) |
| `vendors` | id, name, stallNumber, isOpen |
| `menu_items` | id, name, price, stockQuantity, isAvailable, vendorId FK |
| `orders` | id, studentId FK, totalPrice, status, createdAt |
| `order_lines` | id, orderId FK, itemId FK, quantity, unitPrice |

---

## Development Commands

```bash
npm run dev          # Start with nodemon
npm run db:migrate   # Run Prisma migrations
npm run db:seed      # Re-seed demo data
npm run db:studio    # Open Prisma Studio (DB GUI)
```
