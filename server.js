const express = require('express');
const cors = require('cors');
const useragent = require('useragent');
const http = require('http');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3009;

// Admin Credentials
const ADMIN_USER = process.env.ADMIN_USER || 'duwiarsana';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Duwiarsana1234!?';

// Active Session Tokens
const activeTokens = new Set();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Persistent Database Storage Setup
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'links.json');
const linksDb = new Map();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function saveDatabaseToDisk() {
  try {
    ensureDataDir();
    const dataObj = {};
    linksDb.forEach((val, key) => {
      dataObj[key] = val;
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(dataObj, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving database to disk:', err);
  }
}

function loadDatabaseFromDisk() {
  try {
    ensureDataDir();
    if (fs.existsSync(DATA_FILE)) {
      const fileData = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(fileData);
      Object.keys(parsed).forEach(key => {
        linksDb.set(key, parsed[key]);
      });
      console.log(`💾 Persistent database loaded. Total links: ${linksDb.size}`);
    } else {
      // Pre-populate initial demo data if database file doesn't exist
      const demoCode = 'demo123';
      linksDb.set(demoCode, {
        code: demoCode,
        title: 'Link Promo Toko Online (Demo)',
        targetUrl: 'https://shopee.co.id',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        clicks: [
          {
            timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
            ip: '180.252.12.98',
            country: 'Indonesia',
            city: 'Sanur, Denpasar (Bali)',
            isp: 'Telkomsel Bali',
            lat: -8.6883,
            lon: 115.2634,
            locType: 'GPS Presisi',
            referrerCategory: 'WhatsApp',
            referrerRaw: 'https://api.whatsapp.com',
            device: 'Mobile (Android)',
            browser: 'Chrome 122.0'
          },
          {
            timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
            ip: '114.124.201.45',
            country: 'Indonesia',
            city: 'Denpasar (Bali)',
            isp: 'Biznet Bali',
            lat: -8.6705,
            lon: 115.2126,
            locType: 'GPS Presisi',
            referrerCategory: 'Instagram',
            referrerRaw: 'https://l.instagram.com',
            device: 'Mobile (iPhone)',
            browser: 'Mobile Safari 17.2'
          },
          {
            timestamp: new Date(Date.now() - 3600000 * 1).toISOString(),
            ip: '139.192.14.88',
            country: 'Indonesia',
            city: 'Kuta, Badung (Bali)',
            isp: 'Indosat Ooredoo',
            lat: -8.7205,
            lon: 115.1692,
            locType: 'IP Geolocation',
            referrerCategory: 'Direct / Langsung',
            referrerRaw: 'Langsung / Ketik URL',
            device: 'Desktop (macOS)',
            browser: 'Chrome 122.0'
          }
        ]
      });
      saveDatabaseToDisk();
      console.log('💾 Initial demo database created and saved to disk.');
    }
  } catch (err) {
    console.error('Error loading database from disk:', err);
  }
}

// Load database on server start
loadDatabaseFromDisk();

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Authentication Middleware for Protected APIs
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Akses ditolak. Silakan login terlebih dahulu.' });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!activeTokens.has(token)) {
    return res.status(401).json({ error: 'Sesi telah berakhir, silakan login kembali.' });
  }

  next();
}

// Reverse Geocoding helper via OpenStreetMap Nominatim
function reverseGeocode(lat, lon) {
  return new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`;
    const options = {
      headers: { 'User-Agent': 'LinkAnalyticsApp/1.0' }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.address) {
            const city = parsed.address.suburb || parsed.address.village || parsed.address.town || parsed.address.city || parsed.address.county || 'Sanur';
            const state = parsed.address.state || 'Bali';
            const country = parsed.address.country || 'Indonesia';
            return resolve({ city: `${city}, ${state}`, country });
          }
          resolve(null);
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// IP Location lookup fallback
function fetchIpLocation(ip) {
  return new Promise((resolve) => {
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return resolve({
        ip: ip || '127.0.0.1',
        country: 'Indonesia',
        countryCode: 'ID',
        city: 'Sanur, Denpasar (Bali)',
        isp: 'Telkom Indonesia / Biznet Bali',
        lat: -8.6883,
        lon: 115.2634
      });
    }

    const cleanIp = ip.split(',')[0].trim();
    const req = http.get(`http://ip-api.com/json/${cleanIp}?fields=status,country,countryCode,city,isp,lat,lon,query`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.status === 'success') {
            resolve({
              ip: parsed.query,
              country: parsed.country,
              countryCode: parsed.countryCode,
              city: parsed.city,
              isp: parsed.isp,
              lat: parsed.lat || -8.6883,
              lon: parsed.lon || 115.2634
            });
          } else {
            resolve({ ip: cleanIp, country: 'Indonesia', city: 'Sanur, Denpasar (Bali)', isp: 'ISP Lokal', lat: -8.6883, lon: 115.2634 });
          }
        } catch {
          resolve({ ip: cleanIp, country: 'Indonesia', city: 'Sanur, Denpasar (Bali)', isp: 'ISP Lokal', lat: -8.6883, lon: 115.2634 });
        }
      });
    });

    req.on('error', () => {
      resolve({ ip: cleanIp, country: 'Indonesia', city: 'Sanur, Denpasar (Bali)', isp: 'ISP Lokal', lat: -8.6883, lon: 115.2634 });
    });

    req.setTimeout(2000, () => {
      req.destroy();
      resolve({ ip: cleanIp, country: 'Indonesia', city: 'Sanur, Denpasar (Bali)', isp: 'ISP Lokal', lat: -8.6883, lon: 115.2634 });
    });
  });
}

function categorizeReferrer(refHeader) {
  if (!refHeader || refHeader.trim() === '') return { category: 'Direct / Langsung', raw: 'Langsung / Ketik URL' };
  const lower = refHeader.toLowerCase();
  if (lower.includes('whatsapp') || lower.includes('wa.me')) return { category: 'WhatsApp', raw: refHeader };
  if (lower.includes('instagram')) return { category: 'Instagram', raw: refHeader };
  if (lower.includes('facebook') || lower.includes('fb.com')) return { category: 'Facebook', raw: refHeader };
  if (lower.includes('twitter') || lower.includes('t.co') || lower.includes('x.com')) return { category: 'Twitter / X', raw: refHeader };
  if (lower.includes('google')) return { category: 'Google Search', raw: refHeader };
  if (lower.includes('tiktok')) return { category: 'TikTok', raw: refHeader };
  if (lower.includes('telegram') || lower.includes('t.me')) return { category: 'Telegram', raw: refHeader };
  
  try {
    const urlObj = new URL(refHeader);
    return { category: urlObj.hostname, raw: refHeader };
  } catch {
    return { category: 'Lainnya', raw: refHeader };
  }
}

// Allowed System Users & Passwords
const USERS = {
  'duwiarsana': process.env.ADMIN_PASS || 'Duwiarsana1234!?',
  'guest': '12345678'
};

// AUTH API: LOGIN
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (username && USERS[username] && USERS[username] === password) {
    const token = crypto.randomBytes(32).toString('hex');
    activeTokens.add(token);
    return res.json({ success: true, token, username });
  }

  res.status(401).json({ error: 'Username atau Password salah!' });
});

// AUTH API: CHECK SESSION
app.get('/api/check-auth', requireAuth, (req, res) => {
  res.json({ authenticated: true, username: ADMIN_USER });
});

// AUTH API: LOGOUT
app.post('/api/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '').trim();
    activeTokens.delete(token);
  }
  res.json({ success: true });
});

// PROTECTED API: Create new link
app.post('/api/links', requireAuth, (req, res) => {
  let { targetUrl, title, customCode } = req.body;
  if (!targetUrl) return res.status(400).json({ error: 'URL Tujuan wajib diisi!' });
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  let code = customCode ? customCode.trim() : generateCode();
  if (linksDb.has(code)) {
    if (customCode) return res.status(400).json({ error: 'Kode kustom sudah digunakan, pilih kode lain!' });
    code = generateCode();
  }

  const newLink = {
    code,
    title: title || targetUrl,
    targetUrl,
    createdAt: new Date().toISOString(),
    clicks: []
  };

  linksDb.set(code, newLink);
  saveDatabaseToDisk(); // SAVE TO DISK IMMEDIATELY

  res.json({ message: 'Link berhasil dibuat!', link: newLink });
});

// PROTECTED API: Get all links
app.get('/api/links', requireAuth, (req, res) => {
  const result = [];
  linksDb.forEach((val) => {
    result.push({
      code: val.code,
      title: val.title,
      targetUrl: val.targetUrl,
      createdAt: val.createdAt,
      totalClicks: val.clicks.length
    });
  });
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(result);
});

// PROTECTED API: Get link detail
app.get('/api/links/:code', requireAuth, (req, res) => {
  const link = linksDb.get(req.params.code);
  if (!link) return res.status(404).json({ error: 'Link tidak ditemukan' });

  const totalClicks = link.clicks.length;
  const referrers = {};
  const countries = {};
  const cities = {};
  const devices = {};
  const browsers = {};

  link.clicks.forEach(c => {
    referrers[c.referrerCategory] = (referrers[c.referrerCategory] || 0) + 1;
    countries[c.country] = (countries[c.country] || 0) + 1;
    cities[c.city] = (cities[c.city] || 0) + 1;
    devices[c.device] = (devices[c.device] || 0) + 1;
    browsers[c.browser] = (browsers[c.browser] || 0) + 1;
  });

  res.json({
    ...link,
    analytics: {
      totalClicks,
      referrers,
      countries,
      cities,
      devices,
      browsers
    }
  });
});

// PROTECTED API: Delete link
app.delete('/api/links/:code', requireAuth, (req, res) => {
  const deleted = linksDb.delete(req.params.code);
  if (deleted) {
    saveDatabaseToDisk(); // SAVE TO DISK IMMEDIATELY
    res.json({ message: 'Link berhasil dihapus' });
  } else {
    res.status(404).json({ error: 'Link tidak ditemukan' });
  }
});

// UNPROTECTED PUBLIC REDIRECT ENDPOINT: /r/:code
app.get('/r/:code', async (req, res) => {
  const code = req.params.code;
  const link = linksDb.get(code);

  if (!link) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Link Tidak Ditemukan</title></head>
      <body style="font-family:sans-serif; background:#0f172a; color:#f8fafc; text-align:center; padding-top:100px;">
        <h1 style="color:#ef4444;">404 - Link Tidak Ditemukan</h1>
        <p>Link pelacak ini tidak valid atau telah dihapus.</p>
        <a href="/" style="color:#38bdf8; text-decoration:none;">Kembali ke Dashboard</a>
      </body>
      </html>
    `);
  }

  const queryLat = parseFloat(req.query.lat);
  const queryLon = parseFloat(req.query.lon);
  const isFallback = req.query.fallback === '1' || req.query.fallback === 'true';

  if (!isNaN(queryLat) && !isNaN(queryLon) || isFallback) {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const refHeader = req.headers['referer'] || req.headers['referrer'] || '';
    const agentString = req.headers['user-agent'] || '';

    const agent = useragent.parse(agentString);
    const deviceType = agent.device.toString() !== 'Other 0.0.0' 
      ? agent.device.toString() 
      : (agentString.includes('Mobi') || agentString.includes('Android') || agentString.includes('iPhone') ? 'Mobile' : 'Desktop');
    const osName = agent.os.family !== 'Other' ? agent.os.family : 'Unknown OS';
    const browserName = `${agent.family} ${agent.major}.${agent.minor}`;

    const referrerInfo = categorizeReferrer(refHeader);
    const locInfo = await fetchIpLocation(rawIp);

    let finalLat = (!isNaN(queryLat) && queryLat !== 0) ? queryLat : locInfo.lat;
    let finalLon = (!isNaN(queryLon) && queryLon !== 0) ? queryLon : locInfo.lon;
    const locType = (!isNaN(queryLat) && queryLat !== 0) ? 'GPS Presisi' : 'IP Geolocation';

    let cityName = locInfo.city;
    let countryName = locInfo.country;

    if (!isNaN(queryLat) && queryLat !== 0) {
      const geoResult = await reverseGeocode(queryLat, queryLon);
      if (geoResult) {
        cityName = geoResult.city;
        countryName = geoResult.country;
      } else {
        cityName = 'Sanur, Denpasar (Bali)';
      }
    }

    const clickEvent = {
      timestamp: new Date().toISOString(),
      ip: locInfo.ip,
      country: countryName,
      countryCode: locInfo.countryCode || 'ID',
      city: cityName,
      isp: locInfo.isp,
      lat: finalLat,
      lon: finalLon,
      locType: locType,
      referrerCategory: referrerInfo.category,
      referrerRaw: referrerInfo.raw,
      device: `${deviceType} (${osName})`,
      browser: browserName
    };

    link.clicks.push(clickEvent);
    saveDatabaseToDisk(); // SAVE TO DISK IMMEDIATELY ON VISITOR CLICK

    return res.redirect(link.targetUrl);
  }

  // Smart Landing Page for High-Accuracy GPS Capture
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Mengarahkan ke ${link.title}...</title>
      <style>
        body {
          background: #0f172a;
          color: #f8fafc;
          font-family: system-ui, -apple-system, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          padding: 20px;
          box-sizing: border-box;
          text-align: center;
        }
        .card {
          background: rgba(30, 41, 59, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 30px 24px;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .spinner {
          width: 44px;
          height: 44px;
          border: 4px solid rgba(255,255,255,0.1);
          border-top-color: #06b6d4;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 16px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        h3 { margin: 0 0 8px; font-size: 1.2rem; }
        p { color: #94a3b8; font-size: 0.9rem; margin: 0 0 20px; line-height: 1.4; }
        .btn {
          background: #06b6d4;
          color: #0f172a;
          font-weight: 700;
          border: none;
          padding: 12px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.95rem;
          width: 100%;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="spinner"></div>
        <h3>Mengarahkan ke ${link.title}</h3>
        <p id="statusText">Mengonfirmasi lokasi presisi Anda... Silakan ketuk <b>"Izinkan / Allow"</b> jika muncul konfirmasi lokasi.</p>
        <button class="btn" id="proceedBtn" onclick="proceed(null, null)">Lanjutkan Langsung &rarr;</button>
      </div>

      <script>
        const targetCode = "${code}";
        let done = false;

        function proceed(lat, lon) {
          if (done) return;
          done = true;
          if (lat && lon) {
            window.location.replace('/r/' + targetCode + '?lat=' + lat + '&lon=' + lon);
          } else {
            window.location.replace('/r/' + targetCode + '?fallback=1');
          }
        }

        function requestGps() {
          if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                document.getElementById('statusText').innerText = "Lokasi terkonfirmasi! Mengarahkan...";
                proceed(pos.coords.latitude, pos.coords.longitude);
              },
              (err) => {
                proceed(null, null);
              },
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
            );
          } else {
            proceed(null, null);
          }
        }

        requestGps();
        setTimeout(() => proceed(null, null), 8500);
      </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 Link Analytics Server running at http://localhost:${PORT}`);
});
