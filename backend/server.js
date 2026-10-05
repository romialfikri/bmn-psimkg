const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getDb } = require('./database');
const barangRoutes = require('./routes/barang');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = 8022;

// Create uploads directory if not exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors({
  origin: ['http://localhost:3022', 'http://127.0.0.1:3022', 'http://localhost', 'http://127.0.0.1'],
  optionsSuccessStatus: 200
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/barang', barangRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

// Initialize database and start server
async function start() {
  try {
    await getDb();
    console.log('Database initialized successfully');

    app.listen(PORT, () => {
      console.log(`BMN PSIMKG Backend running on port ${PORT}`);
      console.log(`API: http://localhost:${PORT}/api/barang`);
      console.log(`Auth: http://localhost:${PORT}/api/auth`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
