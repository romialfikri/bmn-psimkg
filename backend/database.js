const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'bmn.db');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Load existing database or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create table with all fields
  db.run(`
    CREATE TABLE IF NOT EXISTS barang (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no_bmn TEXT,
      nup TEXT,
      nama_barang TEXT NOT NULL,
      bidang TEXT NOT NULL DEFAULT 'Tata Usaha',
      tahun_barang INTEGER NOT NULL,
      lokasi_barang TEXT,
      foto_barang TEXT,
      keterangan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create peminjaman table
  db.run(`
    CREATE TABLE IF NOT EXISTS peminjaman (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barang_id INTEGER,
      no_bmn TEXT,
      nup TEXT,
      nama_barang TEXT NOT NULL,
      bidang TEXT NOT NULL DEFAULT 'Tata Usaha',
      nama_peminjam TEXT NOT NULL,
      kontak_peminjam TEXT,
      dipinjamkan_oleh TEXT NOT NULL,
      tgl_pinjam TEXT NOT NULL,
      tgl_kembali_rencana TEXT,
      tgl_kembali_aktual TEXT,
      status TEXT NOT NULL DEFAULT 'Dipinjam',
      keperluan TEXT,
      catatan TEXT,
      foto_barang TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create servis table
  db.run(`
    CREATE TABLE IF NOT EXISTS servis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barang_id INTEGER,
      no_bmn TEXT,
      nup TEXT,
      nama_barang TEXT NOT NULL,
      bidang TEXT NOT NULL DEFAULT 'Tata Usaha',
      nama_pengaju TEXT NOT NULL,
      kontak_pengaju TEXT,
      tanggal_keluar TEXT NOT NULL,
      tanggal_kembali TEXT,
      tempat_servis TEXT,
      keluhan_kerusakan TEXT NOT NULL,
      biaya_servis REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Diajukan',
      hasil_servis TEXT,
      foto_barang TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: add new columns if they don't exist (for existing databases)
  try {
    const tableInfo = db.exec("PRAGMA table_info(barang)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map(row => row[1]);
      if (!columns.includes('no_bmn')) {
        db.run("ALTER TABLE barang ADD COLUMN no_bmn TEXT");
      }
      if (!columns.includes('nup')) {
        db.run("ALTER TABLE barang ADD COLUMN nup TEXT");
      }
      if (!columns.includes('lokasi_barang')) {
        db.run("ALTER TABLE barang ADD COLUMN lokasi_barang TEXT");
      }
      if (!columns.includes('bidang')) {
        db.run("ALTER TABLE barang ADD COLUMN bidang TEXT NOT NULL DEFAULT 'Tata Usaha'");
      }
    }
  } catch (e) {
    // columns already exist, ignore
  }

  try {
    const tableInfoP = db.exec("PRAGMA table_info(peminjaman)");
    if (tableInfoP.length > 0) {
      const columnsP = tableInfoP[0].values.map(row => row[1]);
      if (!columnsP.includes('nup')) {
        db.run("ALTER TABLE peminjaman ADD COLUMN nup TEXT");
      }
    }
  } catch (e) {
    // ignore
  }

  saveDb();
  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

module.exports = { getDb, saveDb };
