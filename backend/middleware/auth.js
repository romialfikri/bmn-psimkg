const jwt = require('jsonwebtoken');

const JWT_SECRET = 'bmn-psimkg-secret-key-2024';

// Daftar user — 4 user per bidang + 1 admin
const USERS = [
  { username: 'meteorologi', password: 'meteorologi123', bidang: 'Meteorologi', role: 'user', nama: 'Operator Meteorologi' },
  { username: 'klimatologi', password: 'klimatologi123', bidang: 'Klimatologi', role: 'user', nama: 'Operator Klimatologi' },
  { username: 'geofisika', password: 'geofisika123', bidang: 'Geofisika', role: 'user', nama: 'Operator Geofisika' },
  { username: 'tatausaha', password: 'tatausaha123', bidang: 'Tata Usaha', role: 'user', nama: 'Operator Tata Usaha' },
  { username: 'admin', password: 'admin123', bidang: 'Semua', role: 'admin', nama: 'Administrator' },
];

// Middleware: verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token; // Bearer TOKEN or query parameter

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token tidak ditemukan. Silakan login.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token tidak valid atau sudah expired.' });
    }
    req.user = user;
    next();
  });
}

// Middleware: only admin can proceed
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, error: 'Hanya admin yang dapat melakukan aksi ini.' });
  }
}

// Optional auth - sets req.user if token present, continues if not
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
      }
      next();
    });
  } else {
    next();
  }
}

module.exports = { JWT_SECRET, USERS, authenticateToken, requireAdmin, optionalAuth };
