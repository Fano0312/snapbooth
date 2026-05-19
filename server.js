/**
 * server.js — SnapBooth Local Server
 * 
 * Fitur:
 *   - Serve file web (index.html, style.css, app.js)
 *   - Terima foto dari browser → simpan di laptop
 *   - Proses foto dengan Sharp (sharpen, enhance, HD)
 */

const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const sharp    = require('sharp');

const PORT     = 3000;
const SAVE_DIR = path.join(__dirname, 'hasil_foto');

// Buat folder hasil_foto jika belum ada
if (!fs.existsSync(SAVE_DIR)) {
  fs.mkdirSync(SAVE_DIR, { recursive: true });
  console.log('📁 Folder hasil_foto dibuat');
}

// MIME types untuk serve file statis
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
};

const server = http.createServer(async (req, res) => {

  // ── CORS header ── agar browser bisa akses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ============================================================
  // POST /save-photo — Terima foto dari browser, proses, simpan
  // ============================================================
  if (req.method === 'POST' && req.url === '/save-photo') {
    let body = '';

    req.on('data', chunk => { body += chunk.toString(); });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);

        // Validasi: harus ada field 'image' berisi base64
        if (!data.image) throw new Error('Tidak ada data gambar');

        // Ambil base64 murni (hapus prefix "data:image/jpeg;base64,")
        const base64 = data.image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64, 'base64');

        // Nama file dengan timestamp
        const timestamp = new Date().toISOString()
          .replace(/[:.]/g, '-')
          .replace('T', '_')
          .slice(0, 19);
        const layout    = data.layout || 'strip';
        const filename  = `snapbooth_${layout}_${timestamp}.jpg`;
        const filepath  = path.join(SAVE_DIR, filename);

        console.log(`\n📸 Foto diterima: ${filename}`);
        console.log(`   Layout  : ${layout}`);
        console.log(`   Ukuran  : ${(buffer.length / 1024).toFixed(1)} KB`);

        // ── PROSES DENGAN SHARP (HD Enhancement) ──
        /*
          Pipeline pemrosesan:
          1. sharpen()     → pertajam tepi & detail
          2. modulate()    → tingkatkan brightness & saturasi
          3. linear()      → kontras lebih baik
          4. jpeg({quality: 95}) → simpan kualitas tinggi
        */
        const processed = await sharp(buffer)
          .sharpen({
            sigma: 1.2,    // radius sharpen (0.5-3)
            m1:    0.5,    // flat areas
            m2:    0.5,    // edge areas
          })
          .modulate({
            brightness: 1.05,   // sedikit lebih terang
            saturation: 1.15,   // warna lebih hidup
          })
          .linear(
            1.05,   // multiply (kontras)
            -5      // offset (shadows)
          )
          .jpeg({
            quality:           95,    // kualitas JPEG tinggi
            chromaSubsampling: '4:4:4', // warna lebih akurat
            force:             true,
          })
          .toBuffer();

        // Simpan ke folder hasil_foto
        fs.writeFileSync(filepath, processed);

        const sizeBefore = (buffer.length / 1024).toFixed(1);
        const sizeAfter  = (processed.length / 1024).toFixed(1);
        console.log(`   Sebelum : ${sizeBefore} KB`);
        console.log(`   Sesudah : ${sizeAfter} KB (HD enhanced)`);
        console.log(`   Disimpan: ${filepath}`);

        // Response sukses ke browser
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success:  true,
          filename: filename,
          message:  'Foto berhasil disimpan dan diproses HD',
          size:     sizeAfter + ' KB',
        }));

      } catch (err) {
        console.error('❌ Error proses foto:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: err.message,
        }));
      }
    });

    return;
  }

  // ============================================================
  // GET /status — Cek server aktif
  // ============================================================
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status:  'aktif',
      port:    PORT,
      dir:     SAVE_DIR,
      message: 'SnapBooth server berjalan',
    }));
    return;
  }

  // ============================================================
  // GET — Serve file statis (index.html, css, js, dll)
  // ============================================================
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext      = path.extname(filePath);
  const mimeType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File tidak ditemukan: ' + req.url);
      } else {
        res.writeHead(500);
        res.end('Server error: ' + err.message);
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════╗');
  console.log('║     📸 SNAPBOOTH SERVER AKTIF       ║');
  console.log(`║     Port    : ${PORT}                  ║`);
  console.log(`║     Simpan  : hasil_foto/           ║`);
  console.log('╚════════════════════════════════════╝');
  console.log('');
  console.log('🌐 Buka di browser laptop : http://localhost:3000');
  console.log('📱 Buka di HP (hotspot)   : http://[IP_LAPTOP]:3000');
  console.log('');
  console.log('💡 Cek IP laptop: buka CMD → ketik ipconfig');
  console.log('');
});
