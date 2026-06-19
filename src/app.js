require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, '..', 'src', 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'bytemarket-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hours
}));

app.use(flash());

// Global locals for all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  const cart = req.session.cart || [];
  res.locals.cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// Health check – used by Render to prevent free-tier sleeping
app.get('/health', (req, res) => {
  const db = require('@prisma/client');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/', require('./routes/auth'));
app.use('/student', require('./routes/student'));
app.use('/vendor', require('./routes/vendor'));
app.use('/admin', require('./routes/admin'));

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: '404 – Page Not Found' });
});

const server = app.listen(PORT, () => {
  console.log(`\n🍱 ByteMarket running at http://localhost:${PORT}`);
  console.log(`   Logins: admin/admin123 | student1/student123 | vendor1/vendor123\n`);
});

// Self-ping every 10 minutes to keep Render free tier awake
const SELF_PING_INTERVAL = 10 * 60 * 1000; // 10 minutes
if (process.env.RENDER_EXTERNAL_URL) {
  const pingUrl = process.env.RENDER_EXTERNAL_URL;
  console.log(`   Self-ping enabled – will ping ${pingUrl} every 10 min to prevent sleeping\n`);
  setInterval(() => {
    http.get(`${pingUrl}/health`, (res) => {
      console.log(`[keepalive] pinged self – ${res.statusCode}`);
    }).on('error', (err) => {
      console.error(`[keepalive] ping failed – ${err.message}`);
    });
  }, SELF_PING_INTERVAL);
}
