# 📍 LinkTrace PRO - Link Analytics, Camera Snapshot & Visitor Location Tracking App

LinkTrace PRO adalah aplikasi *Link Shortener, Camera Snapshot & Geolocation Analytics* modern yang mampu melacak dan mendeteksi lokasi presisi (GPS & IP Geolocation) pengakses link, mengambil foto snapshot kamera (opsional), menampilkan preview thumbnail sosial media (WhatsApp/FB/Telegram), mendeteksi sumber lalu lintas (*WhatsApp*, *Instagram*, *Facebook*, *Direct*, dll.), jenis perangkat/OS, serta peramban web (*browser*) secara real-time.

---

## ✨ Fitur Utama

- 📸 **Camera Snapshot (ON/OFF Toggle)**: Fitur pengambil foto snapshot kamera (HTML5 Web API) opsional yang dapat diaktifkan atau dimatikan saat membuat link pelacak. Foto tersimpan dan dapat dilihat langsung di log dashboard.
- 🖼️ **Open Graph Social Link Preview**: Dukungan Meta Tags `og:image`, `og:title`, dan `og:description` untuk menampilkan banner thumbnail dan judul campaign otomatis saat link dibagikan ke WhatsApp, Telegram, Facebook, dan Twitter.
- 🤖 **Dedicated Social Crawler Detector**: Deteksi bot pemindai preview sosial media (*WhatsApp/Facebook Crawlers*) sehingga preview tautan muncul seketika tanpa mengganggu alur pengunjung.
- 🎯 **GPS Precision Location Capture**: Halaman perantara pintar (*clean landing page*) yang meminta izin lokasi GPS berpresisi tinggi (`navigator.geolocation`) dari HP/Komputer pengakses.
- 🌐 **Reverse Geocoding Otomatis**: Mengonversi koordinat Lat/Lon menjadi Nama Desa, Kecamatan, Kota, dan Provinsi menggunakan OpenStreetMap Nominatim.
- 🗺️ **Interactive Leaflet Map**: Peta interaktif berwarna lengkap dengan pin lokasi pengunjung dan info detail saat diklik.
- 📊 **Comprehensive Analytics**: Metric cards, diagram lingkaran (*donut chart*) sumber referrer, serta grafik batang jenis perangkat.
- 📑 **Full-Width Real-Time Visitor Logs**: Tabel log pengunjung lengkap dengan foto snapshot kamera, status koordinat, alamat IP, peramban, serta tombol tautan langsung ke **Google Maps**.
- 🔒 **Admin Authentication**: Dilengkapi dengan pengaman sesi login admin & guest (Token-based Auth).
- 💾 **Persistent JSON Database**: Menyimpan seluruh data link, foto snapshot, dan riwayat pengunjung secara permanen di server (`data/links.json`).

---

## 🛠️ Teknologi & Stack

- **Backend**: Node.js, Express.js (Support 20MB Base64 Upload Payload)
- **Frontend**: HTML5, Vanilla CSS3 (Custom Glassmorphism Design System), JavaScript (ES6+)
- **Camera API**: HTML5 MediaDevices `getUserMedia` API
- **Social Metadata**: Open Graph protocol & Twitter Cards
- **Mapping & Charts**: Leaflet.js, Chart.js, FontAwesome 6
- **Reverse Geocoding & IP Lookup**: OpenStreetMap Nominatim, ip-api

---

## 🚀 Panduan Instalasi & Penggunaan Lokal

### 1. Prasyarat
- Node.js (v16 atau versi lebih baru)
- npm

### 2. Clone Repositori
```bash
git clone https://github.com/duwiarsana/link-analytics.git
cd link-analytics
```

### 3. Install Dependensi
```bash
npm install
```

### 4. Jalankan Aplikasi
```bash
npm start
# atau untuk mode pengembangan:
node server.js
```
Buka browser Anda dan akses: `http://localhost:3009`

---

## 🔐 Kredensial Admin & Guest

Aplikasi ini mendukung multi-user autentikasi:

| Username | Password | Peran / Akses |
| :--- | :--- | :--- |
| `duwiarsana` | `Duwiarsana1234!?` | Super Admin |
| `guest` | `12345678` | Guest Account |

*Catatan: Kredensial admin utama dapat diubah melalui Environment Variables (`ADMIN_PASS`).*

---

## 🌐 Deploy ke VPS (Production Nginx & PM2)

### 1. Jalankan dengan PM2
```bash
PORT=3009 pm2 start server.js --name "link-analytics"
```

### 2. Konfigurasi Reverse Proxy Nginx
```nginx
server {
    server_name link.duwiarsana.id;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3009;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. Pasang Sertifikat SSL (Let's Encrypt)
```bash
sudo certbot --nginx -d link.duwiarsana.id
```

---

## 📄 Lisensi

Proyek ini dibuat dan dikembangkan untuk penggunaan publik dan pelacakan analytics tautan link. Silakan gunakan dan sesuaikan sesuai kebutuhan Anda.

*Created by [duwiarsana](https://github.com/duwiarsana)*
