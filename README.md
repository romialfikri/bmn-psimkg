# Aplikasi Sistem Informasi BMN - PSIMKG

Aplikasi web untuk mengelola **Barang Milik Negara (BMN)** di lingkungan **PSIMKG (Pusat Standardisasi Instrumen Meteorologi Klimatologi dan Geofisika)**.

## Fitur Utama

- 📊 **Dashboard Ringkasan Eksekutif** - Total BMN, total nilai aset (Rupiah), sebaran BMN per bidang, 5 item terbaru, dan statistik per tahun.
- 📑 **4 Halaman Bidang BMN**:
  1. **Meteorologi**
  2. **Klimatologi**
  3. **Geofisika**
  4. **Tata Usaha**
- 🔐 **Autentikasi Berbasis Peran (RBAC)**:
  - Pengunjung hanya dapat melihat dan mencari data.
  - Untuk menambah / upload data, pengguna harus login dengan akun bidang masing-masing.
  - **Hanya Administrator** yang berhak menghapus data BMN.
- 🏷️ **Field Data Lengkap**:
  - No BMN (kode aset)
  - Nama Barang
  - Bidang
  - Tahun Perolehan
  - Harga Barang (format Rupiah)
  - Foto Barang (JPG, PNG, GIF, WebP, max 5MB)
  - Keterangan
  - Tanggal Upload (otomatis tersimpan)
- 🔍 **Fitur Perbesar Foto (Lightbox)** - Klik foto thumbnail pada tabel untuk melihat gambar ukuran penuh secara interaktif.
- 🔎 **Pencarian & Pagination** - Pencarian berdasarkan nama barang atau No BMN dengan navigasi per halaman.

---

## Akun Pengguna (Login)

| Username | Password | Role | Bidang Akses |
|---|---|---|---|
| `admin` | `admin123` | **Administrator** | Semua Bidang (Bisa Tambah & Hapus) |
| `meteorologi` | `meteorologi123` | Operator | Meteorologi (Bisa Tambah) |
| `klimatologi` | `klimatologi123` | Operator | Klimatologi (Bisa Tambah) |
| `geofisika` | `geofisika123` | Operator | Geofisika (Bisa Tambah) |
| `tatausaha` | `tatausaha123` | Operator | Tata Usaha (Bisa Tambah) |

---

## Arsitektur & Port

- **Frontend**: React 18 + Vite (Port `3022`)
- **Backend API**: Node.js + Express (Port `8022`)
- **Database**: SQLite (via `sql.js`, tersimpan di `backend/data/bmn.db`)
- **Reverse Proxy**: Apache (Port `80` -> `3022` & `8022`)
- **Process Manager**: PM2

---

## Cara Menjalankan

### Mode Development
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```
Akses di browser: **http://localhost:3022**

### Mode Production dengan PM2
```bash
# 1. Build Frontend
cd frontend
npm run build
cd ..

# 2. Jalankan PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### Konfigurasi Apache (Server BMKG)
```bash
sudo cp apache-bmn.conf /etc/apache2/sites-available/bmn.conf
sudo a2enmod proxy proxy_http rewrite headers
sudo a2ensite bmn.conf
sudo systemctl restart apache2
```

---

## Kontak
Dikelola oleh **PSIMKG - Pusat Standardisasi Instrumen Meteorologi Klimatologi dan Geofisika**
