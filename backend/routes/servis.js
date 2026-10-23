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
          WHEN status = 'Diajukan' THEN 1
          WHEN status IN ('Sedang Service', 'Sedang Diservis') THEN 2
          WHEN status = 'Ditolak' THEN 3
          ELSE 4
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

    const sedangRes = db.exec("SELECT COUNT(*) as total FROM servis WHERE status IN ('Sedang Service', 'Sedang Diservis')");
    const totalSedangDiservis = sedangRes.length > 0 ? sedangRes[0].values[0][0] : 0;

    const selesaiRes = db.exec("SELECT COUNT(*) as total FROM servis WHERE status = 'Selesai'");
    const totalSelesai = selesaiRes.length > 0 ? selesaiRes[0].values[0][0] : 0;

    const ditolakRes = db.exec("SELECT COUNT(*) as total FROM servis WHERE status = 'Ditolak'");
    const totalDitolak = ditolakRes.length > 0 ? ditolakRes[0].values[0][0] : 0;

    const totalPages = Math.ceil(total / limit) || 1;

    res.json({
      success: true,
      data,
      total,
      page,
      limit,
      totalPages,
      stats: {
        totalSemua: totalDiajukan + totalSedangDiservis + totalSelesai + totalDitolak,
        totalDiajukan,
        totalSedangDiservis,
        totalSelesai,
        totalDitolak
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/servis/:id — Detail pengajuan servis

// GET /api/servis/export/excel — Download data service format Excel (Khusus Admin)
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
    const dataSql = `SELECT * FROM servis ${whereClause} 
      ORDER BY 
        CASE 
          WHEN status = 'Sedang Diservis' THEN 1
          WHEN status = 'Diajukan' THEN 2
          ELSE 3
        END, 
        id DESC`;

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
    const worksheet = workbook.addWorksheet('Data Service', {
      pageSetup: { paperSize: 9, orientation: 'landscape' }
    });

    worksheet.mergeCells('A1:M1');
    const t1 = worksheet.getCell('A1');
    t1.value = 'BADAN METEOROLOGI, KLIMATOLOGI, DAN GEOFISIKA';
    t1.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF0369A1' } };
    t1.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:M2');
    const t2 = worksheet.getCell('A2');
    t2.value = 'PUSAT STANDARDISASI INSTRUMEN METEOROLOGI KLIMATOLOGI DAN GEOFISIKA';
    t2.font = { name: 'Arial', size: 11, bold: true };
    t2.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A3:M3');
    const t3 = worksheet.getCell('A3');
    t3.value = 'DAFTAR PENGAJUAN SERVICE BARANG MILIK NEGARA (BMN)';
    t3.font = { name: 'Arial', size: 14, bold: true, underline: true };
    t3.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A4:M4');
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
      'Nama Pengaju',
      'Kontak Pengaju',
      'Tgl Keluar (Service)',
      'Tgl Kembali',
      'Vendor / Tempat Service',
      'Keluhan / Kerusakan',
      'Biaya Service (Rp)',
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
      const statusLabel = item.status === 'Sedang Diservis' ? 'Sedang Service' : item.status;
      const row = worksheet.addRow([
        index + 1,
        item.no_bmn || '-',
        item.nup || '-',
        item.nama_barang || '-',
        item.bidang || '-',
        item.nama_pengaju || '-',
        item.kontak_pengaju || '-',
        item.tanggal_keluar || '-',
        item.tanggal_kembali || '-',
        item.tempat_servis || '-',
        item.keluhan_kerusakan || '-',
        item.biaya_servis || 0,
        statusLabel || '-'
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
        if (colNumber === 1 || colNumber === 3 || colNumber === 5 || colNumber === 8 || colNumber === 9 || colNumber === 13) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNumber === 12) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0';
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
      { width: 22 },  // Pengaju
      { width: 16 },  // Kontak
      { width: 16 },  // Tgl Keluar
      { width: 16 },  // Tgl Kembali
      { width: 24 },  // Tempat Service
      { width: 30 },  // Keluhan
      { width: 18 },  // Biaya
      { width: 18 }   // Status
    ];

    const filename = `Data-Service-BMN-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export Service Excel error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/servis/export/pdf — Download data service format PDF (Khusus Admin)
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
    const dataSql = `SELECT * FROM servis ${whereClause} 
      ORDER BY 
        CASE 
          WHEN status = 'Sedang Diservis' THEN 1
          WHEN status = 'Diajukan' THEN 2
          ELSE 3
        END, 
        id DESC`;

    const stmt = db.prepare(dataSql);
    stmt.bind(queryParams);
    const items = [];
    while (stmt.step()) {
      items.push(stmt.getAsObject());
    }
    stmt.free();

    const filename = `Data-Service-BMN-${new Date().toISOString().split('T')[0]}.pdf`;
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
         .text('DAFTAR PENGAJUAN SERVICE BARANG MILIK NEGARA (BMN)', { align: 'center' });
      doc.font('Helvetica').fontSize(9).fillColor('#64748b')
         .text(`Status: ${status || 'Semua'} | Bidang: ${bidang || 'Semua Bidang'} | Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} | Total: ${items.length} Data`, { align: 'center' });
      doc.moveDown(0.6);
      doc.restore();
    };

    drawKop();

    const columns = [
      { key: 'no', label: 'No', width: 28, align: 'center' },
      { key: 'bmn', label: 'No BMN / NUP', width: 100, align: 'left' },
      { key: 'barang', label: 'Nama Barang & Bidang', width: 150, align: 'left' },
      { key: 'pengaju', label: 'Pengaju', width: 100, align: 'left' },
      { key: 'jadwal', label: 'Tgl Keluar & Kembali', width: 100, align: 'left' },
      { key: 'vendor', label: 'Tempat Service / Vendor', width: 105, align: 'left' },
      { key: 'keluhan', label: 'Keluhan & Status', width: 110, align: 'left' },
      { key: 'biaya', label: 'Biaya (Rp)', width: 77, align: 'right' }
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
      const statusLabel = item.status === 'Sedang Diservis' ? 'Sedang Service' : item.status;
      const barangText = `${item.nama_barang || '-'}\n[${item.bidang || '-'}]`;
      const pengajuText = `${item.nama_pengaju || '-'}${item.kontak_pengaju ? '\n' + item.kontak_pengaju : ''}`;
      const jadwalText = `Keluar: ${item.tanggal_keluar || '-'}\nKembali: ${item.tanggal_kembali || '-'}`;
      const keluhanText = `${item.keluhan_kerusakan || '-'}\n[Status: ${statusLabel}]`;
      const biayaFormatted = item.biaya_servis > 0 ? Number(item.biaya_servis).toLocaleString('id-ID') : '-';

      const bHeight = doc.heightOfString(barangText, { width: columns[2].width - 8 });
      const pHeight = doc.heightOfString(pengajuText, { width: columns[3].width - 8 });
      const jHeight = doc.heightOfString(jadwalText, { width: columns[4].width - 8 });
      const kHeight = doc.heightOfString(keluhanText, { width: columns[6].width - 8 });
      const rowHeight = Math.max(20, bHeight + 8, pHeight + 8, jHeight + 8, kHeight + 8);

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
        pengajuText,
        jadwalText,
        item.tempat_servis || '-',
        keluhanText,
        biayaFormatted
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
      doc.text(`Dokumen Pengajuan Service BMN PSIMKG - Halaman ${i + 1} dari ${range.count}`, 36, 560, { align: 'center', width: 770 });
    }

    doc.end();
  } catch (error) {
    console.error('Export Service PDF error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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

// PUT /api/servis/:id/approve — Setujui atau Tolak Pengajuan Service (ADMIN ONLY)
router.put('/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;
    const { action, catatan } = req.body; // action: 'approve' | 'reject'

    const existing = resultToArray(db.exec('SELECT * FROM servis WHERE id = ?', [id]));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Data pengajuan service tidak ditemukan' });
    }

    const item = existing[0];
    let newStatus = action === 'approve' ? 'Sedang Service' : 'Ditolak';
    let newHasil = item.hasil_servis || '';

    if (catatan && catatan.trim()) {
      newHasil = newHasil ? `${newHasil} | [Catatan Admin: ${catatan.trim()}]` : `[Catatan Admin: ${catatan.trim()}]`;
    }

    db.run(
      'UPDATE servis SET status = ?, hasil_servis = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStatus, newHasil, id]
    );
    saveDb();

    res.json({
      success: true,
      message: action === 'approve'
        ? `Pengajuan service barang "${item.nama_barang}" berhasil DISETUJUI oleh Admin.`
        : `Pengajuan service barang "${item.nama_barang}" telah DITOLAK oleh Admin.`,
      status: newStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

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
