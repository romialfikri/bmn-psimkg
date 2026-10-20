import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const LOKASI_OPTIONS = [
  'Ruang Kepala Pusat',
  'Ruang Meteorologi',
  'Ruang Klimatologi',
  'Ruang Geofisika',
  'Ruang Tata Usaha',
  'Ruang KTU',
  'Ruang PPK',
  'Ruang Bendahara',
  'Ruang Koordinator Bidang Meteorologi',
  'Ruang Koordinator Bidang Klimatologi',
  'Ruang Koordinator Bidang Geofisika',
  'Ruang Rapat Besar',
  'Ruang Rapat Kecil',
  'Greenmind',
  'Sekretariat',
  'Gudang Besar',
  'Gudang Kecil'
];

// Auto-detect base path: '/bmn' behind Apache on the server, '' on localhost:3022
const APP_BASE = (typeof window !== 'undefined' && /^\/bmn(\/|$)/.test(window.location.pathname)) ? '/bmn' : '';
const apiUrl = (p) => `${APP_BASE}${p.startsWith('/') ? p : '/' + p}`;

function App() {
  // --- States ---
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [user, setUser] = useState(null); // { username, bidang, role, nama }
  const [token, setToken] = useState(localStorage.getItem('bmn_token'));

  // UI States
  const [toasts, setToasts] = useState([]);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Dashboard State
  const [dashboardData, setDashboardData] = useState(null);

  // Bidang Page State
  const [bidangData, setBidangData] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Peminjaman Page State
  const [peminjamanData, setPeminjamanData] = useState([]);
  const [peminjamanStats, setPeminjamanStats] = useState({ totalSemua: 0, totalDipinjam: 0, totalDikembalikan: 0 });
  const [peminjamanStatusFilter, setPeminjamanStatusFilter] = useState('Semua');
  const [peminjamanBidangFilter, setPeminjamanBidangFilter] = useState('Semua');
  const [peminjamanSearch, setPeminjamanSearch] = useState('');
  const [peminjamanPage, setPeminjamanPage] = useState(1);
  const [peminjamanTotalPages, setPeminjamanTotalPages] = useState(1);
  const [isAddPinjamModalOpen, setIsAddPinjamModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedReturnItem, setSelectedReturnItem] = useState(null);
  const [returnForm, setReturnForm] = useState({
    tgl_kembali_aktual: new Date().toISOString().split('T')[0],
    catatan_pengembalian: ''
  });
  const [bmnOptions, setBmnOptions] = useState([]);
  const [addPinjamForm, setAddPinjamForm] = useState({
    pilihDariBmn: true,
    barang_id: '',
    no_bmn: '',
    nup: '',
    nama_barang: '',
    bidang: 'Meteorologi',
    nama_peminjam: '',
    kontak_peminjam: '',
    dipinjamkan_oleh: '',
    tgl_pinjam: new Date().toISOString().split('T')[0],
    tgl_kembali_rencana: '',
    keperluan: '',
    catatan: ''
  });
  const [addPinjamFile, setAddPinjamFile] = useState(null);
  const [addPinjamPreview, setAddPinjamPreview] = useState('');
  const [isSubmittingPinjam, setIsSubmittingPinjam] = useState(false);

  // Servis Page State
  const [servisData, setServisData] = useState([]);
  const [servisStats, setServisStats] = useState({ totalSemua: 0, totalDiajukan: 0, totalSedangDiservis: 0, totalSelesai: 0 });
  const [servisStatusFilter, setServisStatusFilter] = useState('Semua');
  const [servisBidangFilter, setServisBidangFilter] = useState('Semua');
  const [servisSearch, setServisSearch] = useState('');
  const [servisPage, setServisPage] = useState(1);
  const [servisTotalPages, setServisTotalPages] = useState(1);
  const [isAddServisModalOpen, setIsAddServisModalOpen] = useState(false);
  const [isUpdateServisModalOpen, setIsUpdateServisModalOpen] = useState(false);
  const [selectedServisItem, setSelectedServisItem] = useState(null);

  const [addServisForm, setAddServisForm] = useState({
    pilihDariBmn: true,
    barang_id: '',
    no_bmn: '',
    nup: '',
    nama_barang: '',
    bidang: 'Meteorologi',
    nama_pengaju: '',
    kontak_pengaju: '',
    tanggal_keluar: new Date().toISOString().split('T')[0],
    tanggal_kembali: '',
    tempat_servis: '',
    keluhan_kerusakan: '',
    biaya_servis: '',
    status: 'Diajukan'
  });
  const [addServisFile, setAddServisFile] = useState(null);
  const [addServisPreview, setAddServisPreview] = useState('');
  const [isSubmittingServis, setIsSubmittingServis] = useState(false);

  const [updateServisForm, setUpdateServisForm] = useState({
    status: 'Sedang Diservis',
    tanggal_kembali: '',
    hasil_servis: '',
    biaya_servis: ''
  });

  // Auth checking state for access gate
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Login State
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // Add Item State
  const [addForm, setAddForm] = useState({
    no_bmn: '',
    nup: '',
    nama_barang: '',
    tahun_barang: '',
    lokasi_barang: '',
    keterangan: '',
    bidang: ''
  });
  const [addFile, setAddFile] = useState(null);
  const [addPreview, setAddPreview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Helpers ---
  const formatRupiah = (value) => {
    if (value === undefined || value === null) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(value);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('id-ID');
  };

  const getBidangName = (pageId) => {
    const map = {
      'meteorologi': 'Meteorologi',
      'klimatologi': 'Klimatologi',
      'geofisika': 'Geofisika',
      'tatausaha': 'Tata Usaha'
    };
    return map[pageId];
  };

  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // --- Effects ---
  useEffect(() => {
    if (token) {
      axios.get(apiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        if (res.data.success || res.data.data) {
          setUser(res.data.data);
        } else {
          setToken(null);
          setUser(null);
          localStorage.removeItem('bmn_token');
        }
      })
      .catch(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('bmn_token');
      })
      .finally(() => {
        setIsCheckingAuth(false);
      });
    } else {
      setUser(null);
      setIsCheckingAuth(false);
    }
  }, [token]);

  useEffect(() => {
    if (!user) return;
    if (currentPage === 'dashboard') {
      fetchDashboard();
    } else if (['meteorologi', 'klimatologi', 'geofisika', 'tatausaha'].includes(currentPage)) {
      fetchBidangData(getBidangName(currentPage), search, page);
    } else if (currentPage === 'peminjaman') {
      fetchPeminjamanData(peminjamanStatusFilter, peminjamanBidangFilter, peminjamanSearch, peminjamanPage);
    } else if (currentPage === 'servis') {
      fetchServisData(servisStatusFilter, servisBidangFilter, servisSearch, servisPage);
    }
  }, [user, currentPage, page, peminjamanPage, peminjamanStatusFilter, peminjamanBidangFilter, servisPage, servisStatusFilter, servisBidangFilter]);

  // --- API Calls ---
  const fetchDashboard = async () => {
    try {
      const res = await axios.get(apiUrl('/api/barang/stats/summary'));
      if (res.data && res.data.data) {
        setDashboardData(res.data.data);
      }
    } catch (err) {
      console.error('Error fetching dashboard:', err);
      showToast('Gagal memuat data dashboard', 'error');
    }
  };

  const fetchBidangData = async (bidangName, searchQuery, pageNum) => {
    try {
      const res = await axios.get(apiUrl(`/api/barang?bidang=${encodeURIComponent(bidangName)}&search=${encodeURIComponent(searchQuery)}&page=${pageNum}&limit=10`));
      if (res.data && res.data.data) {
        setBidangData(res.data.data);
        setTotalPages(res.data.totalPages || 1);
      }
    } catch (err) {
      console.error('Error fetching bidang data:', err);
      showToast('Gagal memuat data barang', 'error');
    }
  };

  const fetchPeminjamanData = async (status = peminjamanStatusFilter, bidang = peminjamanBidangFilter, searchStr = peminjamanSearch, pageNum = peminjamanPage) => {
    try {
      let url = apiUrl(`/api/peminjaman?page=${pageNum}&limit=10`);
      if (status && status !== 'Semua') url += `&status=${encodeURIComponent(status)}`;
      if (bidang && bidang !== 'Semua') url += `&bidang=${encodeURIComponent(bidang)}`;
      if (searchStr.trim()) url += `&search=${encodeURIComponent(searchStr.trim())}`;

      const res = await axios.get(url);
      if (res.data && res.data.success) {
        setPeminjamanData(res.data.data);
        setPeminjamanTotalPages(res.data.totalPages || 1);
        if (res.data.stats) {
          setPeminjamanStats(res.data.stats);
        }
      }
    } catch (err) {
      console.error('Error fetching peminjaman data:', err);
      showToast('Gagal memuat data peminjaman barang', 'error');
    }
  };

  const fetchServisData = async (status = servisStatusFilter, bidang = servisBidangFilter, searchStr = servisSearch, pageNum = servisPage) => {
    try {
      let url = apiUrl(`/api/servis?page=${pageNum}&limit=10`);
      if (status && status !== 'Semua') url += `&status=${encodeURIComponent(status)}`;
      if (bidang && bidang !== 'Semua') url += `&bidang=${encodeURIComponent(bidang)}`;
      if (searchStr.trim()) url += `&search=${encodeURIComponent(searchStr.trim())}`;

      const res = await axios.get(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.data && res.data.success) {
        setServisData(res.data.data);
        setServisTotalPages(res.data.totalPages || 1);
        if (res.data.stats) {
          setServisStats(res.data.stats);
        }
      }
    } catch (err) {
      console.error('Error fetching servis data:', err);
      showToast('Gagal memuat data pengajuan servis', 'error');
    }
  };

  const fetchBmnOptions = async () => {
    try {
      const res = await axios.get(apiUrl('/api/barang?limit=300'));
      if (res.data && res.data.data) {
        setBmnOptions(res.data.data);
      }
    } catch (err) {
      console.error('Error fetching BMN items for dropdown:', err);
    }
  };

  // --- Event Handlers: Barang ---
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchBidangData(getBidangName(currentPage), search, 1);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus data ini?')) return;
    try {
      await axios.delete(apiUrl(`/api/barang/${id}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast('Data berhasil dihapus', 'success');
      fetchBidangData(getBidangName(currentPage), search, page);
    } catch (err) {
      console.error('Error deleting:', err);
      showToast('Gagal menghapus data', 'error');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await axios.post(apiUrl('/api/auth/login'), loginForm);
      const tokenData = res.data.token || res.data.data?.token;
      const userData = res.data.user || res.data.data?.user;
      
      if (tokenData && userData) {
        setToken(tokenData);
        localStorage.setItem('bmn_token', tokenData);
        setUser(userData);
        showToast('Login berhasil', 'success');
        setCurrentPage('dashboard');
        setLoginForm({ username: '', password: '' });
      }
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Login gagal. Periksa kembali username & password.');
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('bmn_token');
    showToast('Logout berhasil', 'info');
    setCurrentPage('dashboard');
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!addForm.no_bmn?.trim() || !addForm.nup?.trim() || !addForm.lokasi_barang?.trim() || !addForm.nama_barang?.trim() || !addForm.tahun_barang) {
      showToast('No BMN, NUP, Lokasi Barang, Nama Barang, dan Tahun Barang wajib diisi', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('no_bmn', addForm.no_bmn.trim());
      formData.append('nup', addForm.nup.trim());
      formData.append('nama_barang', addForm.nama_barang.trim());
      formData.append('tahun_barang', addForm.tahun_barang);
      formData.append('lokasi_barang', addForm.lokasi_barang.trim());
      formData.append('keterangan', addForm.keterangan || '');

      let submitBidang = addForm.bidang;
      if (user && user.role !== 'admin') {
        submitBidang = user.bidang;
      } else if (!submitBidang) {
        submitBidang = getBidangName(currentPage) || 'Meteorologi';
      }
      formData.append('bidang', submitBidang);

      if (addFile) {
        formData.append('foto_barang', addFile);
      }

      await axios.post(apiUrl('/api/barang'), formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      showToast('Data BMN berhasil ditambahkan', 'success');
      setIsAddModalOpen(false);
      setAddForm({ no_bmn: '', nup: '', nama_barang: '', tahun_barang: '', lokasi_barang: '', keterangan: '', bidang: '' });
      setAddFile(null);
      setAddPreview('');
      
      if (['meteorologi', 'klimatologi', 'geofisika', 'tatausaha'].includes(currentPage)) {
        fetchBidangData(getBidangName(currentPage), search, page);
      } else if (currentPage === 'dashboard') {
        fetchDashboard();
      }
    } catch (err) {
      console.error('Error adding data:', err);
      showToast(err.response?.data?.error || err.response?.data?.message || 'Gagal menambah data', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Event Handlers: Peminjaman ---
  const handlePeminjamanSearchSubmit = (e) => {
    e.preventDefault();
    setPeminjamanPage(1);
    fetchPeminjamanData(peminjamanStatusFilter, peminjamanBidangFilter, peminjamanSearch, 1);
  };

  const openAddPinjamModal = () => {
    setAddPinjamForm({
      pilihDariBmn: true,
      barang_id: '',
      no_bmn: '',
      nup: '',
      nama_barang: '',
      bidang: user?.bidang && user?.bidang !== 'Semua' ? user.bidang : 'Meteorologi',
      nama_peminjam: '',
      kontak_peminjam: '',
      dipinjamkan_oleh: user?.nama || '',
      tgl_pinjam: new Date().toISOString().split('T')[0],
      tgl_kembali_rencana: '',
      keperluan: '',
      catatan: ''
    });
    setAddPinjamFile(null);
    setAddPinjamPreview('');
    setIsAddPinjamModalOpen(true);
    fetchBmnOptions();
  };

  const handleSelectBmnItem = (barangId) => {
    if (!barangId) {
      setAddPinjamForm(prev => ({
        ...prev,
        barang_id: '',
        no_bmn: '',
        nup: '',
        nama_barang: ''
      }));
      return;
    }
    const found = bmnOptions.find(b => String(b.id) === String(barangId));
    if (found) {
      setAddPinjamForm(prev => ({
        ...prev,
        barang_id: found.id,
        no_bmn: found.no_bmn || '',
        nup: found.nup || '',
        nama_barang: found.nama_barang || '',
        bidang: found.bidang || prev.bidang
      }));
    }
  };

  const handleAddPinjamSubmit = async (e) => {
    e.preventDefault();
    if (!addPinjamForm.nama_barang || !addPinjamForm.nama_peminjam || !addPinjamForm.dipinjamkan_oleh) {
      showToast('Nama barang, nama peminjam, dan dipinjamkan oleh wajib diisi', 'error');
      return;
    }
    setIsSubmittingPinjam(true);
    try {
      const formData = new FormData();
      if (addPinjamForm.barang_id) formData.append('barang_id', addPinjamForm.barang_id);
      formData.append('no_bmn', addPinjamForm.no_bmn);
      if (addPinjamForm.nup) formData.append('nup', addPinjamForm.nup);
      formData.append('nama_barang', addPinjamForm.nama_barang);
      formData.append('bidang', addPinjamForm.bidang);
      formData.append('nama_peminjam', addPinjamForm.nama_peminjam);
      formData.append('kontak_peminjam', addPinjamForm.kontak_peminjam);
      formData.append('dipinjamkan_oleh', addPinjamForm.dipinjamkan_oleh);
      formData.append('tgl_pinjam', addPinjamForm.tgl_pinjam);
      if (addPinjamForm.tgl_kembali_rencana) formData.append('tgl_kembali_rencana', addPinjamForm.tgl_kembali_rencana);
      formData.append('keperluan', addPinjamForm.keperluan);
      formData.append('catatan', addPinjamForm.catatan);

      if (addPinjamFile) {
        formData.append('foto_barang', addPinjamFile);
      }

      await axios.post(apiUrl('/api/peminjaman'), formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      showToast('Peminjaman barang berhasil dicatat', 'success');
      setIsAddPinjamModalOpen(false);
      fetchPeminjamanData(peminjamanStatusFilter, peminjamanBidangFilter, peminjamanSearch, 1);
    } catch (err) {
      console.error('Error submitting pinjaman:', err);
      showToast(err.response?.data?.error || 'Gagal menyimpan peminjaman barang', 'error');
    } finally {
      setIsSubmittingPinjam(false);
    }
  };

  const openReturnModal = (item) => {
    setSelectedReturnItem(item);
    setReturnForm({
      tgl_kembali_aktual: new Date().toISOString().split('T')[0],
      catatan_pengembalian: ''
    });
    setIsReturnModalOpen(true);
  };

  const handleConfirmReturn = async (e) => {
    e.preventDefault();
    if (!selectedReturnItem) return;
    try {
      await axios.put(apiUrl(`/api/peminjaman/${selectedReturnItem.id}/kembali`), returnForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast(`Barang "${selectedReturnItem.nama_barang}" berhasil ditandai telah dikembalikan`, 'success');
      setIsReturnModalOpen(false);
      setSelectedReturnItem(null);
      fetchPeminjamanData(peminjamanStatusFilter, peminjamanBidangFilter, peminjamanSearch, peminjamanPage);
    } catch (err) {
      console.error('Error returning item:', err);
      showToast(err.response?.data?.error || 'Gagal mengembalikan barang', 'error');
    }
  };

  const handleDeletePinjam = async (id) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus data peminjaman ini?')) return;
    try {
      await axios.delete(apiUrl(`/api/peminjaman/${id}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast('Data peminjaman berhasil dihapus', 'success');
      fetchPeminjamanData(peminjamanStatusFilter, peminjamanBidangFilter, peminjamanSearch, peminjamanPage);
    } catch (err) {
      console.error('Error deleting peminjaman:', err);
      showToast('Gagal menghapus data peminjaman', 'error');
    }
  };

  // --- Event Handlers: Servis ---
  const handleServisSearchSubmit = (e) => {
    e.preventDefault();
    setServisPage(1);
    fetchServisData(servisStatusFilter, servisBidangFilter, servisSearch, 1);
  };

  const openAddServisModal = () => {
    setAddServisForm({
      pilihDariBmn: true,
      barang_id: '',
      no_bmn: '',
      nup: '',
      nama_barang: '',
      bidang: user?.bidang && user?.bidang !== 'Semua' ? user.bidang : 'Meteorologi',
      nama_pengaju: user?.nama || '',
      kontak_pengaju: '',
      tanggal_keluar: new Date().toISOString().split('T')[0],
      tanggal_kembali: '',
      tempat_servis: '',
      keluhan_kerusakan: '',
      biaya_servis: '',
      status: 'Diajukan'
    });
    setAddServisFile(null);
    setAddServisPreview('');
    setIsAddServisModalOpen(true);
    fetchBmnOptions();
  };

  const handleSelectBmnServisItem = (barangId) => {
    if (!barangId) {
      setAddServisForm(prev => ({
        ...prev,
        barang_id: '',
        no_bmn: '',
        nup: '',
        nama_barang: ''
      }));
      return;
    }
    const found = bmnOptions.find(b => String(b.id) === String(barangId));
    if (found) {
      setAddServisForm(prev => ({
        ...prev,
        barang_id: found.id,
        no_bmn: found.no_bmn || '',
        nup: found.nup || '',
        nama_barang: found.nama_barang || '',
        bidang: found.bidang || prev.bidang
      }));
    }
  };

  const handleAddServisSubmit = async (e) => {
    e.preventDefault();
    if (!addServisForm.nama_barang || !addServisForm.keluhan_kerusakan || !addServisForm.tanggal_keluar) {
      showToast('Nama barang, keluhan kerusakan, dan tanggal keluar wajib diisi', 'error');
      return;
    }
    setIsSubmittingServis(true);
    try {
      const formData = new FormData();
      if (addServisForm.barang_id) formData.append('barang_id', addServisForm.barang_id);
      formData.append('no_bmn', addServisForm.no_bmn);
      formData.append('nup', addServisForm.nup);
      formData.append('nama_barang', addServisForm.nama_barang);
      formData.append('bidang', addServisForm.bidang);
      formData.append('nama_pengaju', addServisForm.nama_pengaju);
      formData.append('kontak_pengaju', addServisForm.kontak_pengaju);
      formData.append('tanggal_keluar', addServisForm.tanggal_keluar);
      if (addServisForm.tanggal_kembali) formData.append('tanggal_kembali', addServisForm.tanggal_kembali);
      formData.append('tempat_servis', addServisForm.tempat_servis);
      formData.append('keluhan_kerusakan', addServisForm.keluhan_kerusakan);
      formData.append('biaya_servis', addServisForm.biaya_servis || '0');
      formData.append('status', addServisForm.status);

      if (addServisFile) {
        formData.append('foto_barang', addServisFile);
      }

      await axios.post(apiUrl('/api/servis'), formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      showToast('Pengajuan servis berhasil disimpan', 'success');
      setIsAddServisModalOpen(false);
      fetchServisData(servisStatusFilter, servisBidangFilter, servisSearch, 1);
    } catch (err) {
      console.error('Error submitting servis:', err);
      showToast(err.response?.data?.error || 'Gagal menyimpan pengajuan servis', 'error');
    } finally {
      setIsSubmittingServis(false);
    }
  };

  const openUpdateServisModal = (item) => {
    setSelectedServisItem(item);
    setUpdateServisForm({
      status: item.status || 'Sedang Diservis',
      tanggal_kembali: item.tanggal_kembali || new Date().toISOString().split('T')[0],
      hasil_servis: item.hasil_servis || '',
      biaya_servis: item.biaya_servis || ''
    });
    setIsUpdateServisModalOpen(true);
  };

  const handleUpdateServisSubmit = async (e) => {
    e.preventDefault();
    if (!selectedServisItem) return;
    try {
      await axios.put(apiUrl(`/api/servis/${selectedServisItem.id}/status`), updateServisForm, {
        headers: { Authorization: `Bearer ${token}` }
      });

      showToast(`Status servis "${selectedServisItem.nama_barang}" berhasil diperbarui`, 'success');
      setIsUpdateServisModalOpen(false);
      setSelectedServisItem(null);
      fetchServisData(servisStatusFilter, servisBidangFilter, servisSearch, servisPage);
    } catch (err) {
      console.error('Error updating servis status:', err);
      showToast(err.response?.data?.error || 'Gagal memperbarui status servis', 'error');
    }
  };

  const handleDeleteServis = async (id) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus data pengajuan servis ini?')) return;
    try {
      await axios.delete(apiUrl(`/api/servis/${id}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast('Data pengajuan servis berhasil dihapus', 'success');
      fetchServisData(servisStatusFilter, servisBidangFilter, servisSearch, servisPage);
    } catch (err) {
      console.error('Error deleting servis:', err);
      showToast('Gagal menghapus data pengajuan servis', 'error');
    }
  };

  // --- Render Helpers ---
  const renderNavbar = () => {
    const navItems = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'meteorologi', label: 'Meteorologi' },
      { id: 'klimatologi', label: 'Klimatologi' },
      { id: 'geofisika', label: 'Geofisika' },
      { id: 'tatausaha', label: 'Tata Usaha' },
      { id: 'peminjaman', label: 'Barang Dipinjam' },
      { id: 'servis', label: 'Pengajuan Servis' }
    ];

    return (
      <nav className="nav-bar">
        <div className="nav-links">
          {navItems.map(p => (
            <button
              key={p.id}
              className={`nav-link ${currentPage === p.id ? 'active' : ''}`}
              onClick={() => {
                setCurrentPage(p.id);
                if (p.id === 'peminjaman') {
                  setPeminjamanPage(1);
                } else if (p.id === 'servis') {
                  setServisPage(1);
                } else {
                  setSearch('');
                  setPage(1);
                }
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="nav-right">
          {user ? (
            <>
              <span className="user-info">Halo, <strong>{user.nama}</strong> ({user.bidang})</span>
              <button className="btn btn-sm btn-outline" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={() => setCurrentPage('login')}>Login</button>
          )}
        </div>
      </nav>
    );
  };

  const renderDashboard = () => {
    if (!dashboardData) return <div className="loading-state">Memuat data dashboard...</div>;
    const { total, totalDipinjam, bidangStats, recentItems, perTahun } = dashboardData;

    return (
      <div>
        <h2 className="dashboard-title">Dashboard BMN - PSIMKG</h2>

        <div className="stats-grid">
          <div className="stat-card total">
            <h3>Total BMN</h3>
            <div className="stat-value">{total}</div>
          </div>
          <div className="stat-card dipinjam" style={{ cursor: 'pointer' }} onClick={() => setCurrentPage('peminjaman')} title="Lihat daftar barang yang dipinjam">
            <h3>Barang Sedang Dipinjam</h3>
            <div className="stat-value" style={{ color: '#d97706' }}>{totalDipinjam || 0}</div>
            <div className="stat-sub">Klik untuk melihat detail &rarr;</div>
          </div>
          <div className="stat-card sedang-servis" style={{ cursor: 'pointer' }} onClick={() => setCurrentPage('servis')} title="Lihat daftar pengajuan servis barang">
            <h3>Barang Sedang Diservis</h3>
            <div className="stat-value" style={{ color: '#b45309' }}>{dashboardData?.totalSedangDiservis || 0}</div>
            <div className="stat-sub">Klik untuk melihat detail &rarr;</div>
          </div>
          {['Meteorologi', 'Klimatologi', 'Geofisika', 'Tata Usaha'].map(b => {
            const cssClass = b.toLowerCase().replace(' ', '');
            return (
              <div key={b} className={`stat-card ${cssClass}`}>
                <h3>{b}</h3>
                <div className="stat-value">{bidangStats?.[b]?.jumlah || 0}</div>
                <div className="stat-sub">Item BMN</div>
              </div>
            );
          })}
        </div>

        <h3 className="section-title">5 Item Terbaru</h3>
        <div className="table-container">
          <table className="bmn-table">
            <thead>
              <tr>
                <th>No BMN</th>
                <th>NUP</th>
                <th>Nama Barang</th>
                <th>Lokasi</th>
                <th>Bidang</th>
                <th>Tahun</th>
                <th>Tanggal Upload</th>
              </tr>
            </thead>
            <tbody>
              {recentItems?.map((item, i) => (
                <tr key={item.id || i}>
                  <td className="nobmn-cell">{item.no_bmn || '-'}</td>
                  <td className="nup-cell">{item.nup || '-'}</td>
                  <td>{item.nama_barang}</td>
                  <td><span className="lokasi-badge">{item.lokasi_barang || '-'}</span></td>
                  <td><span className={`bidang-badge ${item.bidang?.toLowerCase().replace(' ', '')}`}>{item.bidang}</span></td>
                  <td>{item.tahun_barang}</td>
                  <td className="date-cell">{formatDate(item.created_at)}</td>
                </tr>
              ))}
              {(!recentItems || recentItems.length === 0) && (
                <tr><td colSpan="7" className="empty-state">Belum ada data BMN</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {perTahun && perTahun.length > 0 && (
          <>
            <h3 className="section-title">Statistik Per Tahun</h3>
            <div className="table-container">
              <table className="bmn-table">
                <thead>
                  <tr><th>Tahun</th><th>Jumlah Item</th></tr>
                </thead>
                <tbody>
                  {perTahun.map((st, i) => (
                    <tr key={i}><td>{st.tahun_barang}</td><td>{st.jumlah}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderBidangPage = (bidangName) => {
    const showAksi = user && user.role === 'admin';
    const colSpan = showAksi ? 10 : 9;

    return (
      <div>
        <h2 className="dashboard-title">Data BMN - {bidangName}</h2>

        <div className="controls-bar">
          <div className="controls-left">
            {user && (user.role === 'admin' || user.bidang === bidangName) && (
              <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)}>+ Tambah Data</button>
            )}
          </div>
          <div className="search-box">
            <form onSubmit={handleSearchSubmit} style={{display:'flex', gap:'0.5rem'}}>
              <input
                type="text"
                placeholder="Cari nama, No BMN, NUP, atau lokasi..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <button type="submit" className="btn btn-sm btn-primary">Cari</button>
            </form>
          </div>
        </div>

        <div className="table-container">
          <table className="bmn-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Foto</th>
                <th>No BMN</th>
                <th>NUP</th>
                <th>Nama Barang</th>
                <th>Lokasi Barang</th>
                <th>Tahun</th>
                <th>Keterangan</th>
                <th>Tanggal Upload</th>
                {showAksi && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {bidangData.length === 0 ? (
                <tr><td colSpan={colSpan} className="empty-state">Tidak ada data</td></tr>
              ) : (
                bidangData.map((item, index) => (
                  <tr key={item.id}>
                    <td>{(page - 1) * 10 + index + 1}</td>
                    <td>
                      {item.foto_barang ? (
                        <img
                          src={apiUrl(`/uploads/${item.foto_barang}`)}
                          alt="Thumbnail"
                          className="thumbnail"
                          onClick={() => setLightboxImage(apiUrl(`/uploads/${item.foto_barang}`))}
                        />
                      ) : <div className="no-image">No Image</div>}
                    </td>
                    <td className="nobmn-cell">{item.no_bmn || '-'}</td>
                    <td className="nup-cell">{item.nup || '-'}</td>
                    <td>{item.nama_barang}</td>
                    <td><span className="lokasi-badge">{item.lokasi_barang || '-'}</span></td>
                    <td>{item.tahun_barang}</td>
                    <td>{item.keterangan || '-'}</td>
                    <td className="date-cell">{formatDate(item.created_at)}</td>
                    {showAksi && (
                      <td>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(item.id)}>Hapus</button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn-page" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</button>
            <span className="page-info">Halaman {page} dari {totalPages}</span>
            <button className="btn-page" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Selanjutnya</button>
          </div>
        )}
      </div>
    );
  };

  const renderPeminjamanPage = () => {
    const showAksi = !!user;

    return (
      <div>
        <h2 className="dashboard-title">Data Barang yang Dipinjam - PSIMKG</h2>

        {/* Stats Grid Peminjaman */}
        <div className="stats-grid">
          <div className="stat-card total">
            <h3>Total Catatan Pinjaman</h3>
            <div className="stat-value">{peminjamanStats.totalSemua}</div>
          </div>
          <div className="stat-card dipinjam">
            <h3>Sedang Dipinjam</h3>
            <div className="stat-value" style={{ color: '#d97706' }}>{peminjamanStats.totalDipinjam}</div>
            <div className="stat-sub">Barang belum dikembalikan</div>
          </div>
          <div className="stat-card dikembalikan">
            <h3>Sudah Dikembalikan</h3>
            <div className="stat-value" style={{ color: '#28a745' }}>{peminjamanStats.totalDikembalikan}</div>
            <div className="stat-sub">Barang telah kembali</div>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="controls-bar">
          <div className="controls-left">
            {user ? (
              <button className="btn btn-primary" onClick={openAddPinjamModal}>
                + Catat Peminjaman
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setCurrentPage('login')}>
                Login untuk Catat Pinjaman
              </button>
            )}

            {/* Filter Tabs Status */}
            <div className="filter-tabs">
              <button
                className={`filter-tab ${peminjamanStatusFilter === 'Semua' ? 'active' : ''}`}
                onClick={() => { setPeminjamanStatusFilter('Semua'); setPeminjamanPage(1); }}
              >
                Semua <span className="filter-count">{peminjamanStats.totalSemua}</span>
              </button>
              <button
                className={`filter-tab ${peminjamanStatusFilter === 'Dipinjam' ? 'active' : ''}`}
                onClick={() => { setPeminjamanStatusFilter('Dipinjam'); setPeminjamanPage(1); }}
              >
                Sedang Dipinjam <span className="filter-count">{peminjamanStats.totalDipinjam}</span>
              </button>
              <button
                className={`filter-tab ${peminjamanStatusFilter === 'Dikembalikan' ? 'active' : ''}`}
                onClick={() => { setPeminjamanStatusFilter('Dikembalikan'); setPeminjamanPage(1); }}
              >
                Sudah Kembali <span className="filter-count">{peminjamanStats.totalDikembalikan}</span>
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Filter Bidang */}
            <select
              value={peminjamanBidangFilter}
              onChange={(e) => { setPeminjamanBidangFilter(e.target.value); setPeminjamanPage(1); }}
              style={{
                padding: '0.6rem 0.8rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                backgroundColor: '#fff'
              }}
            >
              <option value="Semua">Semua Bidang</option>
              <option value="Meteorologi">Meteorologi</option>
              <option value="Klimatologi">Klimatologi</option>
              <option value="Geofisika">Geofisika</option>
              <option value="Tata Usaha">Tata Usaha</option>
            </select>

            {/* Search Box */}
            <form onSubmit={handlePeminjamanSearchSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Cari barang, peminjam, atau petugas..."
                value={peminjamanSearch}
                onChange={e => setPeminjamanSearch(e.target.value)}
                style={{
                  padding: '0.6rem 1rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  width: '260px',
                  fontSize: '0.9rem'
                }}
              />
              <button type="submit" className="btn btn-sm btn-primary">Cari</button>
            </form>
          </div>
        </div>

        {/* Peminjaman Table */}
        <div className="table-container">
          <table className="bmn-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Foto</th>
                <th>No BMN / NUP</th>
                <th>Nama Barang</th>
                <th>Bidang</th>
                <th>Peminjam</th>
                <th>Dipinjamkan Oleh</th>
                <th>Tgl Pinjam / Kembali</th>
                <th>Status</th>
                <th>Keperluan / Catatan</th>
                {showAksi && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {peminjamanData.length === 0 ? (
                <tr><td colSpan={showAksi ? 11 : 10} className="empty-state">Belum ada data barang yang dipinjam</td></tr>
              ) : (
                peminjamanData.map((item, index) => {
                  const isDipinjam = item.status === 'Dipinjam';
                  return (
                    <tr key={item.id}>
                      <td>{(peminjamanPage - 1) * 10 + index + 1}</td>
                      <td>
                        {item.foto_barang ? (
                          <img
                            src={apiUrl(`/uploads/${item.foto_barang}`)}
                            alt="Thumbnail"
                            className="thumbnail"
                            onClick={() => setLightboxImage(apiUrl(`/uploads/${item.foto_barang}`))}
                          />
                        ) : <div className="no-image">No Image</div>}
                      </td>
                      <td className="nobmn-cell">
                        <div>{item.no_bmn || '-'}</div>
                        {item.nup && <div style={{ fontSize: '0.78rem', color: '#0d9488' }}>NUP: {item.nup}</div>}
                      </td>
                      <td><strong>{item.nama_barang}</strong></td>
                      <td>
                        <span className={`bidang-badge ${item.bidang?.toLowerCase().replace(' ', '')}`}>
                          {item.bidang}
                        </span>
                      </td>
                      <td>
                        <div className="peminjam-cell">
                          <span className="peminjam-nama">{item.nama_peminjam}</span>
                          {item.kontak_peminjam && (
                            <span className="peminjam-kontak">📞 {item.kontak_peminjam}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {/* FITUR UTAMA: DIPINJAMKAN OLEH SIAPA */}
                        <div className="petugas-pemberi" title="Petugas yang meminjamkan barang ini">
                          <span className="petugas-icon">👤</span>
                          <span>{item.dipinjamkan_oleh}</span>
                        </div>
                      </td>
                      <td className="date-cell">
                        <div><strong>Pinjam:</strong> {formatDate(item.tgl_pinjam)}</div>
                        {isDipinjam ? (
                          item.tgl_kembali_rencana && (
                            <div style={{ color: '#d97706', fontSize: '0.8rem' }}>
                              <strong>Rencana:</strong> {formatDate(item.tgl_kembali_rencana)}
                            </div>
                          )
                        ) : (
                          <div style={{ color: '#28a745', fontSize: '0.8rem' }}>
                            <strong>Kembali:</strong> {formatDate(item.tgl_kembali_aktual)}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`status-badge ${isDipinjam ? 'dipinjam' : 'dikembalikan'}`}>
                          <span className="status-dot"></span>
                          {isDipinjam ? 'Dipinjam' : 'Dikembalikan'}
                        </span>
                      </td>
                      <td>
                        <div style={{ maxWidth: '220px', fontSize: '0.85rem' }}>
                          {item.keperluan && <div><em>{item.keperluan}</em></div>}
                          {item.catatan && <div style={{ color: 'var(--text-light)', marginTop: '0.2rem' }}>{item.catatan}</div>}
                          {!item.keperluan && !item.catatan && '-'}
                        </div>
                      </td>
                      {showAksi && (
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem', flexDirection: 'column' }}>
                            {isDipinjam && (
                              <button
                                className="btn btn-sm btn-primary"
                                style={{ backgroundColor: '#28a745', borderColor: '#28a745' }}
                                onClick={() => openReturnModal(item)}
                              >
                                ✓ Kembalikan
                              </button>
                            )}
                            {user?.role === 'admin' && (
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => handleDeletePinjam(item.id)}
                              >
                                Hapus
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {peminjamanTotalPages > 1 && (
          <div className="pagination">
            <button
              className="btn-page"
              disabled={peminjamanPage === 1}
              onClick={() => setPeminjamanPage(p => p - 1)}
            >
              Sebelumnya
            </button>
            <span className="page-info">Halaman {peminjamanPage} dari {peminjamanTotalPages}</span>
            <button
              className="btn-page"
              disabled={peminjamanPage >= peminjamanTotalPages}
              onClick={() => setPeminjamanPage(p => p + 1)}
            >
              Selanjutnya
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderServisPage = () => {
    return (
      <div>
        <h2 className="dashboard-title">Pengajuan Servis Barang BMN - PSIMKG</h2>

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card servis">
            <h3>Total Pengajuan Servis</h3>
            <div className="stat-value">{servisStats.totalSemua || 0}</div>
            <div className="stat-sub">Riwayat Servis BMN</div>
          </div>
          <div className="stat-card sedang-servis">
            <h3>Sedang Diservis</h3>
            <div className="stat-value" style={{ color: '#b45309' }}>
              {(servisStats.totalSedangDiservis || 0) + (servisStats.totalDiajukan || 0)}
            </div>
            <div className="stat-sub">
              {servisStats.totalDiajukan || 0} Diajukan, {servisStats.totalSedangDiservis || 0} Dalam Pengerjaan
            </div>
          </div>
          <div className="stat-card dikembalikan">
            <h3>Selesai Diperbaiki</h3>
            <div className="stat-value" style={{ color: '#16a34a' }}>
              {servisStats.totalSelesai || 0}
            </div>
            <div className="stat-sub">Barang Sudah Kembali</div>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="controls-bar" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={openAddServisModal}>
              + Ajukan Servis Barang
            </button>

            {/* Filter Tabs */}
            <div className="filter-tabs">
              {['Semua', 'Diajukan', 'Sedang Diservis', 'Selesai'].map(st => (
                <button
                  key={st}
                  className={`filter-tab ${servisStatusFilter === st ? 'active' : ''}`}
                  onClick={() => {
                    setServisStatusFilter(st);
                    setServisPage(1);
                  }}
                >
                  {st}
                  <span className="filter-count">
                    {st === 'Semua' && (servisStats.totalSemua || 0)}
                    {st === 'Diajukan' && (servisStats.totalDiajukan || 0)}
                    {st === 'Sedang Diservis' && (servisStats.totalSedangDiservis || 0)}
                    {st === 'Selesai' && (servisStats.totalSelesai || 0)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Filter Bidang */}
            <select
              className="form-control"
              style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.88rem' }}
              value={servisBidangFilter}
              onChange={e => {
                setServisBidangFilter(e.target.value);
                setServisPage(1);
              }}
            >
              <option value="Semua">Semua Bidang</option>
              <option value="Meteorologi">Meteorologi</option>
              <option value="Klimatologi">Klimatologi</option>
              <option value="Geofisika">Geofisika</option>
              <option value="Tata Usaha">Tata Usaha</option>
            </select>

            {/* Search */}
            <form onSubmit={handleServisSearchSubmit} className="search-box">
              <input
                type="text"
                placeholder="Cari barang, no BMN, pengaju, vendor..."
                value={servisSearch}
                onChange={e => setServisSearch(e.target.value)}
              />
              <button type="submit" className="btn btn-primary btn-sm">Cari</button>
              {servisSearch && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setServisSearch('');
                    setServisPage(1);
                    fetchServisData(servisStatusFilter, servisBidangFilter, '', 1);
                  }}
                >
                  Reset
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="bmn-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>No</th>
                <th>Foto</th>
                <th>No BMN / NUP</th>
                <th>Nama Barang & Bidang</th>
                <th>Pengaju</th>
                <th style={{ minWidth: '150px' }}>Tanggal Servis</th>
                <th>Tempat Servis / Vendor</th>
                <th>Keluhan / Kerusakan</th>
                <th>Biaya</th>
                <th>Status</th>
                <th>Hasil Servis</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {servisData.length === 0 ? (
                <tr>
                  <td colSpan="12" className="empty-state">
                    Belum ada data pengajuan servis barang.
                  </td>
                </tr>
              ) : (
                servisData.map((item, idx) => {
                  const statusClass = item.status === 'Diajukan' ? 'diajukan' :
                                      item.status === 'Sedang Diservis' ? 'sedang-diservis' :
                                      item.status === 'Selesai' ? 'selesai' : 'dibatalkan';
                  const isSelesai = item.status === 'Selesai';

                  return (
                    <tr key={item.id}>
                      <td>{(servisPage - 1) * 10 + idx + 1}</td>
                      <td>
                        {item.foto_barang ? (
                          <img
                            src={apiUrl(`/uploads/${item.foto_barang}`)}
                            alt="Foto Barang"
                            className="thumbnail"
                            onClick={() => setLightboxImage(apiUrl(`/uploads/${item.foto_barang}`))}
                          />
                        ) : (
                          <div className="no-image">No Image</div>
                        )}
                      </td>
                      <td>
                        <div className="nobmn-cell">{item.no_bmn || '-'}</div>
                        {item.nup && <div className="nup-cell">NUP: {item.nup}</div>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{item.nama_barang}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.15rem' }}>
                          <span className="lokasi-badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}>
                            {item.bidang}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="peminjam-cell">
                          <span className="peminjam-nama">{item.nama_pengaju}</span>
                          {item.kontak_pengaju && (
                            <span className="peminjam-kontak">📞 {item.kontak_pengaju}</span>
                          )}
                        </div>
                      </td>
                      <td className="date-cell">
                        <div>
                          <strong style={{ color: '#0369a1' }}>Keluar:</strong> {formatDate(item.tanggal_keluar)}
                        </div>
                        {item.tanggal_kembali ? (
                          <div style={{ marginTop: '0.25rem', color: isSelesai ? '#16a34a' : '#b45309', fontSize: '0.82rem' }}>
                            <strong>{isSelesai ? 'Kembali:' : 'Est. Kembali:'}</strong> {formatDate(item.tanggal_kembali)}
                          </div>
                        ) : (
                          <div style={{ marginTop: '0.25rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                            <em>Belum dijadwalkan</em>
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{item.tempat_servis || '-'}</div>
                      </td>
                      <td>
                        <div style={{ maxWidth: '240px', fontSize: '0.85rem' }}>
                          {item.keluhan_kerusakan}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem', fontWeight: 600 }}>
                        {item.biaya_servis > 0 ? formatRupiah(item.biaya_servis) : '-'}
                      </td>
                      <td>
                        <span className={`status-badge ${statusClass}`}>
                          <span className="status-dot"></span>
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ maxWidth: '200px', fontSize: '0.83rem', color: 'var(--text-light)' }}>
                          {item.hasil_servis || '-'}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', flexDirection: 'column' }}>
                          <button
                            className="btn btn-sm btn-primary"
                            style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}
                            onClick={() => openUpdateServisModal(item)}
                          >
                            Update Status
                          </button>
                          {user?.role === 'admin' && (
                            <button
                              className="btn btn-sm btn-danger"
                              style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}
                              onClick={() => handleDeleteServis(item.id)}
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {servisTotalPages > 1 && (
          <div className="pagination">
            <button
              className="btn-page"
              disabled={servisPage === 1}
              onClick={() => setServisPage(p => p - 1)}
            >
              Sebelumnya
            </button>
            <span className="page-info">Halaman {servisPage} dari {servisTotalPages}</span>
            <button
              className="btn-page"
              disabled={servisPage >= servisTotalPages}
              onClick={() => setServisPage(p => p + 1)}
            >
              Selanjutnya
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderLoginPage = () => (
    <div className="login-gate-wrapper">
      <div className="login-gate-card">
        <div className="login-gate-header">
          <img src={apiUrl("/logo-bmkg.png")} alt="Logo BMKG" className="gate-logo" />
          <h2>Akses Masuk Sistem BMN</h2>
          <p>Pusat Standardisasi Instrumen MKG (PSIMKG)</p>
          <p style={{ marginTop: '0.35rem', fontSize: '0.82rem', color: '#64748b' }}>
            Silakan login terlebih dahulu untuk mengakses Dashboard dan pengelolaan BMN
          </p>
        </div>
        {loginError && <div className="login-error">{loginError}</div>}
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              required
              value={loginForm.username}
              onChange={e => setLoginForm({...loginForm, username: e.target.value})}
              placeholder="Masukkan username"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              required
              value={loginForm.password}
              onChange={e => setLoginForm({...loginForm, password: e.target.value})}
              placeholder="Masukkan password"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-login" style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', marginTop: '0.5rem' }}>
            Masuk ke Sistem
          </button>
        </form>
        <div className="login-info" style={{ marginTop: '1.5rem' }}>
          <strong>Akun Pengguna yang Tersedia:</strong>
          <code>admin</code> / <code>admin123</code> — Administrator (Semua Bidang)<br/>
          <code>meteorologi</code> / <code>meteorologi123</code> — Bidang Meteorologi<br/>
          <code>klimatologi</code> / <code>klimatologi123</code> — Bidang Klimatologi<br/>
          <code>geofisika</code> / <code>geofisika123</code> — Bidang Geofisika<br/>
          <code>tatausaha</code> / <code>tatausaha123</code> — Bidang Tata Usaha
        </div>
      </div>
    </div>
  );

  const renderAddModal = () => {
    if (!isAddModalOpen) return null;
    return (
      <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Tambah Data BMN</h2>
            <button type="button" className="close-btn" onClick={() => setIsAddModalOpen(false)}>&times;</button>
          </div>
          <form onSubmit={handleAddSubmit} className="bmn-form">
            <div className="form-row">
              <div className="form-group">
                <label>No BMN *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Contoh: BMN-2024-001"
                  value={addForm.no_bmn} 
                  onChange={e => setAddForm({...addForm, no_bmn: e.target.value})} 
                />
              </div>
              <div className="form-group">
                <label>NUP (Nomor Urut Pendaftaran) *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Contoh: 1, 0001, atau nomor urut"
                  value={addForm.nup} 
                  onChange={e => setAddForm({...addForm, nup: e.target.value})} 
                />
              </div>
            </div>

            <div className="form-group">
              <label>Lokasi Barang *</label>
              <select
                required
                value={addForm.lokasi_barang}
                onChange={e => setAddForm({...addForm, lokasi_barang: e.target.value})}
              >
                <option value="">-- Pilih Lokasi Barang --</option>
                {LOKASI_OPTIONS.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Nama Barang *</label>
              <input 
                type="text" 
                required 
                placeholder="Nama peralatan / aset BMN"
                value={addForm.nama_barang} 
                onChange={e => setAddForm({...addForm, nama_barang: e.target.value})} 
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Tahun Barang *</label>
                <input 
                  type="number" 
                  required 
                  placeholder="Contoh: 2024"
                  value={addForm.tahun_barang} 
                  onChange={e => setAddForm({...addForm, tahun_barang: e.target.value})} 
                />
              </div>

              {user?.role === 'admin' ? (
                <div className="form-group">
                  <label>Bidang</label>
                  <select 
                    value={addForm.bidang || getBidangName(currentPage) || 'Meteorologi'} 
                    onChange={e => setAddForm({...addForm, bidang: e.target.value})}
                  >
                    <option value="Meteorologi">Meteorologi</option>
                    <option value="Klimatologi">Klimatologi</option>
                    <option value="Geofisika">Geofisika</option>
                    <option value="Tata Usaha">Tata Usaha</option>
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label>Bidang</label>
                  <div className="readonly-field">{user?.bidang || getBidangName(currentPage) || 'Meteorologi'}</div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Foto Barang</label>
              <input type="file" accept="image/*" onChange={e => {
                if (e.target.files[0]) {
                   setAddFile(e.target.files[0]);
                   setAddPreview(URL.createObjectURL(e.target.files[0]));
                }
              }} />
              {addPreview && (
                <div className="image-preview-container">
                  <img src={addPreview} alt="Preview" className="image-preview" />
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Keterangan</label>
              <textarea 
                rows="3"
                placeholder="Kondisi barang, catatan tambahan..."
                value={addForm.keterangan} 
                onChange={e => setAddForm({...addForm, keterangan: e.target.value})}
              ></textarea>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>Batal</button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan...' : 'Simpan Data'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Modal: Catat Peminjaman Barang Baru
  const renderAddPinjamModal = () => {
    if (!isAddPinjamModalOpen) return null;

    return (
      <div className="modal-overlay" onClick={() => setIsAddPinjamModalOpen(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Catat Peminjaman Barang</h2>
            <button type="button" className="close-btn" onClick={() => setIsAddPinjamModalOpen(false)}>&times;</button>
          </div>
          <form onSubmit={handleAddPinjamSubmit} className="bmn-form">
            
            {/* Pilihan Sumber Barang */}
            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Barang BMN</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--secondary)' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!addPinjamForm.pilihDariBmn}
                      onChange={e => setAddPinjamForm({...addPinjamForm, pilihDariBmn: !e.target.checked, barang_id: ''})}
                    />
                    Input Manual (di luar data BMN)
                  </label>
                </span>
              </label>

              {addPinjamForm.pilihDariBmn ? (
                <select
                  value={addPinjamForm.barang_id}
                  onChange={e => handleSelectBmnItem(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">-- Pilih Barang dari Database BMN --</option>
                  {bmnOptions.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.nama_barang} ({b.no_bmn || 'No BMN -'}{b.nup ? ` / NUP: ${b.nup}` : ''}) [{b.bidang}]
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>No BMN</label>
                <input
                  type="text"
                  placeholder="Contoh: BMN-2024-001"
                  value={addPinjamForm.no_bmn}
                  onChange={e => setAddPinjamForm({...addPinjamForm, no_bmn: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>NUP</label>
                <input
                  type="text"
                  placeholder="Nomor Urut Pendaftaran"
                  value={addPinjamForm.nup}
                  onChange={e => setAddPinjamForm({...addPinjamForm, nup: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Bidang</label>
                <select
                  value={addPinjamForm.bidang}
                  onChange={e => setAddPinjamForm({...addPinjamForm, bidang: e.target.value})}
                >
                  <option value="Meteorologi">Meteorologi</option>
                  <option value="Klimatologi">Klimatologi</option>
                  <option value="Geofisika">Geofisika</option>
                  <option value="Tata Usaha">Tata Usaha</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Nama Barang *</label>
              <input
                type="text"
                required
                placeholder="Nama peralatan / instrumen yang dipinjam"
                value={addPinjamForm.nama_barang}
                onChange={e => setAddPinjamForm({...addPinjamForm, nama_barang: e.target.value})}
              />
            </div>

            {/* FITUR UTAMA: DIPINJAMKAN OLEH SIAPA */}
            <div className="form-group" style={{ background: '#f0f7ff', padding: '0.85rem', borderRadius: 'var(--radius)', border: '1px solid #b8daff' }}>
              <label style={{ color: '#004d99', fontWeight: '700' }}>
                👤 Dipinjamkan Oleh Siapa? *
              </label>
              <input
                type="text"
                required
                placeholder="Nama petugas/staf yang meminjamkan barang..."
                value={addPinjamForm.dipinjamkan_oleh}
                onChange={e => setAddPinjamForm({...addPinjamForm, dipinjamkan_oleh: e.target.value})}
                style={{ backgroundColor: '#fff', fontWeight: '600' }}
              />
              <small style={{ color: '#004d99', display: 'block', marginTop: '0.3rem', fontSize: '0.8rem' }}>
                Isikan nama petugas / pihak yang menyerahkan/meminjamkan barang ini.
              </small>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Nama Peminjam *</label>
                <input
                  type="text"
                  required
                  placeholder="Nama orang / seksi / instansi peminjam"
                  value={addPinjamForm.nama_peminjam}
                  onChange={e => setAddPinjamForm({...addPinjamForm, nama_peminjam: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Kontak / No HP Peminjam</label>
                <input
                  type="text"
                  placeholder="08xxxxxxxxxx"
                  value={addPinjamForm.kontak_peminjam}
                  onChange={e => setAddPinjamForm({...addPinjamForm, kontak_peminjam: e.target.value})}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Tanggal Pinjam *</label>
                <input
                  type="date"
                  required
                  value={addPinjamForm.tgl_pinjam}
                  onChange={e => setAddPinjamForm({...addPinjamForm, tgl_pinjam: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Rencana Pengembalian</label>
                <input
                  type="date"
                  value={addPinjamForm.tgl_kembali_rencana}
                  onChange={e => setAddPinjamForm({...addPinjamForm, tgl_kembali_rencana: e.target.value})}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Keperluan Peminjaman</label>
              <input
                type="text"
                placeholder="Contoh: Kalibrasi alat, penelitian, pameran, survei lapangan"
                value={addPinjamForm.keperluan}
                onChange={e => setAddPinjamForm({...addPinjamForm, keperluan: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label>Catatan / Kondisi Saat Dipinjam</label>
              <textarea
                rows="2"
                placeholder="Catatan kelengkapan alat, kabel, tas, adaptor, kondisi fisik..."
                value={addPinjamForm.catatan}
                onChange={e => setAddPinjamForm({...addPinjamForm, catatan: e.target.value})}
              ></textarea>
            </div>

            <div className="form-group">
              <label>Foto Barang / Bukti Peminjaman (Opsional)</label>
              <input type="file" accept="image/*" onChange={e => {
                if (e.target.files[0]) {
                  setAddPinjamFile(e.target.files[0]);
                  setAddPinjamPreview(URL.createObjectURL(e.target.files[0]));
                }
              }} />
              {addPinjamPreview && (
                <div className="image-preview-container">
                  <img src={addPinjamPreview} alt="Preview" className="image-preview" />
                </div>
              )}
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setIsAddPinjamModalOpen(false)}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSubmittingPinjam}>
                {isSubmittingPinjam ? 'Menyimpan...' : 'Simpan Peminjaman'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Modal: Kembalikan Barang
  const renderReturnModal = () => {
    if (!isReturnModalOpen || !selectedReturnItem) return null;

    return (
      <div className="modal-overlay" onClick={() => setIsReturnModalOpen(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Konfirmasi Pengembalian Barang</h2>
            <button type="button" className="close-btn" onClick={() => setIsReturnModalOpen(false)}>&times;</button>
          </div>
          <form onSubmit={handleConfirmReturn} className="bmn-form">
            <div style={{ background: '#f8f9fa', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '1.2rem', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--primary)', marginBottom: '0.3rem' }}>
                {selectedReturnItem.nama_barang}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: '1.6' }}>
                <div><strong>No BMN:</strong> {selectedReturnItem.no_bmn || '-'} {selectedReturnItem.nup ? `(NUP: ${selectedReturnItem.nup})` : ''}</div>
                <div><strong>Peminjam:</strong> {selectedReturnItem.nama_peminjam}</div>
                <div><strong>Dipinjamkan Oleh:</strong> {selectedReturnItem.dipinjamkan_oleh}</div>
                <div><strong>Tanggal Pinjam:</strong> {formatDate(selectedReturnItem.tgl_pinjam)}</div>
              </div>
            </div>

            <div className="form-group">
              <label>Tanggal Dikembalikan *</label>
              <input
                type="date"
                required
                value={returnForm.tgl_kembali_aktual}
                onChange={e => setReturnForm({...returnForm, tgl_kembali_aktual: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label>Catatan Pengembalian / Kondisi Barang</label>
              <textarea
                rows="3"
                placeholder="Contoh: Barang telah kembali lengkap dalam kondisi baik dan berfungsi normal..."
                value={returnForm.catatan_pengembalian}
                onChange={e => setReturnForm({...returnForm, catatan_pengembalian: e.target.value})}
              ></textarea>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setIsReturnModalOpen(false)}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#28a745', borderColor: '#28a745' }}>
                Konfirmasi Telah Kembali
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderLightbox = () => {
    if (!lightboxImage) return null;
    return (
      <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
        <div className="lightbox-content" onClick={e => e.stopPropagation()}>
          <button className="lightbox-close" onClick={() => setLightboxImage(null)}>&times;</button>
          <img src={lightboxImage} alt="Preview" />
        </div>
      </div>
    );
  };

  const renderAddServisModal = () => {
    if (!isAddServisModalOpen) return null;

    return (
      <div className="modal-overlay" onClick={() => setIsAddServisModalOpen(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
          <div className="modal-header">
            <h2>Form Pengajuan Servis Barang BMN</h2>
            <button type="button" className="close-btn" onClick={() => setIsAddServisModalOpen(false)}>&times;</button>
          </div>
          <form onSubmit={handleAddServisSubmit} className="bmn-form">
            <div className="form-group">
              <label>Pilih Sumber Data Barang</label>
              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="radio"
                    name="sumberBarangServis"
                    checked={addServisForm.pilihDariBmn}
                    onChange={() => setAddServisForm({ ...addServisForm, pilihDariBmn: true })}
                  />
                  Pilih dari Inventaris BMN
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="radio"
                    name="sumberBarangServis"
                    checked={!addServisForm.pilihDariBmn}
                    onChange={() => setAddServisForm({ ...addServisForm, pilihDariBmn: false, barang_id: '' })}
                  />
                  Input Barang Baru / Manual
                </label>
              </div>
            </div>

            {addServisForm.pilihDariBmn && (
              <div className="form-group">
                <label>Pilih Barang BMN *</label>
                <select
                  required
                  value={addServisForm.barang_id}
                  onChange={e => handleSelectBmnServisItem(e.target.value)}
                >
                  <option value="">-- Pilih Barang dari Inventaris --</option>
                  {bmnOptions.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.nama_barang} {b.no_bmn ? `(BMN: ${b.no_bmn})` : ''} {b.nup ? `[NUP: ${b.nup}]` : ''} - {b.bidang}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>No BMN</label>
                <input
                  type="text"
                  placeholder="Contoh: 3.01.01.01.001"
                  value={addServisForm.no_bmn}
                  onChange={e => setAddServisForm({ ...addServisForm, no_bmn: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>NUP</label>
                <input
                  type="text"
                  placeholder="Contoh: 1, 2, dst."
                  value={addServisForm.nup}
                  onChange={e => setAddServisForm({ ...addServisForm, nup: e.target.value })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Nama Barang *</label>
                <input
                  type="text"
                  required
                  placeholder="Nama alat atau barang yang akan diservis"
                  value={addServisForm.nama_barang}
                  onChange={e => setAddServisForm({ ...addServisForm, nama_barang: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Bidang *</label>
                <select
                  value={addServisForm.bidang}
                  onChange={e => setAddServisForm({ ...addServisForm, bidang: e.target.value })}
                >
                  <option value="Meteorologi">Meteorologi</option>
                  <option value="Klimatologi">Klimatologi</option>
                  <option value="Geofisika">Geofisika</option>
                  <option value="Tata Usaha">Tata Usaha</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Nama Pengaju / Pemohon Servis *</label>
                <input
                  type="text"
                  required
                  placeholder="Nama pegawai / teknisi pengaju"
                  value={addServisForm.nama_pengaju}
                  onChange={e => setAddServisForm({ ...addServisForm, nama_pengaju: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Kontak Pengaju (No HP / WA)</label>
                <input
                  type="text"
                  placeholder="Contoh: 0812xxxxxxxx"
                  value={addServisForm.kontak_pengaju}
                  onChange={e => setAddServisForm({ ...addServisForm, kontak_pengaju: e.target.value })}
                />
              </div>
            </div>

            {/* FITUR TANGGAL BARANG KELUAR & DIKEMBALIKAN */}
            <div className="form-row" style={{ background: '#f0f9ff', padding: '0.85rem', borderRadius: '8px', border: '1px solid #bae6fd', marginBottom: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ color: '#0369a1', fontWeight: 600 }}>
                  📅 Tanggal Barang Keluar (Servis) *
                </label>
                <input
                  type="date"
                  required
                  value={addServisForm.tanggal_keluar}
                  onChange={e => setAddServisForm({ ...addServisForm, tanggal_keluar: e.target.value })}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Tanggal barang diserahkan/keluar untuk diservis</span>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ color: '#16a34a', fontWeight: 600 }}>
                  📅 Tanggal Barang Dikembalikan (Estimasi)
                </label>
                <input
                  type="date"
                  value={addServisForm.tanggal_kembali}
                  onChange={e => setAddServisForm({ ...addServisForm, tanggal_kembali: e.target.value })}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Rencana atau perkiraan barang selesai dan kembali</span>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Tempat Servis / Vendor / Teknisi</label>
                <input
                  type="text"
                  placeholder="Contoh: Service Center Resmi / Bengkel Kalibrasi"
                  value={addServisForm.tempat_servis}
                  onChange={e => setAddServisForm({ ...addServisForm, tempat_servis: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Estimasi Biaya Servis (Rp)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={addServisForm.biaya_servis}
                  onChange={e => setAddServisForm({ ...addServisForm, biaya_servis: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Keluhan / Kerusakan Barang *</label>
              <textarea
                required
                rows="3"
                placeholder="Jelaskan detail kerusakan, error alat, atau suku cadang yang bermasalah..."
                value={addServisForm.keluhan_kerusakan}
                onChange={e => setAddServisForm({ ...addServisForm, keluhan_kerusakan: e.target.value })}
              ></textarea>
            </div>

            <div className="form-group">
              <label>Foto Kondisi Barang / Kerusakan (Opsional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files[0];
                  if (file) {
                    setAddServisFile(file);
                    setAddServisPreview(URL.createObjectURL(file));
                  }
                }}
              />
              {addServisPreview && (
                <div style={{ marginTop: '0.5rem' }}>
                  <img src={addServisPreview} alt="Preview" style={{ height: '80px', borderRadius: '4px', objectFit: 'cover' }} />
                </div>
              )}
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setIsAddServisModalOpen(false)}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSubmittingServis}>
                {isSubmittingServis ? 'Menyimpan...' : 'Ajukan Servis'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderUpdateServisModal = () => {
    if (!isUpdateServisModalOpen || !selectedServisItem) return null;

    return (
      <div className="modal-overlay" onClick={() => setIsUpdateServisModalOpen(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
          <div className="modal-header">
            <h2>Update Status & Pengembalian Servis</h2>
            <button type="button" className="close-btn" onClick={() => setIsUpdateServisModalOpen(false)}>&times;</button>
          </div>
          <form onSubmit={handleUpdateServisSubmit} className="bmn-form">
            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', marginBottom: '1.2rem', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1.05rem' }}>
                {selectedServisItem.nama_barang}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginTop: '0.25rem', lineHeight: '1.6' }}>
                <div><strong>No BMN:</strong> {selectedServisItem.no_bmn || '-'} {selectedServisItem.nup ? `(NUP: ${selectedServisItem.nup})` : ''} | <strong>Bidang:</strong> {selectedServisItem.bidang}</div>
                <div><strong>Pengaju:</strong> {selectedServisItem.nama_pengaju}</div>
                <div><strong>Tanggal Keluar Servis:</strong> {formatDate(selectedServisItem.tanggal_keluar)}</div>
              </div>
            </div>

            <div className="form-group">
              <label>Status Servis *</label>
              <select
                value={updateServisForm.status}
                onChange={e => {
                  const newStatus = e.target.value;
                  setUpdateServisForm(prev => ({
                    ...prev,
                    status: newStatus,
                    tanggal_kembali: newStatus === 'Selesai' && !prev.tanggal_kembali ? new Date().toISOString().split('T')[0] : prev.tanggal_kembali
                  }));
                }}
              >
                <option value="Diajukan">Diajukan (Menunggu Konfirmasi / Jadwal Keluar)</option>
                <option value="Sedang Diservis">Sedang Diservis (Dalam Pengerjaan)</option>
                <option value="Selesai">Selesai (Barang Telah Selesai & Kembali)</option>
                <option value="Dibatalkan">Dibatalkan</option>
              </select>
            </div>

            {/* FITUR TANGGAL BARANG DIKEMBALIKAN */}
            <div className="form-group">
              <label style={{ fontWeight: 600, color: updateServisForm.status === 'Selesai' ? '#16a34a' : 'var(--text)' }}>
                📅 Tanggal Barang Dikembalikan {updateServisForm.status === 'Selesai' ? '(Aktual Selesai & Diterima)' : '(Estimasi Rencana)'}
              </label>
              <input
                type="date"
                value={updateServisForm.tanggal_kembali || ''}
                onChange={e => setUpdateServisForm({ ...updateServisForm, tanggal_kembali: e.target.value })}
              />
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                {updateServisForm.status === 'Selesai'
                  ? 'Catat tanggal barang resmi diterima kembali di kantor setelah perbaikan'
                  : 'Tanggal perkiraan barang selesai diperbaiki'}
              </span>
            </div>

            <div className="form-group">
              <label>Hasil Servis / Tindakan Perbaikan</label>
              <textarea
                rows="3"
                placeholder="Contoh: Selesai diperbaiki, komponen sensor diganti baru, telah dilakukan uji fungsi dan kalibrasi..."
                value={updateServisForm.hasil_servis}
                onChange={e => setUpdateServisForm({ ...updateServisForm, hasil_servis: e.target.value })}
              ></textarea>
            </div>

            <div className="form-group">
              <label>Biaya Akhir / Aktual Servis (Rp)</label>
              <input
                type="number"
                placeholder="0"
                value={updateServisForm.biaya_servis}
                onChange={e => setUpdateServisForm({ ...updateServisForm, biaya_servis: e.target.value })}
              />
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setIsUpdateServisModalOpen(false)}>
                Batal
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ backgroundColor: updateServisForm.status === 'Selesai' ? '#16a34a' : undefined, borderColor: updateServisForm.status === 'Selesai' ? '#16a34a' : undefined }}
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* ===== HEADER: LOGO BMKG & ENLARGED PSIMKG ON TOP OF SISTEM INFORMASI BMN ===== */}
      <header className="app-header">
        <div className="header-container">
          <img src={apiUrl("/logo-bmkg.png")} alt="Logo BMKG" className="header-logo" />
          <div className="header-text-block">
            <h1 className="header-instansi-title">PSIMKG - PUSAT STANDARDISASI INSTRUMEN MKG</h1>
            <p className="header-instansi-sub">Badan Meteorologi, Klimatologi, dan Geofisika</p>
            <h2 className="header-app-title">Sistem Informasi Barang Milik Negara (BMN)</h2>
          </div>
        </div>
      </header>

      {/* Akses Masuk Gate: Navbar HANYA tampil jika user sudah login */}
      {user && renderNavbar()}

      <main className="app-main">
        {isCheckingAuth ? (
          <div className="loading-state">Memeriksa sesi login...</div>
        ) : !user ? (
          renderLoginPage()
        ) : (
          <>
            {currentPage === 'dashboard' && renderDashboard()}
            {currentPage === 'peminjaman' && renderPeminjamanPage()}
            {currentPage === 'servis' && renderServisPage()}
            {['meteorologi', 'klimatologi', 'geofisika', 'tatausaha'].includes(currentPage) && renderBidangPage(getBidangName(currentPage))}
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} PSIMKG - Pusat Standardisasi Instrumen Meteorologi Klimatologi dan Geofisika</p>
      </footer>

      {user && (
        <>
          {renderAddModal()}
          {renderAddPinjamModal()}
          {renderReturnModal()}
          {renderAddServisModal()}
          {renderUpdateServisModal()}
          {renderLightbox()}
        </>
      )}

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
