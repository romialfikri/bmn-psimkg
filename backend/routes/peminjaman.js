const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { getDb, saveDb } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Multer config for file upload
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

// GET /api/peminjaman/stats — ringkasan status peminjaman
router.get('/stats', async (req, res) => {
  try {
    const db = await getDb();
    const totalResult = db.exec('SELECT COUNT(*) as total FROM peminjaman');
    const total = totalResult.length > 0 ? totalResult[0].values[0][0] : 0;

    const dipinjamResult = db.exec("SELECT COUNT(*) as total FROM peminjaman WHERE status = 'Dipinjam'");
    const dipinjam = dipinjamResult.length > 0 ? dipinjamResult[0].values[0][0] : 0;

    const dikembalikanResult = db.exec("SELECT COUNT(*) as total FROM peminjaman WHERE status = 'Dikembalikan'");
    const dikembalikan = dikembalikanResult.length > 0 ? dikembalikanResult[0].values[0][0] : 0;

    res.json({
      success: true,
      data: {
        total,
        dipinjam,
        dikembalikan
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/peminjaman — list peminjaman barang dengan filter & pencarian
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const search = req.query.search || '';
    const status = req.query.status || '';
    const bidang = req.query.bidang || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let queryParams = [];

    if (search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push('(nama_barang LIKE ? OR no_bmn LIKE ? OR nup LIKE ? OR nama_peminjam LIKE ? OR dipinjamkan_oleh LIKE ? OR keperluan LIKE ?)');
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status && status !== 'Semua') {
      whereConditions.push('status = ?');
      queryParams.push(status);
    }

    if (bidang && bidang !== 'Semua') {
      whereConditions.push('bidang = ?');
      queryParams.push(bidang);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // Hitung total
    const countSql = `SELECT COUNT(*) as total FROM peminjaman ${whereClause}`;
    const countStmt = db.prepare(countSql);
    countStmt.bind(queryParams);
    let total = 0;
    if (countStmt.step()) {
      total = countStmt.getAsObject().total;
    }
    countStmt.free();

    // Query data
    const dataSql = `SELECT * FROM peminjaman ${whereClause} ORDER BY CASE WHEN status = 'Dipinjam' THEN 0 ELSE 1 END, id DESC LIMIT ? OFFSET ?`;
    const dataStmt = db.prepare(dataSql);
    dataStmt.bind([...queryParams, limit, offset]);
    const data = [];
    while (dataStmt.step()) {
      data.push(dataStmt.getAsObject());
    }
    dataStmt.free();

    // Stats
    const totalDipinjamResult = db.exec("SELECT COUNT(*) as total FROM peminjaman WHERE status = 'Dipinjam'");
    const totalDipinjam = totalDipinjamResult.length > 0 ? totalDipinjamResult[0].values[0][0] : 0;

    const totalDikembalikanResult = db.exec("SELECT COUNT(*) as total FROM peminjaman WHERE status = 'Dikembalikan'");
    const totalDikembalikan = totalDikembalikanResult.length > 0 ? totalDikembalikanResult[0].values[0][0] : 0;

    const totalPages = Math.ceil(total / limit) || 1;

    res.json({
      success: true,
      data,
      total,
      page,
      limit,
      totalPages,
      stats: {
        totalSemua: totalDipinjam + totalDikembalikan,
        totalDipinjam,
        totalDikembalikan
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/peminjaman/:id — detail peminjaman
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec('SELECT * FROM peminjaman WHERE id = ?', [req.params.id]);
    const items = resultToArray(result);

    if (items.length === 0) {
      return res.status(404).json({ success: false, error: 'Data peminjaman tidak ditemukan' });
    }

    res.json({ success: true, data: items[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/peminjaman — tambah peminjaman baru (Authenticated)
router.post('/', authenticateToken, upload.single('foto_barang'), async (req, res) => {
  try {
    const db = await getDb();
    const {
      barang_id,
      no_bmn,
      nup,
      nama_barang,
      bidang,
      nama_peminjam,
      kontak_peminjam,
      dipinjamkan_oleh,
      tgl_pinjam,
      tgl_kembali_rencana,
      keperluan,
      catatan
    } = req.body;

    const foto_barang = req.file ? req.file.filename : null;

    if (!nama_barang || !nama_peminjam) {
      return res.status(400).json({
        success: false,
        error: 'Nama barang dan nama peminjam wajib diisi.'
      });
    }

    // "dipinjamkan_oleh" feature:
    // If not provided in form, use logged-in user name
    const petugasPeminjam = dipinjamkan_oleh && dipinjamkan_oleh.trim()
      ? dipinjamkan_oleh.trim()
      : (req.user.nama || req.user.username);

    const tanggalPinjam = tgl_pinjam || new Date().toISOString().split('T')[0];
    const bidangItem = bidang || req.user.bidang || 'Tata Usaha';

    db.run(
      `INSERT INTO peminjaman (
        barang_id, no_bmn, nup, nama_barang, bidang, nama_peminjam,
        kontak_peminjam, dipinjamkan_oleh, tgl_pinjam,
        tgl_kembali_rencana, status, keperluan, catatan, foto_barang
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Dipinjam', ?, ?, ?)`,
      [
        barang_id ? parseInt(barang_id) : null,
        no_bmn || null,
        nup || null,
        nama_barang,
        bidangItem,
        nama_peminjam,
        kontak_peminjam || null,
        petugasPeminjam,
        tanggalPinjam,
        tgl_kembali_rencana || null,
        keperluan || null,
        catatan || null,
        foto_barang
      ]
    );

    const lastId = db.exec('SELECT last_insert_rowid() as id');
    const id = lastId[0].values[0][0];
    saveDb();

    res.status(201).json({
      success: true,
      data: {
        id,
        barang_id,
        no_bmn,
        nup,
        nama_barang,
        bidang: bidangItem,
        nama_peminjam,
        kontak_peminjam,
        dipinjamkan_oleh: petugasPeminjam,
        tgl_pinjam: tanggalPinjam,
        tgl_kembali_rencana,
        status: 'Dipinjam',
        keperluan,
        catatan,
        foto_barang
      },
      message: 'Peminjaman barang berhasil dicatat'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/peminjaman/:id/kembali — Tandai barang telah dikembalikan (Authenticated)
router.put('/:id/kembali', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;
    const { tgl_kembali_aktual, catatan_pengembalian } = req.body;

    const existing = resultToArray(db.exec('SELECT * FROM peminjaman WHERE id = ?', [id]));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Data peminjaman tidak ditemukan' });
    }

    const tglKembali = tgl_kembali_aktual || new Date().toISOString().split('T')[0];
    let catatanBaru = existing[0].catatan || '';
    if (catatan_pengembalian) {
      catatanBaru = catatanBaru ? `${catatanBaru} | Pengembalian: ${catatan_pengembalian}` : `Pengembalian: ${catatan_pengembalian}`;
    }

    db.run(
      `UPDATE peminjaman 
       SET status = 'Dikembalikan', 
           tgl_kembali_aktual = ?, 
           catatan = ?, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [tglKembali, catatanBaru, id]
    );
    saveDb();

    res.json({
      success: true,
      message: 'Barang berhasil ditandai telah dikembalikan'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/peminjaman/:id — update data peminjaman (Authenticated)
router.put('/:id', authenticateToken, upload.single('foto_barang'), async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;
    const {
      no_bmn,
      nama_barang,
      bidang,
      nama_peminjam,
      kontak_peminjam,
      dipinjamkan_oleh,
      tgl_pinjam,
      tgl_kembali_rencana,
      tgl_kembali_aktual,
      status,
      keperluan,
      catatan
    } = req.body;

    const existing = resultToArray(db.exec('SELECT * FROM peminjaman WHERE id = ?', [id]));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Data tidak ditemukan' });
    }

    const item = existing[0];
    let foto_barang = item.foto_barang;
    if (req.file) {
      if (item.foto_barang) {
        const oldPath = path.join(__dirname, '..', 'uploads', item.foto_barang);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      foto_barang = req.file.filename;
    }

    db.run(
      `UPDATE peminjaman SET 
        no_bmn = ?, 
        nama_barang = ?, 
        bidang = ?, 
        nama_peminjam = ?, 
        kontak_peminjam = ?, 
        dipinjamkan_oleh = ?, 
        tgl_pinjam = ?, 
        tgl_kembali_rencana = ?, 
        tgl_kembali_aktual = ?, 
        status = ?, 
        keperluan = ?, 
        catatan = ?, 
        foto_barang = ?, 
        updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        no_bmn !== undefined ? no_bmn : item.no_bmn,
        nama_barang || item.nama_barang,
        bidang || item.bidang,
        nama_peminjam || item.nama_peminjam,
        kontak_peminjam !== undefined ? kontak_peminjam : item.kontak_peminjam,
        dipinjamkan_oleh || item.dipinjamkan_oleh,
        tgl_pinjam || item.tgl_pinjam,
        tgl_kembali_rencana !== undefined ? tgl_kembali_rencana : item.tgl_kembali_rencana,
        tgl_kembali_aktual !== undefined ? tgl_kembali_aktual : item.tgl_kembali_aktual,
        status || item.status,
        keperluan !== undefined ? keperluan : item.keperluan,
        catatan !== undefined ? catatan : item.catatan,
        foto_barang,
        id
      ]
    );
    saveDb();

    res.json({ success: true, message: 'Data peminjaman berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/peminjaman/:id — Hapus data peminjaman (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;

    const existing = resultToArray(db.exec('SELECT * FROM peminjaman WHERE id = ?', [id]));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Data tidak ditemukan' });
    }

    const item = existing[0];
    if (item.foto_barang) {
      const photoPath = path.join(__dirname, '..', 'uploads', item.foto_barang);
      if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
    }

    db.run('DELETE FROM peminjaman WHERE id = ?', [id]);
    saveDb();

    res.json({ success: true, message: 'Data peminjaman berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
