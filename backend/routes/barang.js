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

    // Total barang sedang dipinjam
    const dipinjamResult = db.exec("SELECT COUNT(*) as total FROM peminjaman WHERE status = 'Dipinjam'");
    const totalDipinjam = dipinjamResult.length > 0 ? dipinjamResult[0].values[0][0] : 0;

    // Total barang sedang diservis (Diajukan atau Sedang Diservis)
    let totalSedangDiservis = 0;
    try {
      const servisResult = db.exec("SELECT COUNT(*) as total FROM servis WHERE status IN ('Diajukan', 'Sedang Diservis')");
      totalSedangDiservis = servisResult.length > 0 ? servisResult[0].values[0][0] : 0;
    } catch (e) {
      totalSedangDiservis = 0;
    }

    // Per bidang stats
    const bidangStats = {};
    const bidangList = ['Meteorologi', 'Klimatologi', 'Geofisika', 'Tata Usaha'];

    for (const bidang of bidangList) {
      const countResult = db.exec('SELECT COUNT(*) as jumlah FROM barang WHERE bidang = ?', [bidang]);

      bidangStats[bidang] = {
        jumlah: countResult.length > 0 ? countResult[0].values[0][0] : 0
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
        totalDipinjam,
        totalSedangDiservis,
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
      countQuery = 'SELECT COUNT(*) as total FROM barang WHERE bidang = ? AND (nama_barang LIKE ? OR no_bmn LIKE ? OR nup LIKE ? OR lokasi_barang LIKE ?)';
      countParams = [bidang, searchTerm, searchTerm, searchTerm, searchTerm];
      dataQuery = 'SELECT * FROM barang WHERE bidang = ? AND (nama_barang LIKE ? OR no_bmn LIKE ? OR nup LIKE ? OR lokasi_barang LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?';
      params = [bidang, searchTerm, searchTerm, searchTerm, searchTerm, limit, offset];
    } else {
      countQuery = 'SELECT COUNT(*) as total FROM barang WHERE (nama_barang LIKE ? OR no_bmn LIKE ? OR nup LIKE ? OR lokasi_barang LIKE ?)';
      countParams = [searchTerm, searchTerm, searchTerm, searchTerm];
      dataQuery = 'SELECT * FROM barang WHERE (nama_barang LIKE ? OR no_bmn LIKE ? OR nup LIKE ? OR lokasi_barang LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?';
      params = [searchTerm, searchTerm, searchTerm, searchTerm, limit, offset];
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
    const { no_bmn, nup, nama_barang, tahun_barang, lokasi_barang, keterangan } = req.body;
    const foto_barang = req.file ? req.file.filename : null;

    // User can only add to their own bidang, admin can specify any
    let bidang = req.user.bidang;
    if (req.user.role === 'admin' && req.body.bidang) {
      bidang = req.body.bidang;
    }

    // Validasi No BMN, NUP, dan Lokasi Barang wajib diisi
    if (!no_bmn || !no_bmn.trim()) {
      return res.status(400).json({ success: false, error: 'No BMN wajib diisi.' });
    }
    if (!nup || !nup.trim()) {
      return res.status(400).json({ success: false, error: 'NUP wajib diisi.' });
    }
    if (!lokasi_barang || !lokasi_barang.trim()) {
      return res.status(400).json({ success: false, error: 'Lokasi barang wajib dipilih.' });
    }
    if (!nama_barang || !nama_barang.trim()) {
      return res.status(400).json({ success: false, error: 'Nama barang wajib diisi.' });
    }
    if (!tahun_barang) {
      return res.status(400).json({ success: false, error: 'Tahun barang wajib diisi.' });
    }

    db.run(
      'INSERT INTO barang (no_bmn, nup, nama_barang, bidang, tahun_barang, lokasi_barang, foto_barang, keterangan) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        no_bmn.trim(),
        nup.trim(),
        nama_barang.trim(),
        bidang,
        parseInt(tahun_barang),
        lokasi_barang.trim(),
        foto_barang,
        keterangan ? keterangan.trim() : null
      ]
    );

    const lastId = db.exec('SELECT last_insert_rowid() as id');
    const id = lastId[0].values[0][0];
    saveDb();

    res.status(201).json({
      success: true,
      data: {
        id,
        no_bmn: no_bmn.trim(),
        nup: nup.trim(),
        nama_barang: nama_barang.trim(),
        bidang,
        tahun_barang: parseInt(tahun_barang),
        lokasi_barang: lokasi_barang.trim(),
        foto_barang,
        keterangan: keterangan ? keterangan.trim() : null
      },
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
    const { no_bmn, nup, nama_barang, tahun_barang, lokasi_barang, keterangan } = req.body;
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

    // Validasi jika diisi
    if (no_bmn !== undefined && !no_bmn.trim()) {
      return res.status(400).json({ success: false, error: 'No BMN wajib diisi.' });
    }
    if (nup !== undefined && !nup.trim()) {
      return res.status(400).json({ success: false, error: 'NUP wajib diisi.' });
    }
    if (lokasi_barang !== undefined && !lokasi_barang.trim()) {
      return res.status(400).json({ success: false, error: 'Lokasi barang wajib dipilih.' });
    }
    if (nama_barang !== undefined && !nama_barang.trim()) {
      return res.status(400).json({ success: false, error: 'Nama barang wajib diisi.' });
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
      'UPDATE barang SET no_bmn = ?, nup = ?, nama_barang = ?, tahun_barang = ?, lokasi_barang = ?, foto_barang = ?, keterangan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        no_bmn !== undefined ? no_bmn.trim() : item.no_bmn,
        nup !== undefined ? nup.trim() : item.nup,
        nama_barang !== undefined ? nama_barang.trim() : item.nama_barang,
        parseInt(tahun_barang) || item.tahun_barang,
        lokasi_barang !== undefined ? lokasi_barang.trim() : item.lokasi_barang,
        foto_barang,
        keterangan !== undefined ? (keterangan ? keterangan.trim() : null) : item.keterangan,
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
