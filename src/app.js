require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');

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
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
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

app.listen(PORT, () => {
  console.log(`\n🍱 ByteMarket running at http://localhost:${PORT}`);
  console.log(`   Logins: admin/admin123 | student1/student123 | vendor1/vendor123\n`);
});
