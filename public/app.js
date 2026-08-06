const API_BASE = (window.location.protocol === 'file:' || !window.location.host) ? 'http://localhost:3000' : '';

let currentActiveCode = null;
let referrerChartInstance = null;
let deviceChartInstance = null;
let authToken = localStorage.getItem('linktrace_token') || '';

function getAuthHeaders(extraHeaders = {}) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    ...extraHeaders
  };
}

function showLoginModal(show = true) {
  const modal = document.getElementById('loginModal');
  const logoutBtn = document.getElementById('logoutBtn');
  if (show) {
    modal.classList.remove('hidden');
    logoutBtn.style.display = 'none';
  } else {
    modal.classList.add('hidden');
    logoutBtn.style.display = 'inline-flex';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const createLinkForm = document.getElementById('createLinkForm');
  const generateBtn = document.getElementById('generateBtn');
  const resultBox = document.getElementById('resultBox');
  const generatedLinkInput = document.getElementById('generatedLinkInput');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const testLinkBtn = document.getElementById('testLinkBtn');
  const refreshLinksBtn = document.getElementById('refreshLinksBtn');
  const linksList = document.getElementById('linksList');
  const deleteLinkBtn = document.getElementById('deleteLinkBtn');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  // Initial Auth Check
  if (!authToken) {
    showLoginModal(true);
  } else {
    checkAuthStatus();
  }

  // Login Form Handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value.trim();

    loginError.classList.add('hidden');
    loginSubmitBtn.disabled = true;
    loginSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok && data.token) {
        authToken = data.token;
        localStorage.setItem('linktrace_token', authToken);
        showLoginModal(false);
        loadLinksList();
      } else {
        loginError.innerText = data.error || 'Username atau Password salah';
        loginError.classList.remove('hidden');
      }
    } catch (err) {
      loginError.innerText = 'Koneksi ke server gagal';
      loginError.classList.remove('hidden');
    } finally {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Masuk ke Dashboard';
    }
  });

  // Logout Handler
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch(`${API_BASE}/api/logout`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
    } catch {}
    authToken = '';
    localStorage.removeItem('linktrace_token');
    showLoginModal(true);
  });

  // Create Link Form Handler
  createLinkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetUrl = document.getElementById('targetUrl').value.trim();
    const title = document.getElementById('title').value.trim();
    const customCode = document.getElementById('customCode').value.trim();

    if (!targetUrl) return;

    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';

    try {
      const res = await fetch(`${API_BASE}/api/links`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ targetUrl, title, customCode })
      });

      const data = await res.json();
      if (res.ok) {
        const originUrl = API_BASE ? API_BASE : window.location.origin;
        const fullTrackUrl = `${originUrl}/r/${data.link.code}`;
        generatedLinkInput.value = fullTrackUrl;
        testLinkBtn.href = fullTrackUrl;
        resultBox.classList.remove('hidden');

        // Reset form
        createLinkForm.reset();

        // Refresh list & select newly created link
        await loadLinksList(data.link.code);
      } else if (res.status === 401) {
        showLoginModal(true);
      } else {
        alert(data.error || 'Gagal membuat link');
      }
    } catch (err) {
      alert('Terjadi kesalahan koneksi ke server');
    } finally {
      generateBtn.disabled = false;
      generateBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Generate Trackable Link';
    }
  });

  // Copy Link Handler
  copyLinkBtn.addEventListener('click', () => {
    generatedLinkInput.select();
    navigator.clipboard.writeText(generatedLinkInput.value);
    copyLinkBtn.innerHTML = '<i class="fa-solid fa-check"></i> Tersalin!';
    setTimeout(() => {
      copyLinkBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Salin';
    }, 2000);
  });

  // Refresh Links Handler
  refreshLinksBtn.addEventListener('click', () => {
    loadLinksList(currentActiveCode);
  });

  // Delete Link Handler
  deleteLinkBtn.addEventListener('click', async () => {
    if (!currentActiveCode) return;
    if (confirm(`Apakah Anda yakin ingin menghapus link [${currentActiveCode}]?`)) {
      try {
        const res = await fetch(`${API_BASE}/api/links/${currentActiveCode}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (res.ok) {
          currentActiveCode = null;
          loadLinksList();
        } else if (res.status === 401) {
          showLoginModal(true);
        }
      } catch (err) {
        alert('Gagal menghapus link');
      }
    }
  });
});

async function checkAuthStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/check-auth`, {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      showLoginModal(false);
      loadLinksList();
    } else {
      showLoginModal(true);
    }
  } catch (err) {
    showLoginModal(true);
  }
}

// Fetch & Load Links List
async function loadLinksList(selectCode = null) {
  const linksList = document.getElementById('linksList');
  try {
    const res = await fetch(`${API_BASE}/api/links`, {
      headers: getAuthHeaders()
    });
    
    if (res.status === 401) {
      showLoginModal(true);
      return;
    }

    const links = await res.json();

    if (!links || links.length === 0) {
      linksList.innerHTML = '<div class="text-muted text-center py-4">Belum ada link pelacak. Buat sekarang di atas!</div>';
      resetAnalyticsView();
      return;
    }

    linksList.innerHTML = '';
    links.forEach(item => {
      const el = document.createElement('div');
      el.className = `link-item ${selectCode === item.code || (!selectCode && !currentActiveCode && item.code === links[0].code) ? 'active' : ''}`;
      el.onclick = () => selectLink(item.code);

      const dateStr = new Date(item.createdAt).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });
      el.innerHTML = `
        <div class="link-item-title">${escapeHtml(item.title)}</div>
        <div class="link-item-meta">
          <span class="link-code-badge">/r/${item.code}</span>
          <span><i class="fa-solid fa-eye"></i> ${item.totalClicks} klik • ${dateStr}</span>
        </div>
      `;
      linksList.appendChild(el);
    });

    const targetCode = selectCode || currentActiveCode || links[0].code;
    selectLink(targetCode);

  } catch (err) {
    linksList.innerHTML = '<div class="text-danger py-2">Gagal memuat daftar link</div>';
  }
}

// Select a link & fetch full analytics
async function selectLink(code) {
  currentActiveCode = code;

  document.querySelectorAll('.link-item').forEach(el => {
    if (el.querySelector('.link-code-badge').innerText === `/r/${code}`) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  try {
    const res = await fetch(`${API_BASE}/api/links/${code}`, {
      headers: getAuthHeaders()
    });
    if (res.status === 401) {
      showLoginModal(true);
      return;
    }
    if (!res.ok) return;
    const data = await res.json();

    // Update Header Card
    document.getElementById('activeLinkCode').innerText = `/r/${data.code}`;
    document.getElementById('activeLinkTitle').innerText = data.title;
    document.getElementById('activeLinkTarget').innerText = `Target URL: ${data.targetUrl}`;
    document.getElementById('deleteLinkBtn').style.display = 'inline-flex';

    // Update Summary Metrics
    const analytics = data.analytics;
    document.getElementById('statTotalClicks').innerText = analytics.totalClicks;
    
    // Top City
    const topCity = getTopKey(analytics.cities) || '-';
    const statTopCityEl = document.getElementById('statTopCity');
    statTopCityEl.innerText = topCity;
    statTopCityEl.title = topCity;

    // Top Referrer
    const topRef = getTopKey(analytics.referrers) || '-';
    const statTopRefEl = document.getElementById('statTopReferrer');
    statTopRefEl.innerText = topRef;
    statTopRefEl.title = topRef;

    // Top Device
    const topDev = getTopKey(analytics.devices) || '-';
    const statTopDevEl = document.getElementById('statTopDevice');
    statTopDevEl.innerText = topDev;
    statTopDevEl.title = topDev;

    // Render Map & Charts
    renderMap(data.clicks);
    renderReferrerChart(analytics.referrers);
    renderDeviceChart(analytics.devices);

    // Update Log Table
    renderLogsTable(data.clicks);

  } catch (err) {
    console.error('Error fetching analytics:', err);
  }
}

// Global Map Variables
let mapInstance = null;
let mapMarkers = [];

function renderMap(clicks) {
  const mapElement = document.getElementById('map');
  const mapPinCount = document.getElementById('mapPinCount');

  if (!mapElement) return;

  if (!mapInstance) {
    // Center initially over Indonesia
    mapInstance = L.map('map').setView([-2.5489, 118.0149], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapInstance);
  }

  // Clear existing markers
  mapMarkers.forEach(m => mapInstance.removeLayer(m));
  mapMarkers = [];

  const validClicks = (clicks || []).filter(c => c.lat && c.lon && (c.lat !== 0 || c.lon !== 0));
  mapPinCount.innerText = `${validClicks.length} Titik Lokasi`;

  if (validClicks.length === 0) {
    mapInstance.setView([-2.5489, 118.0149], 4);
    return;
  }

  validClicks.forEach(c => {
    const popupContent = `
      <div style="font-size:0.85rem; line-height:1.4; color:#0f172a;">
        <strong style="font-size:0.95rem; color:#0f172a;">${escapeHtml(c.city)}, ${escapeHtml(c.country)}</strong><br>
        <span style="color:#0284c7; font-weight:700;">📍 Lat: ${c.lat.toFixed(5)}, Lon: ${c.lon.toFixed(5)}</span><br>
        <small style="color:#475569;">Metode: ${escapeHtml(c.locType || 'IP Geolocation')}</small><br>
        <small style="color:#64748b;">${new Date(c.timestamp).toLocaleString('id-ID')}</small>
      </div>
    `;

    const marker = L.marker([c.lat, c.lon]).addTo(mapInstance).bindPopup(popupContent);
    mapMarkers.push(marker);
  });

  // Fit bounds if markers exist
  if (mapMarkers.length > 0) {
    const group = L.featureGroup(mapMarkers);
    mapInstance.fitBounds(group.getBounds().pad(0.3));
  }

  // Force Leaflet to recalculate container dimensions and fill 100% width
  setTimeout(() => {
    if (mapInstance) {
      mapInstance.invalidateSize();
    }
  }, 200);
}

// Helper to get key with max value in object
function getTopKey(obj) {
  if (!obj || Object.keys(obj).length === 0) return null;
  return Object.keys(obj).reduce((a, b) => obj[a] > obj[b] ? a : b);
}

// Render Visitor Logs Table
function renderLogsTable(clicks) {
  const tableBody = document.getElementById('logsTableBody');
  const countBadge = document.getElementById('logsCountBadge');

  countBadge.innerText = `${clicks ? clicks.length : 0} Kunjungan`;

  if (!clicks || clicks.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-muted">Belum ada yang membuka link ini. Sebar link untuk melihat log real-time!</td>
      </tr>
    `;
    return;
  }

  // Sort latest first
  const sorted = [...clicks].reverse();

  tableBody.innerHTML = sorted.map(c => {
    const timeStr = new Date(c.timestamp).toLocaleString('id-ID', {
      hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short'
    });

    let refTagClass = 'tag-other';
    const cat = c.referrerCategory;
    if (cat === 'WhatsApp') refTagClass = 'tag-wa';
    else if (cat === 'Instagram') refTagClass = 'tag-ig';
    else if (cat === 'Facebook') refTagClass = 'tag-fb';
    else if (cat.includes('Direct')) refTagClass = 'tag-direct';

    const latLonText = (c.lat && c.lon) ? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}` : '-';
    const mapsUrl = (c.lat && c.lon) ? `https://www.google.com/maps?q=${c.lat},${c.lon}` : '#';

    return `
      <tr>
        <td style="white-space:nowrap; vertical-align:middle;"><strong>${timeStr}</strong></td>
        <td style="vertical-align:middle; min-width:210px;">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="line-height:1.3;">
              <i class="fa-solid fa-location-dot" style="color:#06b6d4; margin-right:4px;"></i>
              <strong>${escapeHtml(c.city || 'Kota Tidak Diketahui')}</strong>, <span style="color:#94a3b8; font-size:0.85rem;">${escapeHtml(c.country || '-')}</span>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:nowrap; margin-top:2px;">
              <small style="color:#38bdf8; font-family:monospace; font-size:0.8rem; white-space:nowrap;">📌 ${latLonText}</small> 
              <span class="badge" style="font-size:0.65rem; padding:2px 6px; background:rgba(6,182,212,0.15); color:#06b6d4; border-color:rgba(6,182,212,0.3); white-space:nowrap; line-height:1;">${escapeHtml(c.locType || 'IP')}</span>
            </div>
          </div>
        </td>
        <td style="vertical-align:middle; white-space:nowrap;">
          <span class="tag-referrer ${refTagClass}" style="white-space:nowrap; display:inline-block;">${escapeHtml(cat)}</span>
        </td>
        <td style="vertical-align:middle; white-space:nowrap;"><i class="fa-solid fa-display" style="color:#a855f7; margin-right:4px;"></i> ${escapeHtml(c.device)}</td>
        <td style="vertical-align:middle; white-space:nowrap;">${escapeHtml(c.browser)}</td>
        <td style="vertical-align:middle;">
          <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-start;">
            <code style="color:#94a3b8; font-size:0.85rem; white-space:nowrap;">${escapeHtml(c.ip)}</code>
            ${c.lat && c.lon ? `<a href="${mapsUrl}" target="_blank" class="btn btn-sm btn-outline" style="padding:3px 10px; font-size:0.75rem; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-map-pin" style="color:#ef4444;"></i> Google Maps</a>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Render Referrer Chart (Doughnut)
function renderReferrerChart(referrersObj) {
  const ctx = document.getElementById('referrerChart').getContext('2d');
  const labels = Object.keys(referrersObj);
  const data = Object.values(referrersObj);

  if (referrerChartInstance) {
    referrerChartInstance.destroy();
  }

  if (labels.length === 0) {
    labels.push('Belum Ada Data');
    data.push(1);
  }

  referrerChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: ['#25d366', '#e1306c', '#1877f2', '#6366f1', '#a855f7', '#06b6d4', '#f97316'],
        borderWidth: 2,
        borderColor: '#1e293b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans' } } }
      }
    }
  });
}

// Render Device Chart (Bar)
function renderDeviceChart(devicesObj) {
  const ctx = document.getElementById('deviceChart').getContext('2d');
  const labels = Object.keys(devicesObj);
  const data = Object.values(devicesObj);

  if (deviceChartInstance) {
    deviceChartInstance.destroy();
  }

  deviceChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['Belum Ada Data'],
      datasets: [{
        label: 'Jumlah Klik',
        data: data.length ? data : [0],
        backgroundColor: 'rgba(6, 182, 212, 0.6)',
        borderColor: '#06b6d4',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function resetAnalyticsView() {
  document.getElementById('activeLinkCode').innerText = 'SELECT LINK';
  document.getElementById('activeLinkTitle').innerText = 'Belum ada link dipilih';
  document.getElementById('activeLinkTarget').innerText = '-';
  document.getElementById('statTotalClicks').innerText = '0';
  document.getElementById('statTopCity').innerText = '-';
  document.getElementById('statTopReferrer').innerText = '-';
  document.getElementById('statTopDevice').innerText = '-';
  document.getElementById('deleteLinkBtn').style.display = 'none';
  renderLogsTable([]);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
