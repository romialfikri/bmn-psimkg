# Aplikasi Sistem Informasi BMN - PSIMKG

Aplikasi web untuk mengelola **Barang Milik Negara (BMN)** di lingkungan **PSIMKG (Pusat Standardisasi Instrumen Meteorologi Klimatologi dan Geofisika)**.

## Fitur Utama

- 🚪 **Akses Masuk (Login Gate)** - Tampilan login yang aman sebelum pengguna dapat masuk ke Dashboard dan menu aplikasi.
- 📊 **Dashboard Ringkasan Eksekutif** - Total BMN, total barang dipinjam, total barang sedang service, sebaran BMN per bidang, dan 5 item terbaru.
- 📑 **Halaman Bidang BMN**:
  1. **Meteorologi**
  2. **Klimatologi**
  3. **Geofisika**
  4. **Tata Usaha**
- 📥 **Fitur Download Data Laporan (Excel & PDF - Khusus Administrator)**:
  - **Data Barang BMN**: Download seluruh data atau per-bidang dalam format Microsoft Excel (.xlsx) dan PDF resmi ber-kop PSIMKG.
  - **Data Barang Dipinjam (Peminjaman)**: Download riwayat & daftar peminjaman aktif barang BMN ke Excel dan PDF.
  - **Data Pengajuan Service**: Download daftar & riwayat perbaikan alat BMN ke Excel dan PDF.
- 🤝 **Halaman Peminjaman Barang (Barang Dipinjam)**:
  - Pencatatan peminjaman barang inventaris atau manual.
  - **Fitur Dipinjamkan Oleh Siapa** (mencatat identitas petugas yang meminjamkan barang).
  - Status aktif ("Sedang Dipinjam") dan riwayat ("Dikembalikan").
  - Tombol aksi cepat pengembalian barang beserta tanggal dan catatan pengembalian.
- 🛠️ **Halaman Pengajuan Service Barang BMN**:
  - Formulir pengajuan perbaikan / service barang BMN.
  - **Fitur Tanggal Barang Keluar**: mencatat tanggal barang keluar / diserahkan untuk diservice.
  - **Fitur Tanggal Barang Dikembalikan**: mencatat tanggal estimasi kembali serta tanggal aktual barang diterima kembali setelah perbaikan.
  - Informasi tempat service/vendor, keluhan kerusakan, estimasi dan biaya riil perbaikan, serta foto barang.
  - Alur status lengkap: `Diajukan` ➜ `Sedang Service` ➜ `Selesai` / `Dibatalkan` disertai catatan hasil service.
- 🔐 **Autentikasi Berbasis Peran (RBAC)**:
  - Login wajib untuk mengakses menu aplikasi.
  - Operator bidang hanya mengelola data bidang masing-masing.
  - **Hanya Administrator** yang berhak mendownload dokumen Excel & PDF, menghapus data BMN, data peminjaman, dan riwayat service.
- 🏷️ **Field Data Lengkap**: No BMN, NUP, Nama Barang, Bidang, Tahun, Lokasi Ruangan, Foto, Keterangan, Tanggal Upload.
- 🔍 **Fitur Perbesar Foto (Lightbox)** - Klik foto thumbnail pada tabel untuk melihat gambar ukuran penuh.
- 🔎 **Pencarian & Pagination** - Pencarian real-time berdasarkan nama barang, No BMN, peminjam, petugas, vendor, atau keluhan.

---

## Akun Pengguna (Login)

| Username | Password | Role | Bidang Akses | Hak Download & Hapus |
|---|---|---|---|---|
| `admin` | `admin123` | **Administrator** | Semua Bidang | **Ya (Full Akses)** |
| `meteorologi` | `meteorologi123` | Operator | Meteorologi | Tidak |
| `klimatologi` | `klimatologi123` | Operator | Klimatologi | Tidak |
| `geofisika` | `geofisika123` | Operator | Geofisika | Tidak |
| `tatausaha` | `tatausaha123` | Operator | Tata Usaha | Tidak |

---

## Arsitektur & Port

- **Frontend**: React 18 + Vite (Port `3022`) dijalankan via `server-static.js`
- **Backend API**: Node.js + Express (Port `8022`) via `backend/server.js`
- **Database**: SQLite (via `sql.js`, tersimpan di `backend/data/bmn.db`)
- **Reverse Proxy**: Apache (Port `80` -> `/bmn` ke Port `3022` & `/bmn/api` ke Port `8022`)
- **Process Manager**: PM2 (`bmn-api` dan `bmn-web`)

---

## 💻 Cara Menjalankan di Komputer Lokal (Windows)

Cukup **klik dua kali** file:
```
jalankan-lokal.bat
```
Script akan otomatis menyalakan Backend API (port 8022), Frontend Web (port 3022), dan langsung membuka browser di **http://localhost:3022**.

---

## 🐧 Cara Deploy di Server (Ubuntu 24.04 di `/var/www/bmn`)

Aplikasi dirancang agar dapat di-deploy secara **live hanya dengan pull git**:

### 1. Masuk ke direktori dan pull kode terbaru
```bash
cd /var/www/bmn
git pull origin main
```

### 2. Install dependencies & build frontend
```bash
# Install dependencies backend (termasuk exceljs dan pdfkit)
cd backend && npm install && cd ..

# Install dependencies frontend & build
cd frontend && npm install && npm run build && cd ..
```

### 3. Jalankan / Restart layanan PM2
```bash
pm2 restart ecosystem.config.cjs
# atau jika baru pertama kali:
# pm2 start ecosystem.config.cjs
pm2 save
```

Layanan PM2 yang berjalan:
- `bmn-api`: Backend API Express (Port 8022)
- `bmn-web`: Frontend Web Static Server (Port 3022)

### 4. Konfigurasi Apache Reverse Proxy (Sekali Saja saat Awal Setup)
```bash
sudo cp apache-bmn.conf /etc/apache2/sites-available/bmn.conf
sudo a2enmod proxy proxy_http rewrite headers
sudo a2ensite bmn.conf
sudo systemctl reload apache2
```
Akses live di server:
- Web: `http://<IP-SERVER>/bmn`
- API: `http://<IP-SERVER>/bmn/api`
