const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = require('../config/db')

// Landing / redirect
router.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const role = req.session.user.role;
  if (role === 'STUDENT') return res.redirect('/student/api-menu');
  if (role === 'VENDOR') return res.redirect('/vendor/dashboard');
  if (role === 'ADMIN')  return res.redirect('/admin/dashboard');
  res.redirect('/login');
});

// Login
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login', { title: 'Sign In – ByteMarket' });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      req.flash('error', 'Invalid username or password.');
      return res.redirect('/login');
    }
    req.session.user = { id: user.id, username: user.username, role: user.role };
    req.flash('success', `Welcome back, ${user.username}!`);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Something went wrong.');
    res.redirect('/login');
  }
});

// Register
router.get('/register', (req, res) => {
  res.render('auth/register', { title: 'Create Account – ByteMarket' });
});

router.post('/register', async (req, res) => {
  const { username, password, confirmPassword } = req.body;
  if (password !== confirmPassword) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect('/register');
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.create({ data: { username, password: hashed, role: 'STUDENT' } });
    req.flash('success', 'Account created! Please log in.');
    res.redirect('/login');
  } catch (err) {
    if (err.code === 'P2002') req.flash('error', 'Username already taken.');
    else req.flash('error', 'Registration failed.');
    res.redirect('/register');
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;
