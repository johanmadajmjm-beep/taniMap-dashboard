// ============================================================
//  AUTH — USERNAME & PASSWORD
// ============================================================
const CREDENTIALS = [
  { username: 'Ayotani',   password: 'tanimap2026' },
  { username: 'johan',   password: 'admin123'    },
];

function doLogin() {
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');

  const valid = CREDENTIALS.some(c => c.username === user && c.password === pass);
  if (valid) {
    errEl.style.display = 'none';
    sessionStorage.setItem('tm_auth', btoa(user + ':' + Date.now()));
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('appShell').style.display = 'block';
    refreshData();
  } else {
    errEl.style.display = 'block';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginPass').focus();
  }
}

function togglePass() {
  const input = document.getElementById('loginPass');
  const icon  = document.getElementById('passEyeIcon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fas fa-eye';
  }
}

function checkSession() {
  const auth = sessionStorage.getItem('tm_auth');
  if (auth) {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('appShell').style.display = 'block';
    return true;
  }
  return false;
}

function doLogout() {
  sessionStorage.removeItem('tm_auth');
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
}

// ============================================================
//  CONFIG
// ============================================================
const CONFIG = {
  API_URL:      'https://script.google.com/macros/s/AKfycbwoEMQvUoiZbdvrg9GpTX0tpEB53n7-gGK45QYUzVc-c-_iEik4vZ2A_KPr_lFpDM7a/exec',
  DRIVE_FOLDER: '1r0_NgQg7iE9LfZwm3MfuW4fRXg54vBuD',
};

// ============================================================
//  STATE
// ============================================================
let state = {
  data: { petani:[], kunjungan:[], produksi:[], tanaman:[], hama:[] },
  driveFiles: [],
  charts: {},
  maps: { peta: null },
  currentPage: 'overview',
  pagination: { petani:1, kunjungan:1, produksi:1, tanaman:1 },
  filtered: { petani:[], kunjungan:[], produksi:[], tanaman:[], hama:[] },
  colFilters: { petani:{}, kunjungan:{}, produksi:{}, tanaman:{}, hama:{} },
};
const PER_PAGE = 25;

// ============================================================
//  DATA
// ============================================================

// JSONP fetch untuk bypass CORS Apps Script
function fetchJSONP(url) {
  return new Promise((resolve, reject) => {
    const cbName = 'cb_' + Date.now();
    const script = document.createElement('script');
    window[cbName] = (data) => {
      delete window[cbName];
      document.body.removeChild(script);
      resolve(data);
    };
    script.onerror = () => {
      delete window[cbName];
      document.body.removeChild(script);
      reject(new Error('Failed to fetch'));
    };
    script.src = url + '&callback=' + cbName;
    document.body.appendChild(script);
  });
}

async function refreshData() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('loading');
  showLoading('Memuat data dari Google Sheets...');
  try {
    const json = await fetchJSONP(`${CONFIG.API_URL}?action=all`);
    if (json.status !== 'ok') throw new Error(json.message || 'Gagal memuat data');
    state.data = json.data;
    // Reset filters
    state.colFilters = { petani:{}, kunjungan:{}, produksi:{}, tanaman:{}, hama:{} };
    state.filtered = {
      petani:    [...state.data.petani],
      kunjungan: [...state.data.kunjungan],
      produksi:  [...state.data.produksi],
      tanaman:   [...state.data.tanaman],
      hama:      [...(state.data.hama||[])],
    };
    showLoading('Memuat foto dari Google Drive...');
    await loadDriveFiles();
    document.getElementById('lastUpdate').textContent =
      'Update: ' + new Date().toLocaleString('id-ID');
    renderAll();
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.classList.remove('loading');
    hideLoading();
  }
}

async function loadDriveFiles() {
  try {
    const json = await fetchJSONP(`${CONFIG.API_URL}?action=photos`);
    if (json.status === 'ok') {
      state.driveFiles = json.data.photos || [];
    } else {
      state.driveFiles = [];
    }
  } catch(e) {
    state.driveFiles = [];
  }
}

function renderAll() {
  renderStats();
  renderCharts();
  // peta dirender saat halaman dibuka
  renderTable('petani');
  renderTable('kunjungan');
  renderTable('produksi');
  renderTable('tanaman');
  renderTable('hama');
  renderSummaries();
  renderPetaInfoBox();
  renderLaporan();
  renderGaleri();
  populatePetaFilters();
  updateCounts();
}

// ============================================================
//  STATS
// ============================================================
function renderStats() {
  const d = state.data;
  document.getElementById('st-petani').textContent    = d.petani.length;
  document.getElementById('st-kunjungan').textContent = d.kunjungan.length;
  const totalPenjualan = d.produksi.reduce((s,p)=>s+(parseFloat(p['Total (Rp)'])||0),0);
  const totalLahanProd = d.produksi.reduce((s,p)=>s+(parseFloat(p['Luas (Ha)'])||0),0);
  const penjualanStr = totalPenjualan >= 1e9
    ? (totalPenjualan/1e9).toFixed(1) + 'M'
    : totalPenjualan >= 1e6
    ? (totalPenjualan/1e6).toFixed(1) + 'jt'
    : totalPenjualan.toLocaleString('id-ID');
  document.getElementById('st-produksi').textContent = penjualanStr + ' / ' + totalLahanProd.toFixed(1) + 'Ha';
  const totalLahanTanaman = d.tanaman.reduce((s,t)=>s+(parseFloat(t['Luas Tanam (Ha)'])||0),0);
  document.getElementById('st-tanaman').textContent = d.tanaman.length + ' / ' + totalLahanTanaman.toFixed(1) + 'Ha';
  document.getElementById('st-hama').textContent      = (d.hama||[]).length;
}

function updateCounts() {
  const types = ['petani','kunjungan','produksi','tanaman','hama'];
  types.forEach(t => {
    const el = document.getElementById(t + 'Count');
    if (el) el.textContent = `${state.filtered[t].length} data`;
  });
}

// ============================================================
//  CHARTS
// ============================================================
const PALETTE = ['#059669','#2563eb','#d97706','#7c3aed','#0891b2','#dc2626','#64748b','#ea580c','#ca8a04','#16a34a'];

function renderCharts() {
  const d = state.data;

  // 1. Komoditas (doughnut)
  const kommCount = {};
  d.petani.forEach(p => { const k = p['Komoditas']||'Lainnya'; kommCount[k]=(kommCount[k]||0)+1; });
  renderChart('chartKomoditas','doughnut',Object.keys(kommCount),Object.values(kommCount),PALETTE);

  // 2. Status Tanaman (doughnut)
  const stCount = {};
  d.tanaman.forEach(t => { const s = t['Status']||'Tidak Diketahui'; stCount[s]=(stCount[s]||0)+1; });
  renderChart('chartTanaman','doughnut',Object.keys(stCount),Object.values(stCount),PALETTE);


  // 4. Petani per Desa (bar - top 10) - warna hijau gradient
  const desaCount = {};
  d.petani.forEach(p => { const ds = p['Desa']||'?'; desaCount[ds]=(desaCount[ds]||0)+1; });
  const desaTop = Object.entries(desaCount).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const desaColors = desaTop.map((_,i) => `hsl(${152 - i*6}, ${75-i*2}%, ${42+i*2}%)`);
  renderChart('chartDesa','bar',desaTop.map(x=>x[0]),desaTop.map(x=>x[1]),desaColors);

  // 5. Total Produksi per Komoditas (horizontal bar) - warna berbeda
  const prodVal = {};
  d.produksi.forEach(p => {
    const k = p['Komoditas']||'Lainnya';
    prodVal[k] = (prodVal[k]||0) + (parseFloat(p['Total (Rp)'])||0);
  });
  const prodColors = Object.keys(prodVal).map((_,i) => `hsl(${35 + i*28}, ${80-i*3}%, ${48+i*2}%)`);
  renderChart('chartProduksi','bar',Object.keys(prodVal),Object.values(prodVal),prodColors,true,false);
}

function renderChart(id, type, labels, data, color, isCurrency=false, horizontal=false) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  if (state.charts[id]) state.charts[id].destroy();
  const colors = Array.isArray(color) ? color : Array(data.length).fill(color);

  // Untuk bar chart: sumbu kategori tidak perlu callback khusus
  // Sumbu nilai (angka) yang perlu diformat
  const valueTicks = isCurrency
    ? { font:{size:10}, callback: function(v) { return 'Rp '+(v/1e6).toFixed(1)+'jt'; } }
    : { font:{size:10} };

  const categoryTicks = { font:{size:9.5}, maxRotation: horizontal ? 0 : 30 };

  state.charts[id] = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: type==='doughnut' ? colors : (Array.isArray(color)?colors:color),
        borderRadius: type==='bar' ? 5 : 0,
        borderWidth: 0,
      }]
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: type==='doughnut',
          position: 'right',
          labels: { font:{size:10,family:'Plus Jakarta Sans'}, boxWidth:10, padding:8 }
        },
        tooltip: {
          callbacks: {
            label: function(c) {
              if (isCurrency) return ' Rp ' + Number(c.raw).toLocaleString('id-ID');
              return ' ' + c.raw;
            }
          }
        }
      },
      scales: type==='bar' ? {
        // Sumbu kategori (nama desa/komoditas)
        [horizontal ? 'y' : 'x']: {
          grid: { display: false },
          ticks: categoryTicks,
        },
        // Sumbu nilai (angka)
        [horizontal ? 'x' : 'y']: {
          grid: { color:'#f1f5f9' },
          ticks: valueTicks,
        }
      } : {}
    }
  });
}

// ============================================================
//  MAPS
// ============================================================
const COMM_COLORS = {
  'Kopi Arabika':'#059669','Kopi Robusta':'#065f46','Kakao':'#92400e',
  'Cengkeh':'#7c3aed','Vanili':'#0891b2','Padi':'#ca8a04',
  'Jagung':'#ea580c','Cabai':'#dc2626',
};
function commColor(k) { return COMM_COLORS[k]||'#64748b'; }

// Default view: Indonesia center
const INDONESIA_CENTER = [-8.65, 121.0];  // Nusa Tenggara Timur
const INDONESIA_ZOOM   = 8;

function initMap(containerId) {
  const map = L.map(containerId, { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'© OpenStreetMap', maxZoom:18
  }).addTo(map);
  map.setView(INDONESIA_CENTER, INDONESIA_ZOOM);
  return map;
}

function addMarkersToMap(map, petaniList) {
  map.eachLayer(l => { if (l instanceof L.CircleMarker) map.removeLayer(l); });
  const bounds = [];
  petaniList.forEach(p => {
    const lat = parseFloat(p['Latitude']);
    const lng = parseFloat(p['Longitude']);
    if (isNaN(lat)||isNaN(lng)) return;
    bounds.push([lat,lng]);
    const komoditas = p['Komoditas']||'-';
    const color = commColor(komoditas);
    L.circleMarker([lat,lng],{
      radius:10, fillColor:color,
      color:'white', weight:2.5, opacity:1, fillOpacity:0.9
    }).addTo(map).bindPopup(`
      <div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:220px;max-width:260px">
        <div style="background:${color};color:white;padding:10px 12px;margin:-1px -1px 10px;border-radius:6px 6px 0 0">
          <div style="font-weight:800;font-size:14px">${p['Nama']||'-'}</div>
          <div style="font-size:11px;opacity:.85;margin-top:2px">${p['Desa']||'-'}, ${p['Kecamatan']||'-'}</div>
        </div>
        <div style="padding:0 12px 10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div style="font-size:11px;color:#64748b">Komoditas</div>
          <div style="font-size:12px;font-weight:700;color:#059669">${komoditas}</div>
          <div style="font-size:11px;color:#64748b">Total Lahan</div>
          <div style="font-size:12px;font-weight:600">${p['Total Lahan (Ha)']||'-'} Ha</div>
          <div style="font-size:11px;color:#64748b">Kecamatan</div>
          <div style="font-size:12px;font-weight:600">${p['Kecamatan']||'-'}</div>
          <div style="font-size:11px;color:#64748b">Kabupaten</div>
          <div style="font-size:12px;font-weight:600">${p['Kabupaten']||'-'}</div>
          <div style="font-size:11px;color:#64748b">HP</div>
          <div style="font-size:12px;font-weight:600">${p['HP']||'-'}</div>
          <div style="font-size:11px;color:#64748b">Kelompok Tani</div>
          <div style="font-size:12px;font-weight:600">${p['Kelompok Tani']||'-'}</div>
        </div>
      </div>
    `,{maxWidth:280});
  });
  return bounds;
}



function renderPetaInfoBox() {
  const box = document.getElementById('petaInfoBox');
  if (!box) return;
  const d = state.data;
  const withGPS = d.petani.filter(p=>p['Latitude']&&p['Longitude']);

  // Komoditas terbanyak
  const kommCount = {};
  d.petani.forEach(p => { const k=p['Komoditas']||'-'; kommCount[k]=(kommCount[k]||0)+1; });
  const topKomm = Object.entries(kommCount).sort((a,b)=>b[1]-a[1])[0];

  // Desa terbanyak
  const desaCount = {};
  d.petani.forEach(p => { const ds=p['Desa']||'-'; desaCount[ds]=(desaCount[ds]||0)+1; });
  const topDesa = Object.entries(desaCount).sort((a,b)=>b[1]-a[1])[0];

  // Total lahan
  const totalLahan = d.petani.reduce((s,p)=>s+(parseFloat(p['Total Lahan (Ha)'])||0),0);

  // Total penjualan
  const totalJual = d.produksi.reduce((s,p)=>s+(parseFloat(p['Total (Rp)'])||0),0);

  const infoItems = [
    { icon:'fas fa-map-pin', color:'var(--g3)', label:'Titik GPS Terpetakan', val: withGPS.length + ' dari ' + d.petani.length + ' petani' },
    { icon:'fas fa-seedling', color:'var(--amber)', label:'Komoditas Terbanyak', val: topKomm ? topKomm[0] + ' (' + topKomm[1] + ' petani)' : '-' },
    { icon:'fas fa-map', color:'var(--blue)', label:'Desa Terbanyak', val: topDesa ? topDesa[0] + ' (' + topDesa[1] + ' petani)' : '-' },
    { icon:'fas fa-chart-line', color:'var(--purple)', label:'Total Lahan', val: totalLahan.toFixed(2) + ' Ha' },
  ];

  box.innerHTML = infoItems.map(item => `
    <div style="background:var(--card);border-radius:10px;padding:12px 14px;border:1px solid var(--border);display:flex;align-items:center;gap:10px">
      <div style="width:36px;height:36px;border-radius:50%;background:${item.color}20;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="${item.icon}" style="color:${item.color};font-size:14px"></i>
      </div>
      <div>
        <div style="font-size:10px;color:var(--s5);font-weight:600;text-transform:uppercase;letter-spacing:.04em">${item.label}</div>
        <div style="font-size:13px;font-weight:700;color:var(--s1);margin-top:2px">${item.val}</div>
      </div>
    </div>
  `).join('');
}

function renderPetaPage(fitToData=false) {
  const isNew = !state.maps.peta;
  if (isNew) state.maps.peta = initMap('petaMap');
  const map = state.maps.peta;
  const fKom  = document.getElementById('petaFilterKomoditas')?.value||'';
  const fDesa = document.getElementById('petaFilterDesa')?.value||'';
  let list = state.data.petani.filter(p=>p['Latitude']&&p['Longitude']);
  if (fKom)  list = list.filter(p=>p['Komoditas']===fKom);
  if (fDesa) list = list.filter(p=>p['Desa']===fDesa);
  // Selalu mulai dari Indonesia
  map.setView(INDONESIA_CENTER, INDONESIA_ZOOM);
  addMarkersToMap(map, list);
  // Zoom ke data hanya jika user aktif memfilter
  if (fitToData && list.length > 0) {
    const bounds = list
      .filter(p=>!isNaN(parseFloat(p['Latitude']))&&!isNaN(parseFloat(p['Longitude'])))
      .map(p=>[parseFloat(p['Latitude']),parseFloat(p['Longitude'])]);
    if (bounds.length) setTimeout(()=>map.fitBounds(bounds,{padding:[50,50],maxZoom:13}),200);
  }
  setTimeout(()=>map.invalidateSize(),150);
}


function populatePetaFilters() {
  const ks = document.getElementById('petaFilterKomoditas');
  const ds = document.getElementById('petaFilterDesa');
  // clear except first option
  while(ks.options.length>1) ks.remove(1);
  while(ds.options.length>1) ds.remove(1);
  [...new Set(state.data.petani.map(p=>p['Komoditas']).filter(Boolean))].sort()
    .forEach(k=>{ const o=document.createElement('option');o.value=k;o.textContent=k;ks.appendChild(o);});
  [...new Set(state.data.petani.map(p=>p['Desa']).filter(Boolean))].sort()
    .forEach(d=>{ const o=document.createElement('option');o.value=d;o.textContent=d;ds.appendChild(o);});
}

// ============================================================
//  TABLES
// ============================================================
function colFilter(type, col, val) {
  if (val.trim()) state.colFilters[type][col] = val.trim().toLowerCase();
  else delete state.colFilters[type][col];
  applyFilters(type);
}

function applyFilters(type) {
  const src = state.data[type] || [];
  const filters = state.colFilters[type] || {};
  state.filtered[type] = src.filter(row =>
    Object.entries(filters).every(([col, q]) =>
      String(row[col]||'').toLowerCase().includes(q)
    )
  );
  state.pagination[type] = 1;
  renderTable(type);
  updateCounts();
}

function renderTable(type) {
  const data  = state.filtered[type]||[];
  const page  = state.pagination[type]||1;
  const start = (page-1)*PER_PAGE;
  const slice = data.slice(start, start+PER_PAGE);
  const tbody = document.getElementById(type+'Table');
  if (!tbody) return;

  if (!slice.length) {
    tbody.innerHTML=`<tr><td colspan="20"><div class="empty"><i class="fas fa-inbox"></i><p>Belum ada data</p></div></td></tr>`;
    renderPagination(type, data.length, page); return;
  }

  tbody.innerHTML = slice.map((row,i) => {
    const no = start+i+1;
    switch(type) {
      case 'petani': return `<tr>
        <td style="color:var(--s5);font-size:11px">${no}</td>
        <td><strong>${row['Nama']||'-'}</strong></td>
        <td>${row['Desa']||'-'}</td>
        <td>${row['Kecamatan']||'-'}</td>
        <td>${commodityBadge(row['Komoditas'])}</td>
        <td>${row['Total Lahan (Ha)']||'-'}</td>
        <td style="font-size:12px">${row['HP']||'-'}</td>
        <td style="font-size:11px;color:var(--s5)">${fmtDate(row['Tgl Input'])}</td>
      </tr>`;
      case 'kunjungan': return `<tr>
        <td style="color:var(--s5);font-size:11px">${no}</td>
        <td><strong>${row['Nama Petani']||'-'}</strong></td>
        <td>${row['Desa']||'-'}</td>
        <td style="font-size:12px">${fmtDate(row['Tanggal'])}</td>
        <td>${row['Petugas']||'-'}</td>
        <td>${kondisiBadge(row['Kondisi'])}</td>
        <td style="font-size:12px;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${row['Masalah']||'-'}</td>
        <td style="font-size:12px;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${row['Rekomendasi']||'-'}</td>
      </tr>`;
      case 'produksi': return `<tr>
        <td style="color:var(--s5);font-size:11px">${no}</td>
        <td><strong>${row['Nama Petani']||'-'}</strong></td>
        <td>${row['Desa']||'-'}</td>
        <td>${commodityBadge(row['Komoditas'])}</td>
        <td>${row['Tahun']||'-'}</td>
        <td style="font-size:12px">${row['Musim']||'-'}</td>
        <td>${row['Jumlah']||'-'}</td>
        <td>${row['Satuan']||'-'}</td>
        <td>${row['Luas (Ha)']||'-'}</td>
        <td style="font-weight:700;color:var(--g2)">Rp ${Number(row['Total (Rp)']||0).toLocaleString('id-ID')}</td>
        <td style="font-size:12px">${row['Pembeli']||'-'}</td>
      </tr>`;
      case 'tanaman': return `<tr>
        <td style="color:var(--s5);font-size:11px">${no}</td>
        <td><strong>${row['Nama Petani']||'-'}</strong></td>
        <td>${row['Desa']||'-'}</td>
        <td>${row['Jenis Tanaman']||'-'}</td>
        <td>${row['Luas Tanam (Ha)']||'-'}</td>
        <td>${row['Umur (Bln)']||'-'}</td>
        <td>${statusBadge(row['Status'])}</td>
        <td style="font-size:12px">${row['Perkiraan Panen']||'-'}</td>
      </tr>`;
      case 'hama': return `<tr>
        <td style="color:var(--s5);font-size:11px">${no}</td>
        <td><strong>${row['Nama Petani']||'-'}</strong></td>
        <td>${row['Desa']||'-'}</td>
        <td style="font-size:12px">${fmtDate(row['Tgl Kunjungan'])}</td>
        <td style="font-size:12px">${row['Petugas']||'-'}</td>
        <td>${row['Nama Tanaman']||'-'}</td>
        <td><strong>${row['Nama Hama/Penyakit']||'-'}</strong></td>
        <td>${hamaTingkatBadge(row['Tingkat Serangan'])}</td>
        <td>${hamaStatusBadge(row['Status'])}</td>
        <td style="font-size:12px;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${row['Solusi/Penanganan']||'-'}</td>
      </tr>`;
      default: return '';
    }
  }).join('');
  renderPagination(type, data.length, page);
}

function renderPagination(type, total, current) {
  const el = document.getElementById(type+'Pagination');
  if (!el) return;
  const totalPages = Math.ceil(total/PER_PAGE);
  if (totalPages<=1) { el.innerHTML=''; return; }
  let html = '';
  for (let i=1;i<=totalPages;i++) {
    if (i===1||i===totalPages||Math.abs(i-current)<=2)
      html+=`<button class="page-btn ${i===current?'active':''}" onclick="goPage('${type}',${i})">${i}</button>`;
    else if (Math.abs(i-current)===3)
      html+=`<span style="color:var(--s5);font-size:12px;padding:0 2px">…</span>`;
  }
  html+=`<span class="page-info">${total} data</span>`;
  el.innerHTML = html;
}

function goPage(type, page) {
  state.pagination[type] = page;
  renderTable(type);
  document.getElementById('page-'+type).scrollIntoView({behavior:'smooth',block:'start'});
}

// ============================================================
//  GALERI
// ============================================================
function renderGaleri() {
  const filter = document.getElementById('galeriFilter')?.value||'';
  const grid   = document.getElementById('galeriGrid');
  if (!grid) return;

  let files = state.driveFiles;
  if (filter) files = files.filter(f=>f.name.toLowerCase().startsWith(filter));

  if (!files.length) {
    grid.innerHTML=`<div class="empty" style="grid-column:1/-1">
      <i class="fas fa-images"></i>
      <p>${state.driveFiles.length===0
        ? 'Belum ada foto di Google Drive. Pastikan staf sudah mengirim foto dari TaniMap.'
        : 'Tidak ada foto untuk tipe yang dipilih.'}</p>
    </div>`;
    return;
  }

  grid.innerHTML = files.map(f => {
    // Gunakan thumbnail dari Drive API
    const thumb = f.thumbnailLink
      ? f.thumbnailLink.replace('=s220','=s400')
      : `https://drive.google.com/thumbnail?id=${f.id}&sz=w400`;
    const type = f.name.startsWith('petani')?'Petani':
                 f.name.startsWith('lahan')?'Lahan':
                 f.name.startsWith('tanaman')?'Tanaman':'Foto';
    const badgeClass = type==='Petani'?'badge-green':type==='Lahan'?'badge-blue':'badge-purple';
    const rawName = f.name.replace(/\.jpg$/i,'').replace(/\.jpeg$/i,'').replace(/\.png$/i,'');
    const displayName = rawName.replace(/^(petani|lahan|tanaman)_/i,'').replace(/_/g,' ');
    return `<div class="gallery-item" onclick="openLightbox('${f.id}','${displayName}','${type}')">
      <img src="${thumb}" alt="${displayName}" loading="lazy"
        onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 100%22%3E%3Crect fill=%22%23f1f5f9%22 width=%22120%22 height=%22100%22/%3E%3Ctext x=%2260%22 y=%2255%22 text-anchor=%22middle%22 font-size=%2228%22%3E📷%3C/text%3E%3C/svg%3E'" />
      <div class="gallery-item-info">
        <div class="gallery-item-name">${displayName}</div>
        <div style="margin-top:3px"><span class="badge ${badgeClass}" style="font-size:10px">${type}</span></div>
      </div>
    </div>`;
  }).join('');
}

function openLightbox(fileId, name, type) {
  document.getElementById('lightboxImg').src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
  document.getElementById('lightboxCaption').textContent = `${name} — ${type}`;
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('lightboxImg').src='';
}

// ============================================================
//  NAVIGATION
// ============================================================
const PAGE_TITLES = {
  overview:'Overview',peta:'Peta Sebaran',petani:'Data Petani',
  kunjungan:'Kunjungan Lapangan',produksi:'Data Produksi',
  tanaman:'Data Tanaman',hama:'Hama & Penyakit',laporan:'Laporan',galeri:'Galeri Foto',
};

function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+id)?.classList.add('active');
  document.querySelector(`[onclick="showPage('${id}')"]`)?.classList.add('active');
  document.getElementById('pageTitle').textContent = PAGE_TITLES[id]||id;
  state.currentPage = id;
  if (id==='peta') {
    if (!state.maps.peta) renderPetaPage(false);
    else setTimeout(()=>state.maps.peta.invalidateSize(),100);
  }
}



// ============================================================
//  SUMMARY TABLES
// ============================================================

function renderSummaries() {
  renderProduksiSummary();
  renderTanamanSummary();
  renderHamaSummary();
}

function renderProduksiSummary() {
  const tbody = document.getElementById('produksiSummaryTable');
  if (!tbody) return;

  // Kalkulasi per komoditas
  const map = {};
  state.data.produksi.forEach(p => {
    const k = p['Komoditas'] || 'Tidak Diketahui';
    if (!map[k]) map[k] = { petani: new Set(), luas: 0, jumlah: 0, satuan: '', total: 0 };
    map[k].petani.add(p['Nama Petani'] || '');
    map[k].luas   += parseFloat(p['Luas (Ha)']) || 0;
    map[k].jumlah += parseFloat(p['Jumlah'])    || 0;
    map[k].satuan  = p['Satuan'] || '';
    map[k].total  += parseFloat(p['Total (Rp)']) || 0;
  });

  const rows = Object.entries(map).sort((a,b) => b[1].total - a[1].total);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty"><p>Belum ada data produksi</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(([kom, d], i) => `
    <tr>
      <td style="color:var(--s5);font-size:11px">${i+1}</td>
      <td>${commodityBadge(kom)}</td>
      <td style="font-weight:600;text-align:center">${d.petani.size}</td>
      <td style="text-align:center">${d.luas.toFixed(2)} Ha</td>
      <td style="text-align:center">${d.jumlah.toLocaleString('id-ID')} ${d.satuan}</td>
      <td style="font-weight:700;color:var(--g2)">Rp ${d.total.toLocaleString('id-ID')}</td>
    </tr>
  `).join('');

  // Baris total
  const totalPetani = new Set(state.data.produksi.map(p=>p['Nama Petani'])).size;
  const totalLuas   = Object.values(map).reduce((s,d)=>s+d.luas,0);
  const totalRp     = Object.values(map).reduce((s,d)=>s+d.total,0);
  tbody.innerHTML += `
    <tr class="sticky-bottom">
      <td></td>
      <td style="color:var(--g2)">TOTAL</td>
      <td style="text-align:center;color:var(--g2)">${totalPetani}</td>
      <td style="text-align:center;color:var(--g2)">${totalLuas.toFixed(2)} Ha</td>
      <td></td>
      <td style="color:var(--g2)">Rp ${totalRp.toLocaleString('id-ID')}</td>
    </tr>
  `;
}

function renderTanamanSummary() {
  const tbody = document.getElementById('tanamanSummaryTable');
  if (!tbody) return;

  // Kalkulasi per jenis tanaman
  const map = {};
  state.data.tanaman.forEach(t => {
    const k = t['Jenis Tanaman'] || 'Tidak Diketahui';
    if (!map[k]) map[k] = { petani: new Set(), luas: 0, statusCount: {} };
    map[k].petani.add(t['Nama Petani'] || '');
    map[k].luas += parseFloat(t['Luas Tanam (Ha)']) || 0;
    const st = t['Status'] || 'Tidak Diketahui';
    map[k].statusCount[st] = (map[k].statusCount[st] || 0) + 1;
  });

  const rows = Object.entries(map).sort((a,b) => b[1].petani.size - a[1].petani.size);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty"><p>Belum ada data tanaman</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(([jenis, d], i) => {
    const dominanStatus = Object.entries(d.statusCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || '-';
    return `
      <tr>
        <td style="color:var(--s5);font-size:11px">${i+1}</td>
        <td style="font-weight:600">${jenis}</td>
        <td style="font-weight:600;text-align:center">${d.petani.size}</td>
        <td style="text-align:center">${d.luas.toFixed(2)} Ha</td>
        <td>${statusBadge(dominanStatus)}</td>
      </tr>
    `;
  }).join('');

  // Total
  const totalPetani = new Set(state.data.tanaman.map(t=>t['Nama Petani'])).size;
  const totalLuas   = Object.values(map).reduce((s,d)=>s+d.luas,0);
  tbody.innerHTML += `
    <tr class="sticky-bottom">
      <td></td>
      <td style="color:var(--g2)">TOTAL</td>
      <td style="text-align:center;color:var(--g2)">${totalPetani}</td>
      <td style="text-align:center;color:var(--g2)">${totalLuas.toFixed(2)} Ha</td>
      <td></td>
    </tr>
  `;
}

function renderHamaSummary() {
  const tbody = document.getElementById('hamaSummaryTable');
  if (!tbody) return;

  // Kalkulasi per nama hama
  const map = {};
  (state.data.hama || []).forEach(h => {
    const k = h['Nama Hama/Penyakit'] || 'Tidak Diketahui';
    if (!map[k]) map[k] = {
      tanaman: new Set(), petani: new Set(),
      count: 0, tingkat: {}, status: {}
    };
    map[k].petani.add(h['Nama Petani'] || '');
    map[k].tanaman.add(h['Nama Tanaman'] || h['tanaman'] || '');
    map[k].count++;
    const tg = h['Tingkat Serangan'] || '-';
    const st = h['Status'] || '-';
    map[k].tingkat[tg] = (map[k].tingkat[tg] || 0) + 1;
    map[k].status[st]  = (map[k].status[st]  || 0) + 1;
  });

  const rows = Object.entries(map).sort((a,b) => b[1].count - a[1].count);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty"><p>Belum ada laporan hama</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(([nama, d], i) => {
    const dominanTingkat = Object.entries(d.tingkat).sort((a,b)=>b[1]-a[1])[0]?.[0] || '-';
    const dominanStatus  = Object.entries(d.status).sort((a,b)=>b[1]-a[1])[0]?.[0] || '-';
    const tanamanList = [...d.tanaman].filter(Boolean).join(', ') || '-';
    return `
      <tr>
        <td style="color:var(--s5);font-size:11px">${i+1}</td>
        <td style="font-weight:600">${nama}</td>
        <td style="font-size:12px">${tanamanList}</td>
        <td style="text-align:center;font-weight:600">${d.count}</td>
        <td style="text-align:center;font-weight:600">${d.petani.size}</td>
        <td>${hamaTingkatBadge(dominanTingkat)}</td>
        <td>${hamaStatusBadge(dominanStatus)}</td>
      </tr>
    `;
  }).join('');
}

// ============================================================
//  HELPERS
// ============================================================
function fmtDate(val) {
  if (!val) return '-';
  const s = String(val);
  // ISO format: 2024-03-09T16:00:00.000Z
  if (s.includes('T')) {
    const d = new Date(s);
    if (!isNaN(d)) return d.toLocaleDateString('id-ID', {day:'2-digit',month:'2-digit',year:'numeric'});
  }
  // Already formatted or plain date
  return s.split('T')[0] || s;
}

// ============================================================
//  BADGES
// ============================================================
function commodityBadge(k) {
  const m={'Kopi Arabika':'badge-green','Kopi Robusta':'badge-green','Kakao':'badge-amber',
    'Cengkeh':'badge-purple','Vanili':'badge-teal','Padi':'badge-green','Jagung':'badge-amber','Cabai':'badge-red'};
  return `<span class="badge ${m[k]||'badge-gray'}">${k||'-'}</span>`;
}
function kondisiBadge(k) {
  const m={'Baik':'badge-green','Perlu Perhatian':'badge-amber','Kritis':'badge-red'};
  return `<span class="badge ${m[k]||'badge-gray'}">${k||'-'}</span>`;
}
function statusBadge(s) {
  const m={'Baik':'badge-green','Perawatan':'badge-amber','Terserang Hama':'badge-red','Siap Panen':'badge-teal'};
  return `<span class="badge ${m[s]||'badge-gray'}">${s||'-'}</span>`;
}

function hamaTingkatBadge(t) {
  const m={'Ringan':'badge-green','Sedang':'badge-amber','Berat':'badge-red'};
  return `<span class="badge ${m[t]||'badge-gray'}">${t||'-'}</span>`;
}
function hamaStatusBadge(s) {
  const m={'Dalam Pemantauan':'badge-amber','Ditangani':'badge-blue','Selesai':'badge-green'};
  return `<span class="badge ${m[s]||'badge-gray'}">${s||'-'}</span>`;
}


// ============================================================
//  LAPORAN
// ============================================================

function renderLaporan() {
  const d = state.data;
  const now = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
  const el = document.getElementById('lapTanggal');
  if (el) el.textContent = 'Per ' + now;

  // Kalkulasi dasar
  const totalPetani    = d.petani.length;
  const totalLahan     = d.petani.reduce((s,p)=>s+(parseFloat(p['Total Lahan (Ha)'])||0),0);
  const totalKunjungan = d.kunjungan.length;
  const totalPenjualan = d.produksi.reduce((s,p)=>s+(parseFloat(p['Total (Rp)'])||0),0);
  const totalTanaman   = d.tanaman.length;
  const totalHama      = (d.hama||[]).length;

  // Komoditas terbanyak
  const kommCount = {};
  d.petani.forEach(p=>{const k=p['Komoditas']||'-';kommCount[k]=(kommCount[k]||0)+1;});
  const topKomm = Object.entries(kommCount).sort((a,b)=>b[1]-a[1])[0];

  // Desa terbanyak
  const desaCount = {};
  d.petani.forEach(p=>{const ds=p['Desa']||'-';desaCount[ds]=(desaCount[ds]||0)+1;});
  const topDesa = Object.entries(desaCount).sort((a,b)=>b[1]-a[1])[0];

  // Kondisi kunjungan
  const kondisiCount = {};
  d.kunjungan.forEach(k=>{const c=k['Kondisi']||'-';kondisiCount[c]=(kondisiCount[c]||0)+1;});

  // Narasi
  const narasi = document.getElementById('lapNarasi');
  if (narasi) narasi.innerHTML = `
    <p>Laporan ini merangkum seluruh data yang telah dikumpulkan oleh petugas lapangan melalui aplikasi TaniMap.
    Per tanggal <strong>${now}</strong>, sistem mencatat <strong>${totalPetani} petani binaan</strong> yang tersebar di
    <strong>${Object.keys(desaCount).length} desa</strong> dengan total lahan produktif seluas
    <strong>${totalLahan.toFixed(2)} Ha</strong>.</p>
    <br>
    <p>Komoditas yang paling banyak dibudidayakan adalah <strong>${topKomm?topKomm[0]:'-'}
    (${topKomm?topKomm[1]:0} petani)</strong>. Desa dengan jumlah petani terbanyak adalah
    <strong>${topDesa?topDesa[0]:'-'} (${topDesa?topDesa[1]:0} petani)</strong>.
    Total nilai produksi yang tercatat mencapai
    <strong>Rp ${totalPenjualan.toLocaleString('id-ID')}</strong>.</p>
    <br>
    <p>Dari <strong>${totalKunjungan} kunjungan lapangan</strong> yang telah dilakukan,
    kondisi tanaman yang ditemukan: <strong>${kondisiCount['Baik']||0} Baik</strong>,
    <strong>${kondisiCount['Perlu Perhatian']||0} Perlu Perhatian</strong>, dan
    <strong>${kondisiCount['Kritis']||0} Kritis</strong>.
    ${totalHama > 0 ? `Terdapat <strong>${totalHama} laporan hama & penyakit</strong> yang perlu mendapat perhatian.` : 'Tidak ada laporan hama & penyakit yang signifikan.'}
    </p>
  `;

  // Stat grid ringkasan
  const statGrid = document.getElementById('lapStatGrid');
  if (statGrid) {
    const stats = [
      {icon:'fas fa-users',color:'#059669',label:'Total Petani',val:totalPetani},
      {icon:'fas fa-map',color:'#2563eb',label:'Total Lahan',val:totalLahan.toFixed(2)+' Ha'},
      {icon:'fas fa-clipboard',color:'#7c3aed',label:'Total Kunjungan',val:totalKunjungan},
      {icon:'fas fa-money-bill',color:'#d97706',label:'Total Penjualan',val:'Rp '+( totalPenjualan>=1e9?(totalPenjualan/1e9).toFixed(1)+'M':totalPenjualan>=1e6?(totalPenjualan/1e6).toFixed(1)+'jt':totalPenjualan.toLocaleString('id-ID'))},
      {icon:'fas fa-seedling',color:'#0891b2',label:'Total Tanaman',val:totalTanaman},
      {icon:'fas fa-bug',color:'#dc2626',label:'Laporan Hama',val:totalHama},
      {icon:'fas fa-home',color:'#059669',label:'Jumlah Desa',val:Object.keys(desaCount).length},
      {icon:'fas fa-leaf',color:'#7c3aed',label:'Jenis Komoditas',val:Object.keys(kommCount).length},
    ];
    statGrid.innerHTML = stats.map(s=>`
      <div style="background:var(--bg);border-radius:10px;padding:14px;border:1px solid var(--border);display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;border-radius:50%;background:${s.color}20;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="${s.icon}" style="color:${s.color};font-size:14px"></i>
        </div>
        <div>
          <div style="font-size:10px;color:var(--s5);font-weight:600;text-transform:uppercase;letter-spacing:.04em">${s.label}</div>
          <div style="font-size:16px;font-weight:800;color:var(--s1);font-family:'Manrope',sans-serif">${s.val}</div>
        </div>
      </div>
    `).join('');
  }

  // ---- Tabel Desa ----
  const lapDesaTable = document.getElementById('lapDesaTable');
  if (lapDesaTable) {
    const desaMap = {};
    d.petani.forEach(p=>{
      const ds = p['Desa']||'-';
      if (!desaMap[ds]) desaMap[ds]={kec:p['Kecamatan']||'-',count:0,komm:{},lahan:0};
      desaMap[ds].count++;
      const k=p['Komoditas']||'-';
      desaMap[ds].komm[k]=(desaMap[ds].komm[k]||0)+1;
      desaMap[ds].lahan+=parseFloat(p['Total Lahan (Ha)'])||0;
    });
    const rows = Object.entries(desaMap).sort((a,b)=>b[1].count-a[1].count);
    lapDesaTable.innerHTML = rows.map(([desa,d],i)=>{
      const topK = Object.entries(d.komm).sort((a,b)=>b[1]-a[1])[0]?.[0]||'-';
      return `<tr>
        <td style="color:var(--s5);font-size:11px">${i+1}</td>
        <td><strong>${desa}</strong></td>
        <td>${d.kec}</td>
        <td style="text-align:center;font-weight:700">${d.count}</td>
        <td>${commodityBadge(topK)}</td>
        <td style="text-align:center">${d.lahan.toFixed(2)}</td>
      </tr>`;
    }).join('') + `<tr style="background:var(--g5);font-weight:700">
      <td></td><td style="color:var(--g2)">TOTAL</td><td></td>
      <td style="text-align:center;color:var(--g2)">${totalPetani}</td><td></td>
      <td style="text-align:center;color:var(--g2)">${totalLahan.toFixed(2)}</td>
    </tr>`;
  }

  // ---- Tabel Produksi ----
  const lapProduksiTable = document.getElementById('lapProduksiTable');
  if (lapProduksiTable) {
    const pm = {};
    d.produksi.forEach(p=>{
      const k=p['Komoditas']||'-';
      if(!pm[k]) pm[k]={petani:new Set(),luas:0,jumlah:0,satuan:'',total:0};
      pm[k].petani.add(p['Nama Petani']||'');
      pm[k].luas+=parseFloat(p['Luas (Ha)'])||0;
      pm[k].jumlah+=parseFloat(p['Jumlah'])||0;
      pm[k].satuan=p['Satuan']||'';
      pm[k].total+=parseFloat(p['Total (Rp)'])||0;
    });
    const rows = Object.entries(pm).sort((a,b)=>b[1].total-a[1].total);
    const grandTotal = rows.reduce((s,[,v])=>s+v.total,0);
    lapProduksiTable.innerHTML = rows.map(([k,v],i)=>`
      <tr>
        <td style="color:var(--s5);font-size:11px">${i+1}</td>
        <td>${commodityBadge(k)}</td>
        <td style="text-align:center;font-weight:700">${v.petani.size}</td>
        <td style="text-align:center">${v.luas.toFixed(2)}</td>
        <td style="text-align:center">${v.jumlah.toLocaleString('id-ID')} ${v.satuan}</td>
        <td style="font-weight:700;color:var(--g2)">Rp ${v.total.toLocaleString('id-ID')}</td>
        <td>Rp ${v.petani.size>0?(v.total/v.petani.size).toLocaleString('id-ID',{maximumFractionDigits:0}):0}</td>
      </tr>
    `).join('') + `<tr style="background:var(--g5);font-weight:700">
      <td></td><td style="color:var(--g2)">TOTAL</td>
      <td style="text-align:center;color:var(--g2)">${new Set(d.produksi.map(p=>p['Nama Petani'])).size}</td>
      <td></td><td></td>
      <td style="color:var(--g2)">Rp ${grandTotal.toLocaleString('id-ID')}</td><td></td>
    </tr>`;
  }

  // ---- Tabel Kunjungan per Petugas ----
  const lapKunjunganTable = document.getElementById('lapKunjunganTable');
  if (lapKunjunganTable) {
    const pm = {};
    d.kunjungan.forEach(k=>{
      const p=k['Petugas']||'-';
      if(!pm[p]) pm[p]={count:0,baik:0,perlu:0,kritis:0};
      pm[p].count++;
      if(k['Kondisi']==='Baik') pm[p].baik++;
      else if(k['Kondisi']==='Perlu Perhatian') pm[p].perlu++;
      else if(k['Kondisi']==='Kritis') pm[p].kritis++;
    });
    const rows = Object.entries(pm).sort((a,b)=>b[1].count-a[1].count);
    lapKunjunganTable.innerHTML = rows.map(([p,v],i)=>`
      <tr>
        <td style="color:var(--s5);font-size:11px">${i+1}</td>
        <td><strong>${p}</strong></td>
        <td style="text-align:center;font-weight:700">${v.count}</td>
        <td style="text-align:center"><span class="badge badge-green">${v.baik}</span></td>
        <td style="text-align:center"><span class="badge badge-amber">${v.perlu}</span></td>
        <td style="text-align:center"><span class="badge badge-red">${v.kritis}</span></td>
      </tr>
    `).join('') + `<tr style="background:var(--g5);font-weight:700">
      <td></td><td style="color:var(--g2)">TOTAL</td>
      <td style="text-align:center;color:var(--g2)">${totalKunjungan}</td>
      <td style="text-align:center;color:var(--g2)">${kondisiCount['Baik']||0}</td>
      <td style="text-align:center;color:var(--g2)">${kondisiCount['Perlu Perhatian']||0}</td>
      <td style="text-align:center;color:var(--g2)">${kondisiCount['Kritis']||0}</td>
    </tr>`;
  }

  // ---- Tabel Tanaman ----
  const lapTanamanTable = document.getElementById('lapTanamanTable');
  if (lapTanamanTable) {
    const tm = {};
    d.tanaman.forEach(t=>{
      const j=t['Jenis Tanaman']||'-';
      if(!tm[j]) tm[j]={petani:new Set(),luas:0,baik:0,perawatan:0,panen:0,hama:0};
      tm[j].petani.add(t['Nama Petani']||'');
      tm[j].luas+=parseFloat(t['Luas Tanam (Ha)'])||0;
      const s=t['Status']||'';
      if(s==='Baik') tm[j].baik++;
      else if(s==='Perawatan') tm[j].perawatan++;
      else if(s==='Siap Panen') tm[j].panen++;
      else if(s==='Terserang Hama') tm[j].hama++;
    });
    lapTanamanTable.innerHTML = Object.entries(tm).sort((a,b)=>b[1].petani.size-a[1].petani.size)
      .map(([j,v],i)=>`
        <tr>
          <td style="color:var(--s5);font-size:11px">${i+1}</td>
          <td><strong>${j}</strong></td>
          <td style="text-align:center;font-weight:700">${v.petani.size}</td>
          <td style="text-align:center">${v.luas.toFixed(2)}</td>
          <td style="text-align:center"><span class="badge badge-green">${v.baik}</span></td>
          <td style="text-align:center"><span class="badge badge-amber">${v.perawatan}</span></td>
          <td style="text-align:center"><span class="badge badge-blue">${v.panen}</span></td>
          <td style="text-align:center"><span class="badge badge-red">${v.hama}</span></td>
        </tr>
      `).join('');
  }

  // ---- Tabel Hama ----
  const lapHamaTable = document.getElementById('lapHamaTable');
  if (lapHamaTable) {
    const hm = {};
    (d.hama||[]).forEach(h=>{
      const n=h['Nama Hama/Penyakit']||'-';
      if(!hm[n]) hm[n]={tanaman:new Set(),petani:new Set(),count:0,tingkat:{},status:{}};
      hm[n].petani.add(h['Nama Petani']||'');
      hm[n].tanaman.add(h['Nama Tanaman']||h['tanaman']||'');
      hm[n].count++;
      const tg=h['Tingkat Serangan']||'-';
      const st=h['Status']||'-';
      hm[n].tingkat[tg]=(hm[n].tingkat[tg]||0)+1;
      hm[n].status[st]=(hm[n].status[st]||0)+1;
    });
    if (!Object.keys(hm).length) {
      lapHamaTable.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--s5);padding:24px">Tidak ada laporan hama & penyakit</td></tr>';
    } else {
      lapHamaTable.innerHTML = Object.entries(hm).sort((a,b)=>b[1].count-a[1].count)
        .map(([n,v],i)=>{
          const topT=Object.entries(v.tingkat).sort((a,b)=>b[1]-a[1])[0]?.[0]||'-';
          const topS=Object.entries(v.status).sort((a,b)=>b[1]-a[1])[0]?.[0]||'-';
          return `<tr>
            <td style="color:var(--s5);font-size:11px">${i+1}</td>
            <td><strong>${n}</strong></td>
            <td style="font-size:12px">${[...v.tanaman].filter(Boolean).join(', ')||'-'}</td>
            <td style="text-align:center;font-weight:700">${v.count}</td>
            <td style="text-align:center;font-weight:700">${v.petani.size}</td>
            <td>${hamaTingkatBadge(topT)}</td>
            <td>${hamaStatusBadge(topS)}</td>
          </tr>`;
        }).join('');
    }
  }

  // ---- Daftar Petani Lengkap ----
  const lapPetaniTable = document.getElementById('lapPetaniTable');
  if (lapPetaniTable) {
    lapPetaniTable.innerHTML = d.petani.map((p,i)=>`
      <tr>
        <td style="color:var(--s5);font-size:11px">${i+1}</td>
        <td><strong>${p['Nama']||'-'}</strong></td>
        <td>${p['Desa']||'-'}</td>
        <td>${p['Kecamatan']||'-'}</td>
        <td>${commodityBadge(p['Komoditas'])}</td>
        <td style="text-align:center">${p['Total Lahan (Ha)']||'-'}</td>
        <td style="font-size:12px">${p['HP']||'-'}</td>
        <td style="font-size:12px">${p['Kelompok Tani']||'-'}</td>
      </tr>
    `).join('');
  }
}

async function downloadLaporanPDF() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { alert('Library PDF tidak tersedia'); return; }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const d = state.data;
  const now = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
  const W = 210, M = 14;
  let y = 0;

  // Header
  doc.setFillColor(6, 78, 59);
  doc.rect(0, 0, W, 32, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(20); doc.setFont('helvetica','bold');
  doc.text('TaniMap', M, 14);
  doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.setTextColor(180,230,200);
  doc.text('Laporan Sistem Informasi Manajemen Petani', M, 22);
  doc.setTextColor(255,255,255);
  doc.setFontSize(9);
  doc.text('Per ' + now, W - M, 22, {align:'right'});
  y = 40;

  const section = (title, color=[6,78,59]) => {
    if (y > 260) { doc.addPage(); y = 14; }
    doc.setFillColor(...color);
    doc.rect(M, y, W-2*M, 8, 'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(10); doc.setFont('helvetica','bold');
    doc.text(title, M+3, y+5.5);
    y += 11;
    doc.setTextColor(30,30,30);
  };

  const row = (cols, widths, bold=false) => {
    if (y > 270) { doc.addPage(); y = 14; }
    doc.setFontSize(8.5);
    doc.setFont('helvetica', bold?'bold':'normal');
    let x = M;
    cols.forEach((c,i) => {
      doc.text(String(c||'-').substring(0,30), x+1, y+4);
      x += widths[i];
    });
    doc.setDrawColor(220,220,220);
    doc.line(M, y+7, W-M, y+7);
    y += 8;
  };

  const thead = (cols, widths) => {
    doc.setFillColor(240,240,240);
    doc.rect(M, y, W-2*M, 7, 'F');
    doc.setFontSize(8); doc.setFont('helvetica','bold');
    doc.setTextColor(80,80,80);
    let x = M;
    cols.forEach((c,i) => { doc.text(c, x+1, y+5); x += widths[i]; });
    y += 8;
    doc.setTextColor(30,30,30);
  };

  // Kalkulasi
  const totalPetani    = d.petani.length;
  const totalLahan     = d.petani.reduce((s,p)=>s+(parseFloat(p['Total Lahan (Ha)'])||0),0);
  const totalKunjungan = d.kunjungan.length;
  const totalPenjualan = d.produksi.reduce((s,p)=>s+(parseFloat(p['Total (Rp)'])||0),0);
  const desaCount = {}; d.petani.forEach(p=>{const ds=p['Desa']||'-';desaCount[ds]=(desaCount[ds]||0)+1;});
  const kommCount = {}; d.petani.forEach(p=>{const k=p['Komoditas']||'-';kommCount[k]=(kommCount[k]||0)+1;});
  const topKomm = Object.entries(kommCount).sort((a,b)=>b[1]-a[1])[0];
  const topDesa = Object.entries(desaCount).sort((a,b)=>b[1]-a[1])[0];

  // RINGKASAN
  section('RINGKASAN EKSEKUTIF');
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(50,50,50);
  const narasi = `Laporan per ${now}. Total ${totalPetani} petani di ${Object.keys(desaCount).length} desa, lahan ${totalLahan.toFixed(2)} Ha. Komoditas terbanyak: ${topKomm?topKomm[0]:'-'} (${topKomm?topKomm[1]:0} petani). Total penjualan: Rp ${totalPenjualan.toLocaleString('id-ID')}.`;
  const lines = doc.splitTextToSize(narasi, W-2*M);
  doc.text(lines, M, y); y += lines.length*5 + 4;

  // Stat
  const stats = [
    ['Total Petani', totalPetani], ['Total Lahan', totalLahan.toFixed(2)+' Ha'],
    ['Kunjungan', totalKunjungan], ['Penjualan', 'Rp '+(totalPenjualan/1e6).toFixed(1)+'jt'],
    ['Tanaman', d.tanaman.length], ['Laporan Hama', (d.hama||[]).length],
    ['Jumlah Desa', Object.keys(desaCount).length], ['Komoditas', Object.keys(kommCount).length],
  ];
  const colW = (W-2*M)/4;
  stats.forEach(([label,val],i) => {
    if (i%4===0 && i>0) y += 12;
    const x = M + (i%4)*colW;
    if (y > 270) { doc.addPage(); y = 14; }
    doc.setFillColor(245,250,245);
    doc.rect(x, y, colW-2, 10, 'F');
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100);
    doc.text(label, x+2, y+3.5);
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(6,78,59);
    doc.text(String(val), x+2, y+8.5);
  });
  y += 16;

  // Petani per Desa
  section('SEBARAN PETANI PER DESA',[37,99,235]);
  thead(['#','Desa','Kecamatan','Jml Petani','Komoditas Dom.','Lahan (Ha)'],[8,38,38,22,40,36]);
  Object.entries(desaCount).sort((a,b)=>b[1]-a[1]).forEach(([desa,count],i) => {
    const p = d.petani.find(p=>p['Desa']===desa);
    const km = {}; d.petani.filter(p=>p['Desa']===desa).forEach(p=>{const k=p['Komoditas']||'-';km[k]=(km[k]||0)+1;});
    const topK = Object.entries(km).sort((a,b)=>b[1]-a[1])[0]?.[0]||'-';
    const lahan = d.petani.filter(p=>p['Desa']===desa).reduce((s,p)=>s+(parseFloat(p['Total Lahan (Ha)'])||0),0);
    row([i+1, desa, p?.['Kecamatan']||'-', count, topK, lahan.toFixed(2)],[8,38,38,22,40,36]);
  });
  row(['','TOTAL','',totalPetani,'',totalLahan.toFixed(2)],[8,38,38,22,40,36],true);
  y += 4;

  // Produksi
  section('REKAP PRODUKSI PER KOMODITAS',[217,119,6]);
  thead(['#','Komoditas','Petani','Luas(Ha)','Produksi','Total(Rp)','Rata-rata/Petani'],[8,30,16,18,30,38,42]);
  const pm = {};
  d.produksi.forEach(p=>{const k=p['Komoditas']||'-';if(!pm[k]) pm[k]={petani:new Set(),luas:0,jumlah:0,satuan:'',total:0};pm[k].petani.add(p['Nama Petani']||'');pm[k].luas+=parseFloat(p['Luas (Ha)'])||0;pm[k].jumlah+=parseFloat(p['Jumlah'])||0;pm[k].satuan=p['Satuan']||'';pm[k].total+=parseFloat(p['Total (Rp)'])||0;});
  Object.entries(pm).sort((a,b)=>b[1].total-a[1].total).forEach(([k,v],i) => {
    row([i+1,k,v.petani.size,v.luas.toFixed(2),v.jumlah.toLocaleString('id-ID')+' '+v.satuan,'Rp '+v.total.toLocaleString('id-ID'),'Rp '+(v.petani.size>0?Math.round(v.total/v.petani.size).toLocaleString('id-ID'):0)],[8,30,16,18,30,38,42]);
  });
  y += 4;

  // Kunjungan
  section('REKAP KUNJUNGAN LAPANGAN',[124,58,237]);
  thead(['#','Petugas','Jml Kunjungan','Baik','Perlu Perhatian','Kritis'],[8,50,28,20,40,36]);
  const km2 = {};
  d.kunjungan.forEach(k=>{const p=k['Petugas']||'-';if(!km2[p]) km2[p]={count:0,baik:0,perlu:0,kritis:0};km2[p].count++;if(k['Kondisi']==='Baik')km2[p].baik++;else if(k['Kondisi']==='Perlu Perhatian')km2[p].perlu++;else if(k['Kondisi']==='Kritis')km2[p].kritis++;});
  Object.entries(km2).sort((a,b)=>b[1].count-a[1].count).forEach(([p,v],i) => {
    row([i+1,p,v.count,v.baik,v.perlu,v.kritis],[8,50,28,20,40,36]);
  });
  y += 4;

  // Hama
  section('REKAP HAMA & PENYAKIT',[220,38,38]);
  thead(['#','Nama Hama/Penyakit','Tanaman','Laporan','Petani','Tingkat Dom.','Status'],[8,40,30,16,16,30,42]);
  const hm = {};
  (d.hama||[]).forEach(h=>{const n=h['Nama Hama/Penyakit']||'-';if(!hm[n]) hm[n]={tanaman:new Set(),petani:new Set(),count:0,tingkat:{},status:{}};hm[n].petani.add(h['Nama Petani']||'');hm[n].tanaman.add(h['Nama Tanaman']||'');hm[n].count++;const tg=h['Tingkat Serangan']||'-';hm[n].tingkat[tg]=(hm[n].tingkat[tg]||0)+1;const st=h['Status']||'-';hm[n].status[st]=(hm[n].status[st]||0)+1;});
  if (!Object.keys(hm).length) {
    doc.setFontSize(8.5); doc.setTextColor(150,150,150);
    doc.text('Tidak ada laporan hama & penyakit', M, y); y += 8;
  } else {
    Object.entries(hm).sort((a,b)=>b[1].count-a[1].count).forEach(([n,v],i) => {
      const topT=Object.entries(v.tingkat).sort((a,b)=>b[1]-a[1])[0]?.[0]||'-';
      const topS=Object.entries(v.status).sort((a,b)=>b[1]-a[1])[0]?.[0]||'-';
      row([i+1,n,[...v.tanaman].filter(Boolean).join(','),v.count,v.petani.size,topT,topS],[8,40,30,16,16,30,42]);
    });
  }
  y += 4;

  // Daftar Petani
  section('DAFTAR PETANI LENGKAP',[6,78,59]);
  thead(['#','Nama','Desa','Kecamatan','Komoditas','Lahan(Ha)','HP'],[8,38,28,28,28,18,34]);
  d.petani.forEach((p,i) => {
    row([i+1,p['Nama']||'-',p['Desa']||'-',p['Kecamatan']||'-',p['Komoditas']||'-',p['Total Lahan (Ha)']||'-',p['HP']||'-'],[8,38,28,28,28,18,34]);
  });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i=1; i<=pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(240,240,240);
    doc.rect(0, 287, W, 10, 'F');
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(150,150,150);
    doc.text('TaniMap — Sistem Informasi Manajemen Petani | ' + now, M, 293);
    doc.text('Hal. '+i+' / '+pageCount, W-M, 293, {align:'right'});
  }

  doc.save('Laporan_TaniMap_' + new Date().toISOString().split('T')[0] + '.pdf');
}

// ============================================================
//  LOADING
// ============================================================
function showLoading(msg='Memuat...') {
  const bar = document.getElementById('loadingBar');
  if (bar) { bar.style.width='60%'; bar.style.opacity='1'; }
}
function hideLoading() {
  const bar = document.getElementById('loadingBar');
  if (bar) {
    bar.style.width='100%';
    setTimeout(() => { bar.style.opacity='0'; bar.style.width='0'; }, 400);
  }
}


// Responsive chart resize
window.addEventListener('resize', () => {
  Object.values(state.charts).forEach(chart => {
    if (chart) chart.resize();
  });
});
// Auto load data saat halaman dibuka
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
});
// Fallback
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(checkSession, 100);
}
