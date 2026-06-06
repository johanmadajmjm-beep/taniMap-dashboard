// ============================================================
//  CONFIG
// ============================================================
const CONFIG = {
  CLIENT_ID:    '302226546386-r864vopnd4c0s5d30hbj4hcpvoqij3j3.apps.googleusercontent.com',
  ALLOWED_EMAIL:'johanmada.jm.jm@gmail.com',
  API_URL:      'https://script.google.com/macros/s/AKfycbw3viGGD7yGGa6DGsPgQSEuyrrzpRP5IBKWwIUiNeZfSoWixY8qvyhva4uo9r8Vhl7_2Q/exec',
  DRIVE_FOLDER: '1r0_NgQg7iE9LfZwm3MfuW4fRXg54vBuD',
};

// ============================================================
//  STATE
// ============================================================
let state = {
  token: null, user: null,
  data: { petani:[], kunjungan:[], produksi:[], tanaman:[], hama:[] },
  driveFiles: [],
  charts: {},
  maps: { overview: null, peta: null },
  currentPage: 'overview',
  pagination: { petani:1, kunjungan:1, produksi:1, tanaman:1 },
  filtered: { petani:[], kunjungan:[], produksi:[], tanaman:[] },
  colFilters: { petani:{}, kunjungan:{}, produksi:{}, tanaman:{} },
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
      const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo',
        { headers: { Authorization: 'Bearer ' + state.token } }).then(r => r.json());
      if (info.email !== CONFIG.ALLOWED_EMAIL) {
        alert('Akses ditolak. Hanya admin yang diizinkan.');
        state.token = null; return;
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
  state.token = null; state.user = null;
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
}

function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appShell').style.display = 'block';
  const name = state.user?.name || 'Admin';
  const pic  = state.user?.picture;
  document.getElementById('sidebarName').textContent = name.split(' ')[0];
  const av = document.getElementById('sidebarAvatar');
  if (pic) av.innerHTML = `<img src="${pic}">`;
  else av.textContent = name[0].toUpperCase();
}

// ============================================================
//  DATA
// ============================================================
async function refreshData() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('loading');
  showLoading('Memuat data dari Google Sheets...');
  try {
    const res  = await fetch(`${CONFIG.API_URL}?action=all&token=${state.token}`);
    const json = await res.json();
    if (json.status !== 'ok') throw new Error(json.message || 'Gagal memuat data');
    state.data = json.data;
    // Reset filters
    state.colFilters = { petani:{}, kunjungan:{}, produksi:{}, tanaman:{} };
    state.filtered = {
      petani:    [...state.data.petani],
      kunjungan: [...state.data.kunjungan],
      produksi:  [...state.data.produksi],
      tanaman:   [...state.data.tanaman],
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
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${CONFIG.DRIVE_FOLDER}'+in+parents+and+mimeType+contains+'image/'` +
      `&fields=files(id,name,thumbnailLink,webViewLink,createdTime)&pageSize=500&orderBy=createdTime+desc`,
      { headers: { Authorization: 'Bearer ' + state.token } }
    );
    const json = await res.json();
    state.driveFiles = json.files || [];
  } catch(e) { state.driveFiles = []; }
}

function renderAll() {
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
  updateCounts();
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
  document.getElementById('st-hama').textContent      = (d.hama||[]).length;
}

function updateCounts() {
  const types = ['petani','kunjungan','produksi','tanaman'];
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

  // 3. Kondisi Kunjungan (doughnut)
  const kdCount = {};
  d.kunjungan.forEach(k => { const c = k['Kondisi']||'Tidak Diketahui'; kdCount[c]=(kdCount[c]||0)+1; });
  renderChart('chartKondisi','doughnut',Object.keys(kdCount),Object.values(kdCount),['#059669','#d97706','#dc2626','#64748b']);

  // 4. Petani per Desa (bar - top 10)
  const desaCount = {};
  d.petani.forEach(p => { const ds = p['Desa']||'?'; desaCount[ds]=(desaCount[ds]||0)+1; });
  const desaTop = Object.entries(desaCount).sort((a,b)=>b[1]-a[1]).slice(0,10);
  renderChart('chartDesa','bar',desaTop.map(x=>x[0]),desaTop.map(x=>x[1]),'#059669');

  // 5. Total Produksi per Komoditas (horizontal bar)
  const prodVal = {};
  d.produksi.forEach(p => {
    const k = p['Komoditas']||'Lainnya';
    prodVal[k] = (prodVal[k]||0) + (parseFloat(p['Total (Rp)'])||0);
  });
  renderChart('chartProduksi','bar',Object.keys(prodVal),Object.values(prodVal),'#d97706',true,true);
}

function renderChart(id, type, labels, data, color, isCurrency=false, horizontal=false) {
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
        backgroundColor: type==='doughnut' ? colors : (Array.isArray(color)?colors:color),
        borderColor: type==='bar' ? (Array.isArray(color)?colors:color) : 'transparent',
        borderRadius: type==='bar' ? 5 : 0,
        borderWidth: type==='bar' ? 1 : 0,
      }]
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: {
          position: type==='doughnut' ? 'right' : 'none',
          labels: { font:{size:10,family:'Plus Jakarta Sans'}, boxWidth:10, padding:8 }
        },
        tooltip: {
          callbacks: {
            label: ctx => isCurrency
              ? ' Rp ' + Number(ctx.raw).toLocaleString('id-ID')
              : ' ' + ctx.raw
          }
        }
      },
      scales: type==='bar' ? {
        x: { grid:{display:horizontal}, ticks:{font:{size:10},
          callback: isCurrency && !horizontal ? v=>'Rp'+(v/1e6).toFixed(0)+'jt' : undefined }},
        y: { grid:{display:!horizontal,color:'#f1f5f9'}, ticks:{font:{size:10},
          callback: isCurrency && horizontal ? v=>'Rp'+(v/1e6).toFixed(0)+'jt' : undefined }}
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
const INDONESIA_CENTER = [-2.5, 118];
const INDONESIA_ZOOM   = 5;

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

function renderOverviewMap() {
  if (!state.maps.overview) state.maps.overview = initMap('dashMap');
  const map = state.maps.overview;
  const withGPS = state.data.petani.filter(p=>p['Latitude']&&p['Longitude']);
  document.getElementById('mapCount').textContent = `${withGPS.length} titik GPS dari ${state.data.petani.length} petani`;
  const bounds = addMarkersToMap(map, withGPS);
  if (bounds.length) map.fitBounds(bounds,{padding:[30,30],maxZoom:12});
}

function renderPetaPage() {
  if (!state.maps.peta) state.maps.peta = initMap('petaMap');
  const map = state.maps.peta;
  const fKom  = document.getElementById('petaFilterKomoditas')?.value||'';
  const fDesa = document.getElementById('petaFilterDesa')?.value||'';
  let list = state.data.petani.filter(p=>p['Latitude']&&p['Longitude']);
  if (fKom)  list = list.filter(p=>p['Komoditas']===fKom);
  if (fDesa) list = list.filter(p=>p['Desa']===fDesa);
  const bounds = addMarkersToMap(map, list);
  if (bounds.length) map.fitBounds(bounds,{padding:[40,40],maxZoom:14});
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
        <td style="font-size:11px;color:var(--s5)">${row['Tgl Input']||'-'}</td>
      </tr>`;
      case 'kunjungan': return `<tr>
        <td style="color:var(--s5);font-size:11px">${no}</td>
        <td><strong>${row['Nama Petani']||'-'}</strong></td>
        <td>${row['Desa']||'-'}</td>
        <td style="font-size:12px">${row['Tanggal']||'-'}</td>
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
    const displayName = f.name.replace(/^(petani|lahan|tanaman)_/,'').replace('.jpg','').replace(/_/g,' ');
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
  tanaman:'Data Tanaman',galeri:'Galeri Foto',
};

function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+id)?.classList.add('active');
  document.querySelector(`[onclick="showPage('${id}')"]`)?.classList.add('active');
  document.getElementById('pageTitle').textContent = PAGE_TITLES[id]||id;
  state.currentPage = id;
  if (id==='peta'&&state.maps.peta) { setTimeout(()=>state.maps.peta.invalidateSize(),100); renderPetaPage(); }
  if (id==='overview'&&state.maps.overview) setTimeout(()=>state.maps.overview.invalidateSize(),100);
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

// ============================================================
//  LOADING
// ============================================================
function showLoading(msg='Memuat...') {
  document.getElementById('loadingMsg').textContent=msg;
  document.getElementById('loadingOverlay').classList.add('show');
}
function hideLoading() { document.getElementById('loadingOverlay').classList.remove('show'); }
