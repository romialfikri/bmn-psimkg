import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

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

  // Login State
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // Add Item State
  const [addForm, setAddForm] = useState({
    no_bmn: '',
    nama_barang: '',
    tahun_barang: '',
    harga_barang: '',
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
      axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        if (res.data.success || res.data.data) {
          setUser(res.data.data);
        }
      })
      .catch(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('bmn_token');
      });
    } else {
      setUser(null);
    }
  }, [token]);

  useEffect(() => {
    if (currentPage === 'dashboard') {
      fetchDashboard();
    } else if (['meteorologi', 'klimatologi', 'geofisika', 'tatausaha'].includes(currentPage)) {
      fetchBidangData(getBidangName(currentPage), search, page);
    }
  }, [currentPage, page]);

  // --- API Calls ---
  const fetchDashboard = async () => {
    try {
      const res = await axios.get('/api/barang/stats/summary');
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
      const res = await axios.get(`/api/barang?bidang=${encodeURIComponent(bidangName)}&search=${encodeURIComponent(searchQuery)}&page=${pageNum}&limit=10`);
      if (res.data && res.data.data) {
        setBidangData(res.data.data);
        setTotalPages(res.data.totalPages || 1);
      }
    } catch (err) {
      console.error('Error fetching bidang data:', err);
      showToast('Gagal memuat data barang', 'error');
    }
  };

  // --- Event Handlers ---
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchBidangData(getBidangName(currentPage), search, 1);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus data ini?')) return;
    try {
      await axios.delete(`/api/barang/${id}`, {
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
      const res = await axios.post('/api/auth/login', loginForm);
      if (res.data && res.data.token) {
        // Handle common structure { token, user } or { data: { token, user } }
        const tokenData = res.data.token || res.data.data?.token;
        const userData = res.data.user || res.data.data?.user;
        
        setToken(tokenData);
        localStorage.setItem('bmn_token', tokenData);
        setUser(userData);
        showToast('Login berhasil', 'success');
        setCurrentPage('dashboard');
        setLoginForm({ username: '', password: '' });
      } else if (res.data.data) {
        setToken(res.data.data.token);
        localStorage.setItem('bmn_token', res.data.data.token);
        setUser(res.data.data.user);
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
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('no_bmn', addForm.no_bmn);
      formData.append('nama_barang', addForm.nama_barang);
      formData.append('tahun_barang', addForm.tahun_barang);
      formData.append('harga_barang', addForm.harga_barang);
      formData.append('keterangan', addForm.keterangan);

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

      await axios.post('/api/barang', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      showToast('Data berhasil ditambahkan', 'success');
      setIsAddModalOpen(false);
      setAddForm({ no_bmn: '', nama_barang: '', tahun_barang: '', harga_barang: '', keterangan: '', bidang: '' });
      setAddFile(null);
      setAddPreview('');
      
      if (['meteorologi', 'klimatologi', 'geofisika', 'tatausaha'].includes(currentPage)) {
        fetchBidangData(getBidangName(currentPage), search, page);
      }
    } catch (err) {
      console.error('Error adding data:', err);
      showToast(err.response?.data?.message || 'Gagal menambah data', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Render Helpers ---
  const renderNavbar = () => (
    <nav className="nav-bar">
      <div className="nav-links">
        {['dashboard', 'meteorologi', 'klimatologi', 'geofisika', 'tatausaha'].map(p => (
          <button
            key={p}
            className={`nav-link ${currentPage === p ? 'active' : ''}`}
            onClick={() => {
              setCurrentPage(p);
              setSearch('');
              setPage(1);
            }}
          >
            {p === 'tatausaha' ? 'Tata Usaha' : p.charAt(0).toUpperCase() + p.slice(1)}
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

  const renderDashboard = () => {
    if (!dashboardData) return <div className="loading-state">Memuat data dashboard...</div>;
    const { total, totalHarga, bidangStats, recentItems, perTahun } = dashboardData;

    return (
      <div>
        <h2 className="dashboard-title">Dashboard BMN - PSIMKG</h2>

        <div className="stats-grid">
          <div className="stat-card total">
            <h3>Total BMN</h3>
            <div className="stat-value">{total}</div>
          </div>
          <div className="stat-card nilai">
            <h3>Total Nilai BMN</h3>
            <div className="stat-value">{formatRupiah(totalHarga)}</div>
          </div>
          {['Meteorologi', 'Klimatologi', 'Geofisika', 'Tata Usaha'].map(b => {
            const cssClass = b.toLowerCase().replace(' ', '');
            return (
              <div key={b} className={`stat-card ${cssClass}`}>
                <h3>{b}</h3>
                <div className="stat-value">{bidangStats?.[b]?.jumlah || 0}</div>
                <div className="stat-sub">{formatRupiah(bidangStats?.[b]?.totalHarga || 0)}</div>
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
                <th>Nama Barang</th>
                <th>Bidang</th>
                <th>Tahun</th>
                <th>Harga</th>
                <th>Tanggal Upload</th>
              </tr>
            </thead>
            <tbody>
              {recentItems?.map((item, i) => (
                <tr key={item.id || i}>
                  <td className="nobmn-cell">{item.no_bmn || '-'}</td>
                  <td>{item.nama_barang}</td>
                  <td><span className={`bidang-badge ${item.bidang?.toLowerCase().replace(' ', '')}`}>{item.bidang}</span></td>
                  <td>{item.tahun_barang}</td>
                  <td className="harga-cell">{formatRupiah(item.harga_barang)}</td>
                  <td className="date-cell">{formatDate(item.created_at)}</td>
                </tr>
              ))}
              {(!recentItems || recentItems.length === 0) && (
                <tr><td colSpan="6" className="empty-state">Belum ada data BMN</td></tr>
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
    const colSpan = showAksi ? 9 : 8;

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
                placeholder="Cari nama atau No BMN..."
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
                <th>Nama Barang</th>
                <th>Tahun</th>
                <th>Harga</th>
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
                          src={`/uploads/${item.foto_barang}`}
                          alt="Thumbnail"
                          className="thumbnail"
                          onClick={() => setLightboxImage(`/uploads/${item.foto_barang}`)}
                        />
                      ) : <div className="no-image">No Image</div>}
                    </td>
                    <td className="nobmn-cell">{item.no_bmn || '-'}</td>
                    <td>{item.nama_barang}</td>
                    <td>{item.tahun_barang}</td>
                    <td className="harga-cell">{formatRupiah(item.harga_barang)}</td>
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

  const renderLoginPage = () => (
    <div className="login-container">
      <div className="login-card">
        <h2>Login Sistem BMN</h2>
        <p className="login-subtitle">Masuk untuk mengelola data BMN</p>
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
          <button type="submit" className="btn btn-primary btn-login">Login</button>
        </form>
        <div className="login-info">
          <strong>Akun yang tersedia:</strong>
          <code>admin</code> / <code>admin123</code> — Administrator (semua bidang)<br/>
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
            <div className="form-group">
              <label>No BMN</label>
              <input 
                type="text" 
                placeholder="Contoh: BMN-2024-001"
                value={addForm.no_bmn} 
                onChange={e => setAddForm({...addForm, no_bmn: e.target.value})} 
              />
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
                  placeholder="2024"
                  value={addForm.tahun_barang} 
                  onChange={e => setAddForm({...addForm, tahun_barang: e.target.value})} 
                />
              </div>
              <div className="form-group">
                <label>Harga Barang (Rp)</label>
                <input 
                  type="number" 
                  placeholder="0"
                  value={addForm.harga_barang} 
                  onChange={e => setAddForm({...addForm, harga_barang: e.target.value})} 
                />
              </div>
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
                placeholder="Kondisi barang, lokasi, atau catatan lainnya..."
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

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>Sistem Informasi Barang Milik Negara (BMN)</h1>
          <p>PSIMKG - Pusat Standardisasi Instrumen MKG</p>
        </div>
      </header>

      {renderNavbar()}

      <main className="app-main">
        {currentPage === 'dashboard' && renderDashboard()}
        {currentPage === 'login' && renderLoginPage()}
        {['meteorologi', 'klimatologi', 'geofisika', 'tatausaha'].includes(currentPage) && renderBidangPage(getBidangName(currentPage))}
      </main>

      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} PSIMKG - Pusat Standardisasi Instrumen Meteorologi Klimatologi dan Geofisika</p>
      </footer>

      {renderAddModal()}
      {renderLightbox()}

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
