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

// GET /api/servis/stats — Ringkasan status servis barang
router.get('/stats', async (req, res) => {
  try {
    const db = await getDb();
    const totalResult = db.exec('SELECT COUNT(*) as total FROM servis');
    const total = totalResult.length > 0 ? totalResult[0].values[0][0] : 0;

    const diajukanResult = db.exec("SELECT COUNT(*) as total FROM servis WHERE status = 'Diajukan'");
    const diajukan = diajukanResult.length > 0 ? diajukanResult[0].values[0][0] : 0;

    const sedangResult = db.exec("SELECT COUNT(*) as total FROM servis WHERE status = 'Sedang Diservis'");
    const sedangDiservis = sedangResult.length > 0 ? sedangResult[0].values[0][0] : 0;

    const selesaiResult = db.exec("SELECT COUNT(*) as total FROM servis WHERE status = 'Selesai'");
    const selesai = selesaiResult.length > 0 ? selesaiResult[0].values[0][0] : 0;

    res.json({
      success: true,
      data: {
        total,
        diajukan,
        sedangDiservis,
        selesai
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/servis — List pengajuan servis barang dengan filter & pencarian
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
      whereConditions.push('(nama_barang LIKE ? OR no_bmn LIKE ? OR nup LIKE ? OR nama_pengaju LIKE ? OR tempat_servis LIKE ? OR keluhan_kerusakan LIKE ?)');
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
    const countSql = `SELECT COUNT(*) as total FROM servis ${whereClause}`;
    const countStmt = db.prepare(countSql);
    countStmt.bind(queryParams);
    let total = 0;
    if (countStmt.step()) {
      total = countStmt.getAsObject().total;
    }
    countStmt.free();

    // Query data: Urutkan Diajukan & Sedang Diservis di atas, lalu Selesai, lalu id terbaru
    const dataSql = `SELECT * FROM servis ${whereClause} 
      ORDER BY 
        CASE 
          WHEN status = 'Sedang Diservis' THEN 1
          WHEN status = 'Diajukan' THEN 2
          ELSE 3
        END, 
        id DESC 
      LIMIT ? OFFSET ?`;

    const dataStmt = db.prepare(dataSql);
    dataStmt.bind([...queryParams, limit, offset]);
    const data = [];
    while (dataStmt.step()) {
      data.push(dataStmt.getAsObject());
    }
    dataStmt.free();

    // Stats
    const diajukanRes = db.exec("SELECT COUNT(*) as total FROM servis WHERE status = 'Diajukan'");
    const totalDiajukan = diajukanRes.length > 0 ? diajukanRes[0].values[0][0] : 0;

    const sedangRes = db.exec("SELECT COUNT(*) as total FROM servis WHERE status = 'Sedang Diservis'");
    const totalSedangDiservis = sedangRes.length > 0 ? sedangRes[0].values[0][0] : 0;

    const selesaiRes = db.exec("SELECT COUNT(*) as total FROM servis WHERE status = 'Selesai'");
    const totalSelesai = selesaiRes.length > 0 ? selesaiRes[0].values[0][0] : 0;

    const totalPages = Math.ceil(total / limit) || 1;

    res.json({
      success: true,
      data,
      total,
      page,
      limit,
      totalPages,
      stats: {
        totalSemua: totalDiajukan + totalSedangDiservis + totalSelesai,
        totalDiajukan,
        totalSedangDiservis,
        totalSelesai
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/servis/:id — Detail pengajuan servis
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec('SELECT * FROM servis WHERE id = ?', [req.params.id]);
    const items = resultToArray(result);

    if (items.length === 0) {
      return res.status(404).json({ success: false, error: 'Data pengajuan servis tidak ditemukan' });
    }

    res.json({ success: true, data: items[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/servis — Tambah pengajuan servis baru (Authenticated)
router.post('/', authenticateToken, upload.single('foto_barang'), async (req, res) => {
  try {
    const db = await getDb();
    const {
      barang_id,
      no_bmn,
      nup,
      nama_barang,
      bidang,
      nama_pengaju,
      kontak_pengaju,
      tanggal_keluar,
      tanggal_kembali,
      tempat_servis,
      keluhan_kerusakan,
      biaya_servis,
      status
    } = req.body;

    const foto_barang = req.file ? req.file.filename : null;

    if (!nama_barang || !keluhan_kerusakan) {
      return res.status(400).json({
        success: false,
        error: 'Nama barang dan keluhan kerusakan wajib diisi.'
      });
    }

    const pengaju = nama_pengaju && nama_pengaju.trim()
      ? nama_pengaju.trim()
      : (req.user.nama || req.user.username);

    const tglKeluar = tanggal_keluar || new Date().toISOString().split('T')[0];
    const bidangItem = bidang || req.user.bidang || 'Tata Usaha';
    const statusAwal = status || 'Diajukan';
    const biaya = parseFloat(biaya_servis) || 0;

    db.run(
      `INSERT INTO servis (
        barang_id, no_bmn, nup, nama_barang, bidang,
        nama_pengaju, kontak_pengaju, tanggal_keluar, tanggal_kembali,
        tempat_servis, keluhan_kerusakan, biaya_servis, status,
        foto_barang
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        barang_id ? parseInt(barang_id) : null,
        no_bmn || null,
        nup || null,
        nama_barang,
        bidangItem,
        pengaju,
        kontak_pengaju || null,
        tglKeluar,
        tanggal_kembali || null,
        tempat_servis || null,
        keluhan_kerusakan,
        biaya,
        statusAwal,
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
        nama_pengaju: pengaju,
        kontak_pengaju,
        tanggal_keluar: tglKeluar,
        tanggal_kembali,
        tempat_servis,
        keluhan_kerusakan,
        biaya_servis: biaya,
        status: statusAwal,
        foto_barang
      },
      message: 'Pengajuan servis barang berhasil disimpan'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/servis/:id/status — Update status servis (misal: Sedang Diservis, Selesai, Dibatalkan)
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;
    const { status, tanggal_kembali, hasil_servis, biaya_servis } = req.body;

    const existing = resultToArray(db.exec('SELECT * FROM servis WHERE id = ?', [id]));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Data pengajuan servis tidak ditemukan' });
    }

    const item = existing[0];
    const statusBaru = status || item.status;
    let tglKembali = tanggal_kembali !== undefined ? tanggal_kembali : item.tanggal_kembali;

    // Jika ditandai selesai dan tanggal kembali belum diisi, default ke hari ini
    if (statusBaru === 'Selesai' && !tglKembali) {
      tglKembali = new Date().toISOString().split('T')[0];
    }

    const hasil = hasil_servis !== undefined ? hasil_servis : item.hasil_servis;
    const biaya = biaya_servis !== undefined ? parseFloat(biaya_servis) : item.biaya_servis;

    db.run(
      `UPDATE servis 
       SET status = ?, 
           tanggal_kembali = ?, 
           hasil_servis = ?, 
           biaya_servis = ?, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [statusBaru, tglKembali, hasil, biaya, id]
    );
    saveDb();

    res.json({
      success: true,
      message: `Status servis barang berhasil diperbarui menjadi "${statusBaru}"`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/servis/:id — Edit data servis lengkap
router.put('/:id', authenticateToken, upload.single('foto_barang'), async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;
    const {
      no_bmn,
      nup,
      nama_barang,
      bidang,
      nama_pengaju,
      kontak_pengaju,
      tanggal_keluar,
      tanggal_kembali,
      tempat_servis,
      keluhan_kerusakan,
      biaya_servis,
      status,
      hasil_servis
    } = req.body;

    const existing = resultToArray(db.exec('SELECT * FROM servis WHERE id = ?', [id]));
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
      `UPDATE servis SET 
        no_bmn = ?, 
        nup = ?, 
        nama_barang = ?, 
        bidang = ?, 
        nama_pengaju = ?, 
        kontak_pengaju = ?, 
        tanggal_keluar = ?, 
        tanggal_kembali = ?, 
        tempat_servis = ?, 
        keluhan_kerusakan = ?, 
        biaya_servis = ?, 
        status = ?, 
        hasil_servis = ?, 
        foto_barang = ?, 
        updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        no_bmn !== undefined ? no_bmn : item.no_bmn,
        nup !== undefined ? nup : item.nup,
        nama_barang || item.nama_barang,
        bidang || item.bidang,
        nama_pengaju || item.nama_pengaju,
        kontak_pengaju !== undefined ? kontak_pengaju : item.kontak_pengaju,
        tanggal_keluar || item.tanggal_keluar,
        tanggal_kembali !== undefined ? tanggal_kembali : item.tanggal_kembali,
        tempat_servis !== undefined ? tempat_servis : item.tempat_servis,
        keluhan_kerusakan || item.keluhan_kerusakan,
        biaya_servis !== undefined ? parseFloat(biaya_servis) : item.biaya_servis,
        status || item.status,
        hasil_servis !== undefined ? hasil_servis : item.hasil_servis,
        foto_barang,
        id
      ]
    );
    saveDb();

    res.json({ success: true, message: 'Data pengajuan servis berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/servis/:id — Hapus data servis (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;

    const existing = resultToArray(db.exec('SELECT * FROM servis WHERE id = ?', [id]));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Data tidak ditemukan' });
    }

    const item = existing[0];
    if (item.foto_barang) {
      const photoPath = path.join(__dirname, '..', 'uploads', item.foto_barang);
      if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
    }

    db.run('DELETE FROM servis WHERE id = ?', [id]);
    saveDb();

    res.json({ success: true, message: 'Data pengajuan servis berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
