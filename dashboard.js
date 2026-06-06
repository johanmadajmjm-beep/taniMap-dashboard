// ============================================================
//  CONFIG
// ============================================================
const CONFIG = {
  CLIENT_ID:     '302226546386-r864vopnd4c0s5d30hbj4hcpvoqij3j3.apps.googleusercontent.com',
  ALLOWED_EMAIL: 'johanmada.jm.jm@gmail.com',
  API_URL:       'https://script.google.com/macros/s/AKfycbw3viGGD7yGGa6DGsPgQSEuyrrzpRP5IBKWwIUiNeZfSoWixY8qvyhva4uo9r8Vhl7_2Q/exec',
  DRIVE_FOLDER:  '1r0_NgQg7iE9LfZwm3MfuW4fRXg54vBuD',
};

// ============================================================
//  STATE
// ============================================================
let state = {
  token:      null,
  user:       null,
  data:       { petani: [], kunjungan: [], produksi: [], tanaman: [], hama: [] },
  driveFiles: [],
  charts:     {},
  maps:       { overview: null, peta: null },
  currentPage: 'overview',
  pagination:  { petani: 1, kunjungan: 1, produksi: 1, tanaman: 1 },
  filtered:    { petani: [], kunjungan: [], produksi: [], tanaman: [] },
};
const PER_PAGE = 25;

// ============================================================
//  AUTH
// ============================================================
function loginWithGoogle() {
  const client = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.readonly email profile',
    callback: async (resp) => {
      if (resp.error) { alert('Login gagal: ' + resp.error); return; }
      state.token = resp.access_token;

      // Verifikasi email
      const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + state.token }
      }).then(r => r.json());

      if (info.email !== CONFIG.ALLOWED_EMAIL) {
        alert('Akses ditolak. Hanya admin yang diizinkan.');
        state.token = null;
        return;
      }

      state.user = info;
      showApp();
      await refreshData();
    }
  });
  client.requestAccessToken();
}

function logout() {
  if (!confirm('Yakin ingin keluar?')) return;
  google.accounts.oauth2.revoke(state.token);
  state.token = null;
  state.user  = null;
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
}

function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appShell').style.display = 'block';

  // Set user info di sidebar
  const name = state.user?.name || 'Admin';
  const pic  = state.user?.picture;
  document.getElementById('sidebarName').textContent = name.split(' ')[0];
  const av = document.getElementById('sidebarAvatar');
  if (pic) { av.innerHTML = `<img src="${pic}" />`; }
  else { av.textContent = name[0].toUpperCase(); }
}

// ============================================================
//  DATA FETCHING
// ============================================================
async function refreshData() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('loading');
  showLoading('Memuat data dari Google Sheets...');

  try {
    const url = `${CONFIG.API_URL}?action=all&token=${state.token}`;
    const res  = await fetch(url);
    const json = await res.json();

    if (json.status !== 'ok') throw new Error(json.message || 'Gagal memuat data');

    state.data = json.data;
    state.filtered = {
      petani:    [...state.data.petani],
      kunjungan: [...state.data.kunjungan],
      produksi:  [...state.data.produksi],
      tanaman:   [...state.data.tanaman],
    };

    // Load Drive files
    await loadDriveFiles();

    // Update timestamp
    const now = new Date().toLocaleString('id-ID');
    document.getElementById('lastUpdate').textContent = 'Update: ' + now;

    // Render semua
    renderStats();
    renderCharts();
    renderOverviewMap();
    renderPetaPage();
    renderTable('petani');
    renderTable('kunjungan');
    renderTable('produksi');
    renderTable('tanaman');
    renderGaleri();
    populatePetaFilters();

  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.classList.remove('loading');
    hideLoading();
  }
}

async function loadDriveFiles() {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${CONFIG.DRIVE_FOLDER}'+in+parents+and+mimeType+contains+'image/'&fields=files(id,name,thumbnailLink,webContentLink,createdTime)&pageSize=200&orderBy=createdTime+desc`,
      { headers: { Authorization: 'Bearer ' + state.token } }
    );
    const json = await res.json();
    state.driveFiles = json.files || [];
  } catch (e) {
    state.driveFiles = [];
  }
}

// ============================================================
//  STATS
// ============================================================
function renderStats() {
  const d = state.data;
  document.getElementById('st-petani').textContent    = d.petani.length;
  document.getElementById('st-kunjungan').textContent = d.kunjungan.length;
  document.getElementById('st-produksi').textContent  = d.produksi.length;
  document.getElementById('st-tanaman').textContent   = d.tanaman.length;
  document.getElementById('st-hama').textContent      = (d.hama || []).length;
}

// ============================================================
//  CHARTS
// ============================================================
function renderCharts() {
  const d = state.data;
  const GREEN  = ['#059669','#34d399','#065f46','#6ee7b7','#a7f3d0','#d1fae5'];
  const MULTI  = ['#059669','#2563eb','#d97706','#7c3aed','#0891b2','#dc2626','#64748b'];

  // Chart 1: Komoditas
  const kommCount = {};
  d.petani.forEach(p => { const k = p['Komoditas'] || 'Lainnya'; kommCount[k] = (kommCount[k]||0)+1; });
  renderChart('chartKomoditas', 'doughnut', Object.keys(kommCount), Object.values(kommCount), MULTI);

  // Chart 2: Desa
  const desaCount = {};
  d.petani.forEach(p => { const ds = p['Desa'] || 'Tidak Diketahui'; desaCount[ds] = (desaCount[ds]||0)+1; });
  const desaSorted = Object.entries(desaCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
  renderChart('chartDesa', 'bar', desaSorted.map(x=>x[0]), desaSorted.map(x=>x[1]), GREEN[0]);

  // Chart 3: Produksi total per komoditas
  const prodCount = {};
  d.produksi.forEach(p => {
    const k = p['Komoditas'] || 'Lainnya';
    prodCount[k] = (prodCount[k]||0) + (parseFloat(p['Total (Rp)'])||0);
  });
  renderChart('chartProduksi', 'bar', Object.keys(prodCount), Object.values(prodCount), GREEN[0], true);

  // Chart 4: Status tanaman
  const statusCount = {};
  d.tanaman.forEach(t => { const s = t['Status'] || 'Tidak Diketahui'; statusCount[s] = (statusCount[s]||0)+1; });
  renderChart('chartTanaman', 'doughnut', Object.keys(statusCount), Object.values(statusCount), MULTI);
}

function renderChart(id, type, labels, data, color, isCurrency=false) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  if (state.charts[id]) state.charts[id].destroy();

  const colors = Array.isArray(color) ? color : Array(data.length).fill(color);

  state.charts[id] = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: type === 'doughnut' ? colors : color,
        borderColor: type === 'bar' ? color : 'transparent',
        borderRadius: type === 'bar' ? 6 : 0,
        borderWidth: 1,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { position: type === 'doughnut' ? 'right' : 'none',
          labels: { font: { size: 11, family: 'DM Sans' }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw;
              if (isCurrency) return ' Rp ' + Number(val).toLocaleString('id-ID');
              return ' ' + val;
            }
          }
        }
      },
      scales: type === 'bar' ? {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 },
          callback: isCurrency ? (v) => 'Rp ' + (v/1e6).toFixed(1) + 'jt' : undefined } }
      } : {}
    }
  });
}

// ============================================================
//  MAPS
// ============================================================
const COMMODITY_COLORS = {
  'Kopi Arabika': '#059669', 'Kopi Robusta': '#065f46',
  'Kakao': '#92400e', 'Cengkeh': '#7c3aed',
  'Vanili': '#0891b2', 'Padi': '#ca8a04',
  'Jagung': '#ea580c', 'Cabai': '#dc2626',
};
function getCommodityColor(k) { return COMMODITY_COLORS[k] || '#64748b'; }

function renderOverviewMap() {
  if (!state.maps.overview) {
    state.maps.overview = L.map('dashMap', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 18
    }).addTo(state.maps.overview);
  }
  const map = state.maps.overview;

  // Clear existing markers
  map.eachLayer(l => { if (l instanceof L.CircleMarker) map.removeLayer(l); });

  const withGPS = state.data.petani.filter(p => p['Latitude'] && p['Longitude']);
  document.getElementById('mapCount').textContent = `${withGPS.length} titik GPS`;

  if (!withGPS.length) { map.setView([-8.6, 120.4], 9); return; }

  const bounds = [];
  withGPS.forEach(p => {
    const lat = parseFloat(p['Latitude']);
    const lng = parseFloat(p['Longitude']);
    if (isNaN(lat) || isNaN(lng)) return;
    bounds.push([lat, lng]);
    const color = getCommodityColor(p['Komoditas']);
    L.circleMarker([lat, lng], {
      radius: 8, fillColor: color, color: 'white',
      weight: 2, opacity: 1, fillOpacity: 0.85
    }).addTo(map).bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;min-width:160px">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px">${p['Nama'] || '-'}</div>
        <div style="font-size:12px;color:#64748b">📍 ${p['Desa'] || '-'}, ${p['Kecamatan'] || '-'}</div>
        <div style="font-size:12px;margin-top:4px">🌿 ${p['Komoditas'] || '-'}</div>
        <div style="font-size:12px">🗺️ ${p['Total Lahan (Ha)'] || '-'} Ha</div>
      </div>
    `);
  });

  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
}

function renderPetaPage() {
  if (!state.maps.peta) {
    state.maps.peta = L.map('petaMap', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 18
    }).addTo(state.maps.peta);
  }
  const map = state.maps.peta;
  map.eachLayer(l => { if (l instanceof L.CircleMarker) map.removeLayer(l); });

  const fKom  = document.getElementById('petaFilterKomoditas')?.value || '';
  const fDesa = document.getElementById('petaFilterDesa')?.value || '';

  let petani = state.data.petani;
  if (fKom)  petani = petani.filter(p => p['Komoditas'] === fKom);
  if (fDesa) petani = petani.filter(p => p['Desa'] === fDesa);

  const withGPS = petani.filter(p => p['Latitude'] && p['Longitude']);
  const bounds  = [];

  withGPS.forEach(p => {
    const lat = parseFloat(p['Latitude']);
    const lng = parseFloat(p['Longitude']);
    if (isNaN(lat) || isNaN(lng)) return;
    bounds.push([lat, lng]);
    L.circleMarker([lat, lng], {
      radius: 10, fillColor: getCommodityColor(p['Komoditas']),
      color: 'white', weight: 2, opacity: 1, fillOpacity: 0.9
    }).addTo(map).bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;min-width:180px">
        <div style="font-weight:700;font-size:14px;margin-bottom:6px">${p['Nama'] || '-'}</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:2px">📍 ${p['Desa'] || '-'}, ${p['Kecamatan'] || '-'}</div>
        <div style="font-size:12px;margin-bottom:2px">🌿 <b>${p['Komoditas'] || '-'}</b></div>
        <div style="font-size:12px;margin-bottom:2px">🗺️ ${p['Total Lahan (Ha)'] || '-'} Ha</div>
        <div style="font-size:12px">📞 ${p['HP'] || '-'}</div>
      </div>
    `);
  });

  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
  else map.setView([-8.6, 120.4], 9);

  setTimeout(() => map.invalidateSize(), 200);
}

function populatePetaFilters() {
  const komSel  = document.getElementById('petaFilterKomoditas');
  const desaSel = document.getElementById('petaFilterDesa');

  const koms  = [...new Set(state.data.petani.map(p => p['Komoditas']).filter(Boolean))].sort();
  const desas = [...new Set(state.data.petani.map(p => p['Desa']).filter(Boolean))].sort();

  koms.forEach(k  => { const o = document.createElement('option'); o.value = k; o.textContent = k; komSel.appendChild(o); });
  desas.forEach(d => { const o = document.createElement('option'); o.value = d; o.textContent = d; desaSel.appendChild(o); });
}

// ============================================================
//  TABLES
// ============================================================
function renderTable(type) {
  const data = state.filtered[type] || [];
  const page = state.pagination[type] || 1;
  const start = (page - 1) * PER_PAGE;
  const slice = data.slice(start, start + PER_PAGE);

  const tbody = document.getElementById(type + 'Table');
  if (!tbody) return;

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="20"><div class="empty"><i class="fas fa-inbox"></i><p>Belum ada data</p></div></td></tr>`;
    renderPagination(type, data.length, page);
    return;
  }

  tbody.innerHTML = slice.map((row, i) => {
    const no = start + i + 1;
    switch (type) {
      case 'petani':
        return `<tr>
          <td style="color:var(--s5)">${no}</td>
          <td><strong>${row['Nama']||'-'}</strong></td>
          <td>${row['Desa']||'-'}</td>
          <td>${row['Kecamatan']||'-'}</td>
          <td>${commodityBadge(row['Komoditas'])}</td>
          <td>${row['Total Lahan (Ha)']||'-'}</td>
          <td>${row['HP']||'-'}</td>
          <td style="color:var(--s5);font-size:12px">${row['Tgl Input']||'-'}</td>
        </tr>`;
      case 'kunjungan':
        return `<tr>
          <td style="color:var(--s5)">${no}</td>
          <td><strong>${row['Nama Petani']||'-'}</strong></td>
          <td>${row['Desa']||'-'}</td>
          <td style="font-size:12px">${row['Tanggal']||'-'}</td>
          <td>${row['Petugas']||'-'}</td>
          <td>${kondisiBadge(row['Kondisi'])}</td>
          <td style="font-size:12px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${row['Masalah']||'-'}</td>
          <td style="font-size:12px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${row['Rekomendasi']||'-'}</td>
        </tr>`;
      case 'produksi':
        return `<tr>
          <td style="color:var(--s5)">${no}</td>
          <td><strong>${row['Nama Petani']||'-'}</strong></td>
          <td>${row['Desa']||'-'}</td>
          <td>${commodityBadge(row['Komoditas'])}</td>
          <td>${row['Tahun']||'-'}</td>
          <td style="font-size:12px">${row['Musim']||'-'}</td>
          <td>${row['Jumlah']||'-'}</td>
          <td>${row['Satuan']||'-'}</td>
          <td>${row['Luas (Ha)']||'-'}</td>
          <td style="font-weight:600;color:var(--g2)">Rp ${Number(row['Total (Rp)']||0).toLocaleString('id-ID')}</td>
          <td style="font-size:12px">${row['Pembeli']||'-'}</td>
        </tr>`;
      case 'tanaman':
        return `<tr>
          <td style="color:var(--s5)">${no}</td>
          <td><strong>${row['Nama Petani']||'-'}</strong></td>
          <td>${row['Desa']||'-'}</td>
          <td>${row['Jenis Tanaman']||'-'}</td>
          <td>${row['Luas Tanam (Ha)']||'-'}</td>
          <td>${row['Umur (Bln)']||'-'}</td>
          <td>${statusTanamanBadge(row['Status'])}</td>
          <td style="font-size:12px">${row['Perkiraan Panen']||'-'}</td>
        </tr>`;
      default: return '';
    }
  }).join('');

  renderPagination(type, data.length, page);
}

function renderPagination(type, total, current) {
  const el = document.getElementById(type + 'Pagination');
  if (!el) return;
  const totalPages = Math.ceil(total / PER_PAGE);
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - current) <= 2) {
      html += `<button class="page-btn ${i===current?'active':''}" onclick="goPage('${type}',${i})">${i}</button>`;
    } else if (Math.abs(i - current) === 3) {
      html += `<span style="color:var(--s5);font-size:12px">...</span>`;
    }
  }
  html += `<span class="page-info">${total} data</span>`;
  el.innerHTML = html;
}

function goPage(type, page) {
  state.pagination[type] = page;
  renderTable(type);
  document.getElementById('page-' + type).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function filterTable(tableId, query) {
  const type = tableId.replace('Table', '');
  const q = query.toLowerCase().trim();
  const src = state.data[type] || [];

  if (!q) {
    state.filtered[type] = [...src];
  } else {
    state.filtered[type] = src.filter(row =>
      Object.values(row).some(v => String(v).toLowerCase().includes(q))
    );
  }
  state.pagination[type] = 1;
  renderTable(type);
}

// ============================================================
//  GALERI
// ============================================================
function renderGaleri() {
  const filter = document.getElementById('galeriFilter')?.value || '';
  const grid   = document.getElementById('galeriGrid');
  if (!grid) return;

  let files = state.driveFiles;
  if (filter) files = files.filter(f => f.name.toLowerCase().startsWith(filter));

  if (!files.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><i class="fas fa-images"></i><p>Belum ada foto di Google Drive</p></div>`;
    return;
  }

  grid.innerHTML = files.map(f => {
    const thumb = f.thumbnailLink || '';
    const type  = f.name.startsWith('petani') ? 'Petani' :
                  f.name.startsWith('lahan')  ? 'Lahan'  :
                  f.name.startsWith('tanaman')? 'Tanaman' : 'Foto';
    const displayName = f.name.replace(/^(petani|lahan|tanaman)_/, '').replace('.jpg','').replace(/_/g,' ');
    return `<div class="gallery-item" onclick="openLightbox('${f.id}','${displayName}','${type}')">
      <img src="${thumb}" alt="${displayName}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23f1f5f9%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2255%22 text-anchor=%22middle%22 font-size=%2230%22>📷</text></svg>'" />
      <div class="gallery-item-info">
        <div class="gallery-item-name">${displayName}</div>
        <div class="gallery-item-type">${type}</div>
      </div>
    </div>`;
  }).join('');
}

function openLightbox(fileId, name, type) {
  const lb     = document.getElementById('lightbox');
  const img    = document.getElementById('lightboxImg');
  const caption = document.getElementById('lightboxCaption');
  img.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
  caption.textContent = `${name} — ${type}`;
  lb.classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('lightboxImg').src = '';
}

// ============================================================
//  NAVIGATION
// ============================================================
const PAGE_TITLES = {
  overview: 'Overview', peta: 'Peta Sebaran',
  petani: 'Data Petani', kunjungan: 'Kunjungan Lapangan',
  produksi: 'Data Produksi', tanaman: 'Data Tanaman', galeri: 'Galeri Foto',
};

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id)?.classList.add('active');
  document.querySelector(`[onclick="showPage('${id}')"]`)?.classList.add('active');
  document.getElementById('pageTitle').textContent = PAGE_TITLES[id] || id;
  state.currentPage = id;

  // Invalidate maps when shown
  if (id === 'peta' && state.maps.peta) {
    setTimeout(() => state.maps.peta.invalidateSize(), 100);
    renderPetaPage();
  }
  if (id === 'overview' && state.maps.overview) {
    setTimeout(() => state.maps.overview.invalidateSize(), 100);
  }
}

// ============================================================
//  BADGES
// ============================================================
function commodityBadge(k) {
  const map = {
    'Kopi Arabika':'badge-green','Kopi Robusta':'badge-green',
    'Kakao':'badge-amber','Cengkeh':'badge-purple',
    'Vanili':'badge-blue','Padi':'badge-green',
    'Jagung':'badge-amber','Cabai':'badge-red',
  };
  return `<span class="badge ${map[k]||'badge-gray'}">${k||'-'}</span>`;
}
function kondisiBadge(k) {
  const map = { 'Baik':'badge-green','Perlu Perhatian':'badge-amber','Kritis':'badge-red' };
  return `<span class="badge ${map[k]||'badge-gray'}">${k||'-'}</span>`;
}
function statusTanamanBadge(s) {
  const map = { 'Baik':'badge-green','Perawatan':'badge-amber','Terserang Hama':'badge-red','Siap Panen':'badge-blue' };
  return `<span class="badge ${map[s]||'badge-gray'}">${s||'-'}</span>`;
}

// ============================================================
//  LOADING
// ============================================================
function showLoading(msg='Memuat...') {
  document.getElementById('loadingMsg').textContent = msg;
  document.getElementById('loadingOverlay').classList.add('show');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}
