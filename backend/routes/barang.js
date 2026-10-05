const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { getDb, saveDb } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Hanya file gambar yang diizinkan (JPG, PNG, GIF, WebP)'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter
});

// Helper: convert sql.js result to array of objects
function resultToArray(result) {
  if (!result || result.length === 0 || result[0].values.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

// GET /api/barang/stats/summary — Dashboard stats (public)
router.get('/stats/summary', async (req, res) => {
  try {
    const db = await getDb();

    const totalResult = db.exec('SELECT COUNT(*) as total FROM barang');
    const total = totalResult.length > 0 ? totalResult[0].values[0][0] : 0;

    const totalHargaResult = db.exec('SELECT COALESCE(SUM(harga_barang), 0) as total_harga FROM barang');
    const totalHarga = totalHargaResult.length > 0 ? totalHargaResult[0].values[0][0] : 0;

    // Per bidang stats
    const bidangStats = {};
    const bidangList = ['Meteorologi', 'Klimatologi', 'Geofisika', 'Tata Usaha'];

    for (const bidang of bidangList) {
      const countResult = db.exec('SELECT COUNT(*) as jumlah FROM barang WHERE bidang = ?', [bidang]);
      const hargaResult = db.exec('SELECT COALESCE(SUM(harga_barang), 0) as total FROM barang WHERE bidang = ?', [bidang]);

      bidangStats[bidang] = {
        jumlah: countResult.length > 0 ? countResult[0].values[0][0] : 0,
        totalHarga: hargaResult.length > 0 ? hargaResult[0].values[0][0] : 0
      };
    }

    // Recent items (5 terbaru)
    const recentResult = db.exec('SELECT * FROM barang ORDER BY id DESC LIMIT 5');
    const recentItems = resultToArray(recentResult);

    // Per tahun
    const perTahunResult = db.exec('SELECT tahun_barang, COUNT(*) as jumlah FROM barang GROUP BY tahun_barang ORDER BY tahun_barang DESC LIMIT 10');
    const perTahun = resultToArray(perTahunResult);

    res.json({
      success: true,
      data: {
        total,
        totalHarga,
        bidangStats,
        recentItems,
        perTahun
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/barang — List items (public, filterable by bidang)
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const search = req.query.search || '';
    const bidang = req.query.bidang || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const searchTerm = `%${search}%`;
    let countQuery, dataQuery, params, countParams;

    if (bidang) {
      countQuery = 'SELECT COUNT(*) as total FROM barang WHERE bidang = ? AND (nama_barang LIKE ? OR no_bmn LIKE ?)';
      countParams = [bidang, searchTerm, searchTerm];
      dataQuery = 'SELECT * FROM barang WHERE bidang = ? AND (nama_barang LIKE ? OR no_bmn LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?';
      params = [bidang, searchTerm, searchTerm, limit, offset];
    } else {
      countQuery = 'SELECT COUNT(*) as total FROM barang WHERE nama_barang LIKE ? OR no_bmn LIKE ?';
      countParams = [searchTerm, searchTerm];
      dataQuery = 'SELECT * FROM barang WHERE (nama_barang LIKE ? OR no_bmn LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?';
      params = [searchTerm, searchTerm, limit, offset];
    }

    const countResult = db.exec(countQuery, countParams);
    const total = countResult.length > 0 ? countResult[0].values[0][0] : 0;

    const stmt = db.prepare(dataQuery);
    stmt.bind(params);
    const data = [];
    while (stmt.step()) {
      data.push(stmt.getAsObject());
    }
    stmt.free();

    const totalPages = Math.ceil(total / limit);

    res.json({ success: true, data, total, page, limit, totalPages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/barang/:id — Single item (public)
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec('SELECT * FROM barang WHERE id = ?', [req.params.id]);
    const items = resultToArray(result);

    if (items.length === 0) {
      return res.status(404).json({ success: false, error: 'Data tidak ditemukan' });
    }

    res.json({ success: true, data: items[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/barang — Create (authenticated users only)
router.post('/', authenticateToken, upload.single('foto_barang'), async (req, res) => {
  try {
    const db = await getDb();
    const { no_bmn, nama_barang, tahun_barang, harga_barang, keterangan } = req.body;
    const foto_barang = req.file ? req.file.filename : null;

    // User can only add to their own bidang, admin can specify any
    let bidang = req.user.bidang;
    if (req.user.role === 'admin' && req.body.bidang) {
      bidang = req.body.bidang;
    }

    if (!nama_barang || !tahun_barang) {
      return res.status(400).json({ success: false, error: 'Nama barang dan tahun barang harus diisi.' });
    }

    db.run(
      'INSERT INTO barang (no_bmn, nama_barang, bidang, tahun_barang, harga_barang, foto_barang, keterangan) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [no_bmn || null, nama_barang, bidang, parseInt(tahun_barang), parseFloat(harga_barang) || 0, foto_barang, keterangan || null]
    );
    saveDb();

    const lastId = db.exec('SELECT last_insert_rowid() as id');
    const id = lastId[0].values[0][0];

    res.status(201).json({
      success: true,
      data: { id, no_bmn, nama_barang, bidang, tahun_barang: parseInt(tahun_barang), harga_barang: parseFloat(harga_barang) || 0, foto_barang, keterangan },
      message: 'Data BMN berhasil ditambahkan'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/barang/:id — Update (authenticated, own bidang or admin)
router.put('/:id', authenticateToken, upload.single('foto_barang'), async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;
    const { no_bmn, nama_barang, tahun_barang, harga_barang, keterangan } = req.body;
    const newFoto = req.file ? req.file.filename : null;

    const existing = resultToArray(db.exec('SELECT * FROM barang WHERE id = ?', [id]));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Data tidak ditemukan' });
    }

    const item = existing[0];

    // Only admin or same bidang user can edit
    if (req.user.role !== 'admin' && req.user.bidang !== item.bidang) {
      return res.status(403).json({ success: false, error: 'Anda tidak memiliki akses untuk mengedit data bidang lain.' });
    }

    let foto_barang = item.foto_barang;
    if (newFoto) {
      if (item.foto_barang) {
        const oldPath = path.join(__dirname, '..', 'uploads', item.foto_barang);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      foto_barang = newFoto;
    }

    db.run(
      'UPDATE barang SET no_bmn = ?, nama_barang = ?, tahun_barang = ?, harga_barang = ?, foto_barang = ?, keterangan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        no_bmn !== undefined ? no_bmn : item.no_bmn,
        nama_barang || item.nama_barang,
        parseInt(tahun_barang) || item.tahun_barang,
        harga_barang !== undefined ? parseFloat(harga_barang) : item.harga_barang,
        foto_barang,
        keterangan !== undefined ? keterangan : item.keterangan,
        id
      ]
    );
    saveDb();

    res.json({ success: true, message: 'Data BMN berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/barang/:id — Delete (ADMIN ONLY)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;

    const existing = resultToArray(db.exec('SELECT * FROM barang WHERE id = ?', [id]));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Data tidak ditemukan' });
    }

    const item = existing[0];
    if (item.foto_barang) {
      const photoPath = path.join(__dirname, '..', 'uploads', item.foto_barang);
      if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
    }

    db.run('DELETE FROM barang WHERE id = ?', [id]);
    saveDb();

    res.json({ success: true, message: 'Data BMN berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
