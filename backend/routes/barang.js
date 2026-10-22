const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
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

// GET /api/barang/export/excel — Download data barang dalam format Excel
router.get('/export/excel', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const search = req.query.search || '';
    const bidang = req.query.bidang || '';

    const searchTerm = `%${search}%`;
    let dataQuery, params;

    if (bidang && bidang !== 'Semua') {
      dataQuery = 'SELECT * FROM barang WHERE bidang = ? AND (nama_barang LIKE ? OR no_bmn LIKE ? OR nup LIKE ? OR lokasi_barang LIKE ?) ORDER BY id ASC';
      params = [bidang, searchTerm, searchTerm, searchTerm, searchTerm];
    } else {
      dataQuery = 'SELECT * FROM barang WHERE (nama_barang LIKE ? OR no_bmn LIKE ? OR nup LIKE ? OR lokasi_barang LIKE ?) ORDER BY id ASC';
      params = [searchTerm, searchTerm, searchTerm, searchTerm];
    }

    const stmt = db.prepare(dataQuery);
    stmt.bind(params);
    const items = [];
    while (stmt.step()) {
      items.push(stmt.getAsObject());
    }
    stmt.free();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BMN PSIMKG';
    workbook.lastModifiedBy = 'BMN PSIMKG';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Data BMN', {
      pageSetup: { paperSize: 9, orientation: 'landscape' }
    });

    // Judul & Header Info
    worksheet.mergeCells('A1:H1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'BADAN METEOROLOGI, KLIMATOLOGI, DAN GEOFISIKA';
    titleCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF0369A1' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:H2');
    const subtitleCell = worksheet.getCell('A2');
    subtitleCell.value = 'PUSAT STANDARDISASI INSTRUMEN METEOROLOGI KLIMATOLOGI DAN GEOFISIKA';
    subtitleCell.font = { name: 'Arial', size: 11, bold: true };
    subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A3:H3');
    const docTitleCell = worksheet.getCell('A3');
    docTitleCell.value = 'DAFTAR INVENTARIS BARANG MILIK NEGARA (BMN)';
    docTitleCell.font = { name: 'Arial', size: 14, bold: true, underline: true };
    docTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A4:H4');
    const filterInfoCell = worksheet.getCell('A4');
    filterInfoCell.value = `Bidang: ${bidang && bidang !== 'Semua' ? bidang : 'Semua Bidang'} | Tanggal Unduh: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    filterInfoCell.font = { name: 'Arial', size: 10, italic: true };
    filterInfoCell.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.addRow([]); // Baris kosong di baris 5

    // Kolom Header di baris 6
    const headerRow = worksheet.addRow([
      'No',
      'No BMN',
      'NUP',
      'Nama Barang',
      'Bidang',
      'Tahun',
      'Lokasi Barang',
      'Keterangan'
    ]);

    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0369A1' }
      };
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'medium' },
        right: { style: 'thin' }
      };
    });
    headerRow.height = 28;

    // Isi Data
    items.forEach((item, index) => {
      const row = worksheet.addRow([
        index + 1,
        item.no_bmn || '-',
        item.nup || '-',
        item.nama_barang || '-',
        item.bidang || '-',
        item.tahun_barang || '-',
        item.lokasi_barang || '-',
        item.keterangan || '-'
      ]);

      const isEven = index % 2 === 0;
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Arial', size: 9 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        if (isEven) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' }
          };
        }
        if (colNumber === 1 || colNumber === 3 || colNumber === 5 || colNumber === 6) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
      });
      row.height = 22;
    });

    // Auto-fit Column Widths
    worksheet.columns = [
      { width: 6 },   // No
      { width: 22 },  // No BMN
      { width: 10 },  // NUP
      { width: 35 },  // Nama Barang
      { width: 16 },  // Bidang
      { width: 10 },  // Tahun
      { width: 26 },  // Lokasi
      { width: 30 }   // Keterangan
    ];

    const safeBidang = (bidang && bidang !== 'Semua' ? bidang.toLowerCase().replace(/\s+/g, '-') : 'semua');
    const filename = `Data-BMN-PSIMKG-${safeBidang}-${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export Excel error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/barang/export/pdf — Download data barang dalam format PDF
router.get('/export/pdf', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const search = req.query.search || '';
    const bidang = req.query.bidang || '';

    const searchTerm = `%${search}%`;
    let dataQuery, params;

    if (bidang && bidang !== 'Semua') {
      dataQuery = 'SELECT * FROM barang WHERE bidang = ? AND (nama_barang LIKE ? OR no_bmn LIKE ? OR nup LIKE ? OR lokasi_barang LIKE ?) ORDER BY id ASC';
      params = [bidang, searchTerm, searchTerm, searchTerm, searchTerm];
    } else {
      dataQuery = 'SELECT * FROM barang WHERE (nama_barang LIKE ? OR no_bmn LIKE ? OR nup LIKE ? OR lokasi_barang LIKE ?) ORDER BY id ASC';
      params = [searchTerm, searchTerm, searchTerm, searchTerm];
    }

    const stmt = db.prepare(dataQuery);
    stmt.bind(params);
    const items = [];
    while (stmt.step()) {
      items.push(stmt.getAsObject());
    }
    stmt.free();

    const safeBidang = (bidang && bidang !== 'Semua' ? bidang.toLowerCase().replace(/\s+/g, '-') : 'semua');
    const filename = `Data-BMN-PSIMKG-${safeBidang}-${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      bufferPages: true
    });

    doc.pipe(res);

    // Helper draw header
    const drawKop = () => {
      doc.save();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0369a1')
         .text('BADAN METEOROLOGI, KLIMATOLOGI, DAN GEOFISIKA', { align: 'center' });
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a')
         .text('PUSAT STANDARDISASI INSTRUMEN METEOROLOGI KLIMATOLOGI DAN GEOFISIKA', { align: 'center' });
      doc.font('Helvetica').fontSize(9).fillColor('#475569')
         .text('Jl. Angkasa I No.2 Kemayoran, Jakarta Pusat 10610 | Website: psimkg.bmkg.go.id', { align: 'center' });
      
      doc.moveDown(0.3);
      doc.strokeColor('#0284c7').lineWidth(1.5).moveTo(36, doc.y).lineTo(806, doc.y).stroke();
      doc.moveDown(0.5);

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#1e293b')
         .text('DAFTAR INVENTARIS BARANG MILIK NEGARA (BMN)', { align: 'center' });
      doc.font('Helvetica').fontSize(9).fillColor('#64748b')
         .text(`Bidang: ${bidang && bidang !== 'Semua' ? bidang : 'Semua Bidang'} | Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} | Total Data: ${items.length} item`, { align: 'center' });
      doc.moveDown(0.6);
      doc.restore();
    };

    drawKop();

    // Table definition
    const columns = [
      { key: 'no', label: 'No', width: 30, align: 'center' },
      { key: 'no_bmn', label: 'No BMN', width: 110, align: 'left' },
      { key: 'nup', label: 'NUP', width: 40, align: 'center' },
      { key: 'nama_barang', label: 'Nama Barang', width: 180, align: 'left' },
      { key: 'bidang', label: 'Bidang', width: 85, align: 'center' },
      { key: 'tahun_barang', label: 'Tahun', width: 45, align: 'center' },
      { key: 'lokasi_barang', label: 'Lokasi Barang', width: 130, align: 'left' },
      { key: 'keterangan', label: 'Keterangan', width: 150, align: 'left' }
    ];

    const startX = 36;
    let currentY = doc.y;

    const drawTableHeader = (y) => {
      doc.save();
      doc.rect(startX, y, 770, 20).fill('#0284c7');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
      
      let xOffset = startX;
      columns.forEach(col => {
        doc.text(col.label, xOffset + 4, y + 5, { width: col.width - 8, align: col.align });
        xOffset += col.width;
      });
      doc.restore();
      return y + 20;
    };

    currentY = drawTableHeader(currentY);

    doc.font('Helvetica').fontSize(8);
    items.forEach((item, index) => {
      const namaHeight = doc.heightOfString(item.nama_barang || '-', { width: columns[3].width - 8 });
      const lokasiHeight = doc.heightOfString(item.lokasi_barang || '-', { width: columns[6].width - 8 });
      const ketHeight = doc.heightOfString(item.keterangan || '-', { width: columns[7].width - 8 });
      const rowHeight = Math.max(18, namaHeight + 8, lokasiHeight + 8, ketHeight + 8);

      if (currentY + rowHeight > 530) {
        doc.addPage();
        drawKop();
        currentY = drawTableHeader(doc.y);
      }

      if (index % 2 === 0) {
        doc.save();
        doc.rect(startX, currentY, 770, rowHeight).fill('#f8fafc');
        doc.restore();
      }

      doc.save();
      doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(startX, currentY + rowHeight).lineTo(startX + 770, currentY + rowHeight).stroke();
      doc.restore();

      let xOffset = startX;
      const values = [
        (index + 1).toString(),
        item.no_bmn || '-',
        (item.nup || '-').toString(),
        item.nama_barang || '-',
        item.bidang || '-',
        (item.tahun_barang || '-').toString(),
        item.lokasi_barang || '-',
        item.keterangan || '-'
      ];

      columns.forEach((col, cIdx) => {
        doc.fillColor('#1e293b').text(values[cIdx], xOffset + 4, currentY + 4, {
          width: col.width - 8,
          align: col.align
        });
        xOffset += col.width;
      });

      currentY += rowHeight;
    });

    // Page numbering in footer
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8');
      doc.text(
        `Dokumen Inventaris BMN PSIMKG - Halaman ${i + 1} dari ${range.count}`,
        36,
        560,
        { align: 'center', width: 770 }
      );
    }

    doc.end();
  } catch (error) {
    console.error('Export PDF error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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
