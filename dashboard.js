// ============================================================
//  CONFIG
// ============================================================
const CONFIG = {
  API_URL:      'https://script.google.com/macros/s/AKfycbxwXH69dwoRXaXb7AjIhzxj04Ju5RtQkqyj8l6q7DCbnqsHJ99vzTGxt7EwzHiIQsTD/exec',
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
  // Drive API butuh OAuth — dinonaktifkan sementara
  // Galeri akan diaktifkan kembali setelah sistem auth dipasang
  state.driveFiles = [];
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
  const penjualanStr = totalPenjualan >= 1e9
    ? 'Rp ' + (totalPenjualan/1e9).toFixed(1) + 'M'
    : totalPenjualan >= 1e6
    ? 'Rp ' + (totalPenjualan/1e6).toFixed(1) + 'jt'
    : 'Rp ' + totalPenjualan.toLocaleString('id-ID');
  document.getElementById('st-produksi').textContent  = penjualanStr;
  document.getElementById('st-tanaman').textContent   = d.tanaman.length;
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
  const prodColors = ['#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#0891b2','#f97316','#14b8a6'];
  renderChart('chartProduksi','bar',Object.keys(prodVal),Object.values(prodVal),prodColors,true,true);
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
      maintainAspectRatio: true,
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
    L.circleMarker([lat,lng],{
      radius:9, fillColor:commColor(p['Komoditas']),
      color:'white', weight:2, opacity:1, fillOpacity:0.88
    }).addTo(map).bindPopup(`
      <div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:170px">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px">${p['Nama']||'-'}</div>
        <div style="font-size:12px;color:#64748b">📍 ${p['Desa']||'-'}, ${p['Kecamatan']||'-'}</div>
        <div style="font-size:12px;margin-top:3px">🌿 <b>${p['Komoditas']||'-'}</b></div>
        <div style="font-size:12px">🗺️ ${p['Total Lahan (Ha)']||'-'} Ha</div>
      </div>
    `);
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
  tanaman:'Data Tanaman',hama:'Hama & Penyakit',galeri:'Galeri Foto',
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
    <tr style="background:var(--g5);font-weight:700">
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
    <tr style="background:var(--g5);font-weight:700">
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

// Auto load data saat halaman dibuka
document.addEventListener('DOMContentLoaded', () => {
  refreshData();
});
