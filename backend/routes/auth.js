const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { JWT_SECRET, USERS, authenticateToken } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username dan password harus diisi.' });
  }

  const user = USERS.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.status(401).json({ success: false, error: 'Username atau password salah.' });
  }

  const token = jwt.sign(
    { username: user.username, bidang: user.bidang, role: user.role, nama: user.nama },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    success: true,
    data: {
      token,
      user: {
        username: user.username,
        bidang: user.bidang,
        role: user.role,
        nama: user.nama
      }
    }
  });
});

// GET /api/auth/me — cek status login
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    data: {
      username: req.user.username,
      bidang: req.user.bidang,
      role: req.user.role,
      nama: req.user.nama
    }
  });
});

module.exports = router;
