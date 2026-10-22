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

// GET /api/peminjaman/export/excel — Download data peminjaman format Excel (Khusus Admin)
router.get('/export/excel', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const search = req.query.search || '';
    const status = req.query.status || '';
    const bidang = req.query.bidang || '';

    let whereConditions = [];
    let queryParams = [];

    if (search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push('(nama_barang LIKE ? OR no_bmn LIKE ? OR nup LIKE ? OR nama_peminjam LIKE ? OR keperluan LIKE ? OR dipinjamkan_oleh LIKE ?)');
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
    const dataSql = `SELECT * FROM peminjaman ${whereClause} ORDER BY CASE WHEN status = 'Dipinjam' THEN 0 ELSE 1 END, id DESC`;
    const stmt = db.prepare(dataSql);
    stmt.bind(queryParams);
    const items = [];
    while (stmt.step()) {
      items.push(stmt.getAsObject());
    }
    stmt.free();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BMN PSIMKG';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Data Peminjaman', {
      pageSetup: { paperSize: 9, orientation: 'landscape' }
    });

    worksheet.mergeCells('A1:L1');
    const t1 = worksheet.getCell('A1');
    t1.value = 'BADAN METEOROLOGI, KLIMATOLOGI, DAN GEOFISIKA';
    t1.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF0369A1' } };
    t1.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:L2');
    const t2 = worksheet.getCell('A2');
    t2.value = 'PUSAT STANDARDISASI INSTRUMEN METEOROLOGI KLIMATOLOGI DAN GEOFISIKA';
    t2.font = { name: 'Arial', size: 11, bold: true };
    t2.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A3:L3');
    const t3 = worksheet.getCell('A3');
    t3.value = 'DAFTAR PEMINJAMAN BARANG MILIK NEGARA (BMN)';
    t3.font = { name: 'Arial', size: 14, bold: true, underline: true };
    t3.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A4:L4');
    const t4 = worksheet.getCell('A4');
    t4.value = `Status: ${status || 'Semua'} | Bidang: ${bidang || 'Semua Bidang'} | Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} | Total: ${items.length} Data`;
    t4.font = { name: 'Arial', size: 10, italic: true };
    t4.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.addRow([]);

    const headerRow = worksheet.addRow([
      'No',
      'No BMN',
      'NUP',
      'Nama Barang',
      'Bidang',
      'Nama Peminjam',
      'Kontak Peminjam',
      'Tgl Pinjam',
      'Tgl Kembali',
      'Dipinjamkan Oleh',
      'Keperluan',
      'Status'
    ]);

    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0369A1' } };
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
    });
    headerRow.height = 28;

    items.forEach((item, index) => {
      const row = worksheet.addRow([
        index + 1,
        item.no_bmn || '-',
        item.nup || '-',
        item.nama_barang || '-',
        item.bidang || '-',
        item.nama_peminjam || '-',
        item.kontak_peminjam || '-',
        item.tanggal_pinjam || '-',
        item.tanggal_kembali || (item.estimasi_kembali ? `Est: ${item.estimasi_kembali}` : '-'),
        item.dipinjamkan_oleh || '-',
        item.keperluan || '-',
        item.status || '-'
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
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
        if (colNumber === 1 || colNumber === 3 || colNumber === 5 || colNumber === 8 || colNumber === 9 || colNumber === 12) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
      });
      row.height = 22;
    });

    worksheet.columns = [
      { width: 6 },   // No
      { width: 20 },  // No BMN
      { width: 8 },   // NUP
      { width: 30 },  // Nama Barang
      { width: 14 },  // Bidang
      { width: 22 },  // Peminjam
      { width: 16 },  // Kontak
      { width: 14 },  // Tgl Pinjam
      { width: 16 },  // Tgl Kembali
      { width: 20 },  // Dipinjamkan Oleh
      { width: 28 },  // Keperluan
      { width: 16 }   // Status
    ];

    const filename = `Data-Peminjaman-BMN-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export Peminjaman Excel error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/peminjaman/export/pdf — Download data peminjaman format PDF (Khusus Admin)
router.get('/export/pdf', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const search = req.query.search || '';
    const status = req.query.status || '';
    const bidang = req.query.bidang || '';

    let whereConditions = [];
    let queryParams = [];

    if (search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push('(nama_barang LIKE ? OR no_bmn LIKE ? OR nup LIKE ? OR nama_peminjam LIKE ? OR keperluan LIKE ? OR dipinjamkan_oleh LIKE ?)');
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
    const dataSql = `SELECT * FROM peminjaman ${whereClause} ORDER BY CASE WHEN status = 'Dipinjam' THEN 0 ELSE 1 END, id DESC`;
    const stmt = db.prepare(dataSql);
    stmt.bind(queryParams);
    const items = [];
    while (stmt.step()) {
      items.push(stmt.getAsObject());
    }
    stmt.free();

    const filename = `Data-Peminjaman-BMN-${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
    doc.pipe(res);

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
         .text('DAFTAR PEMINJAMAN BARANG MILIK NEGARA (BMN)', { align: 'center' });
      doc.font('Helvetica').fontSize(9).fillColor('#64748b')
         .text(`Status: ${status || 'Semua'} | Bidang: ${bidang || 'Semua Bidang'} | Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} | Total: ${items.length} Data`, { align: 'center' });
      doc.moveDown(0.6);
      doc.restore();
    };

    drawKop();

    const columns = [
      { key: 'no', label: 'No', width: 28, align: 'center' },
      { key: 'no_bmn', label: 'No BMN / NUP', width: 100, align: 'left' },
      { key: 'nama_barang', label: 'Nama Barang & Bidang', width: 160, align: 'left' },
      { key: 'peminjam', label: 'Peminjam', width: 110, align: 'left' },
      { key: 'tgl_pinjam', label: 'Tgl Pinjam', width: 75, align: 'center' },
      { key: 'tgl_kembali', label: 'Tgl Kembali', width: 85, align: 'center' },
      { key: 'petugas', label: 'Petugas', width: 85, align: 'left' },
      { key: 'keperluan', label: 'Keperluan', width: 127, align: 'left' }
    ];

    const startX = 36;
    let currentY = doc.y;

    const drawHeader = (y) => {
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

    currentY = drawHeader(currentY);

    doc.font('Helvetica').fontSize(8);
    items.forEach((item, index) => {
      const barangText = `${item.nama_barang || '-'}\n[${item.bidang || '-'}]`;
      const peminjamText = `${item.nama_peminjam || '-'}${item.kontak_peminjam ? ' (' + item.kontak_peminjam + ')' : ''}`;
      const kembaliText = item.status === 'Dikembalikan'
        ? `Kembali: ${item.tanggal_kembali || '-'}`
        : (item.estimasi_kembali ? `Est: ${item.estimasi_kembali}\n[Dipinjam]` : '[Dipinjam]');

      const bHeight = doc.heightOfString(barangText, { width: columns[2].width - 8 });
      const pHeight = doc.heightOfString(peminjamText, { width: columns[3].width - 8 });
      const kHeight = doc.heightOfString(item.keperluan || '-', { width: columns[7].width - 8 });
      const rowHeight = Math.max(20, bHeight + 8, pHeight + 8, kHeight + 8);

      if (currentY + rowHeight > 530) {
        doc.addPage();
        drawKop();
        currentY = drawHeader(doc.y);
      }

      if (index % 2 === 0) {
        doc.save();
        doc.rect(startX, currentY, 770, rowHeight).fill('#f8fafc');
        doc.restore();
      }

      doc.save();
      doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(startX, currentY + rowHeight).lineTo(startX + 770, currentY + rowHeight).stroke();
      doc.restore();

      const bmnCol = `${item.no_bmn || '-'}${item.nup ? ' / NUP: ' + item.nup : ''}`;
      const values = [
        (index + 1).toString(),
        bmnCol,
        barangText,
        peminjamText,
        item.tanggal_pinjam || '-',
        kembaliText,
        item.dipinjamkan_oleh || '-',
        item.keperluan || '-'
      ];

      let xOffset = startX;
      columns.forEach((col, cIdx) => {
        doc.fillColor('#1e293b').text(values[cIdx], xOffset + 4, currentY + 4, {
          width: col.width - 8,
          align: col.align
        });
        xOffset += col.width;
      });

      currentY += rowHeight;
    });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8');
      doc.text(`Dokumen Peminjaman BMN PSIMKG - Halaman ${i + 1} dari ${range.count}`, 36, 560, { align: 'center', width: 770 });
    }

    doc.end();
  } catch (error) {
    console.error('Export Peminjaman PDF error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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
