/**
 * app.js — SnapBooth FINAL + ImgBB + QR Permanen
 *
 * Alur QR:
 *   1. Foto selesai → strip di-render ke canvas
 *   2. Canvas → base64 → upload ke ImgBB API
 *   3. ImgBB return link permanen
 *   4. Link di-encode ke QR Code
 *   5. Client scan kapanpun → foto tetap ada
 */

// ⚠️ PENTING: Ganti dengan API key kamu sendiri sebelum deploy
const IMGBB_API_KEY = '6947b43c605be95646f5101da2a2ede4';

const state = {
  stream:         null,
  captured:       [],
  totalShots:     1,
  isShooting:     false,
  activeFilter:   '',
  filterLabel:    'Normal',
  activeStickers: [],
  frameColor:     '#ffffff',
  facingMode:     'user',
  zoomLevel:      1,
  lastImgUrl:     null,
};

let el = {};

document.addEventListener('DOMContentLoaded', () => {
  el = {
    video:       document.getElementById('video'),
    workCanvas:  document.getElementById('work-canvas'),
    countdown:   document.getElementById('countdown'),
    blitz:       document.getElementById('blitz'),
    status:      document.getElementById('status'),
    shotDots:    document.getElementById('shot-dots'),
    filterLabel: document.getElementById('filter-label'),
    zoomLabel:   document.getElementById('zoom-label'),
    stickerOvl:  document.getElementById('sticker-overlay'),
    noCam:       document.getElementById('no-cam'),
    strip:       document.getElementById('photo-strip'),
    stripFoot:   document.getElementById('strip-foot'),
    stripDate:   document.getElementById('strip-date'),
    btnCapture:  document.getElementById('btn-capture'),
    btnDl:       document.getElementById('btn-dl'),
    shotRow:     document.getElementById('shot-row'),
    filterRow:   document.getElementById('filter-row'),
    stickerRow:  document.getElementById('sticker-row'),
    swatches:    document.getElementById('swatches'),
    qrSection:   document.getElementById('qr-section'),
    qrCanvas:    document.getElementById('qr-canvas'),
    qrLink:      document.getElementById('qr-link'),
  };

  registerEvents();
  setStripDate();
  renderSlots();
  startCamera();
});

/* ============================================================
   KAMERA
   ============================================================ */
async function startCamera() {
  setStatus('Meminta izin kamera...');
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    el.video.srcObject = state.stream;
    await new Promise(resolve => {
      if (el.video.readyState >= 2) { resolve(); return; }
      el.video.addEventListener('canplay', resolve, { once: true });
    });
    el.video.style.display = 'block';
    el.noCam.classList.remove('show');
    applyZoom();
    tryNativeZoom();
    const label = state.facingMode === 'user'
      ? 'Kamera depan'
      : `Kamera belakang ${state.zoomLevel < 1 ? '(0.5×)' : ''}`;
    setStatus(`${label} aktif 🟢`);
  } catch (err) {
    let msg = '⚠️ Gagal akses kamera.';
    if (err.name === 'NotAllowedError')      msg = '⚠️ Akses ditolak. Izinkan kamera di browser.';
    if (err.name === 'NotFoundError')        msg = '⚠️ Kamera tidak ditemukan.';
    if (err.name === 'NotReadableError')     msg = '⚠️ Kamera dipakai aplikasi lain. Refresh dulu.';
    if (err.name === 'OverconstrainedError') msg = '⚠️ Kamera tidak support mode ini.';
    setStatus(msg);
    el.noCam.classList.add('show');
  }
}

function applyZoom() {
  if (state.zoomLevel === 0.5) {
    el.video.style.transform       = 'scaleX(-1) scale(0.6)';
    el.video.style.transformOrigin = 'center center';
    el.zoomLabel.textContent       = '0.5×';
  } else {
    el.video.style.transform       = state.facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
    el.video.style.transformOrigin = 'center center';
    el.zoomLabel.textContent       = '1×';
  }
}

async function tryNativeZoom() {
  if (state.zoomLevel >= 1) return;
  try {
    const track = state.stream?.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities?.();
    if (caps?.zoom) {
      await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
    }
  } catch (_) {}
}

function switchCamera(btn) {
  document.querySelectorAll('[data-cam]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.facingMode = btn.dataset.cam;
  state.zoomLevel  = parseFloat(btn.dataset.zoom);
  startCamera();
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function registerEvents() {

  el.shotRow.addEventListener('click', e => {
    const btn = e.target.closest('[data-shots]');
    if (!btn || state.isShooting) return;
    el.shotRow.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.totalShots = parseInt(btn.dataset.shots, 10);
    resetAll();
    setStatus(`Mode <strong>${state.totalShots} foto</strong> dipilih`);
  });

  el.filterRow.addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    el.filterRow.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeFilter = btn.dataset.filter;
    state.filterLabel  = btn.dataset.label;
    el.video.style.filter = state.activeFilter || 'none';
    el.filterLabel.textContent = state.filterLabel.toUpperCase();
  });

  el.stickerRow.addEventListener('click', e => {
    const btn = e.target.closest('[data-s]');
    if (!btn) return;
    const { s: emoji, tx, ty } = btn.dataset;
    const idx = state.activeStickers.findIndex(s => s.emoji === emoji);
    if (idx !== -1) {
      state.activeStickers.splice(idx, 1);
      btn.classList.remove('active');
      removeLiveSticker(emoji);
    } else {
      if (state.activeStickers.length >= 4) {
        setStatus('Maksimal <strong>4 stiker</strong>'); return;
      }
      state.activeStickers.push({ emoji, tx: +tx, ty: +ty });
      btn.classList.add('active');
      addLiveSticker(emoji, +tx, +ty);
    }
  });

  el.swatches.addEventListener('click', e => {
    const sw = e.target.closest('[data-c]');
    if (!sw) return;
    el.swatches.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    state.frameColor = sw.dataset.c;
    el.strip.style.background     = state.frameColor;
    el.stripFoot.style.background = state.frameColor;
    const dark = state.frameColor === '#1a1a1a';
    el.stripFoot.querySelector('.strip-foot-brand').style.color = dark ? '#666' : '#aaa';
    el.stripFoot.querySelector('.strip-foot-date').style.color  = dark ? '#999' : '#555';
  });
}

/* ============================================================
   STIKER
   ============================================================ */
function addLiveSticker(emoji, tx, ty) {
  const id = 'live-' + encodeURIComponent(emoji);
  if (document.getElementById(id)) return;
  const div = document.createElement('div');
  div.className = 'live-sticker'; div.id = id;
  div.textContent = emoji;
  div.style.left = tx + '%'; div.style.top = ty + '%';
  el.stickerOvl.appendChild(div);
}
function removeLiveSticker(emoji) {
  document.getElementById('live-' + encodeURIComponent(emoji))?.remove();
}

/* ============================================================
   SESI CAPTURE
   ============================================================ */
async function startSession() {
  if (!state.stream || state.isShooting) return;
  state.isShooting       = true;
  el.btnCapture.disabled = true;
  state.captured         = [];
  el.qrSection.style.display = 'none';
  renderSlots();

  for (let i = 0; i < state.totalShots; i++) {
    setStatus(`Bersiap foto <strong>${i + 1}</strong> dari <strong>${state.totalShots}</strong>...`);
    await runCountdown();
    const dataUrl = captureFrame();
    state.captured.push(dataUrl);
    fillSlot(i, dataUrl);
    updateDots();
    setStatus(`✅ Foto <strong>${i + 1}</strong> berhasil diambil`);
    if (i < state.totalShots - 1) await sleep(850);
  }

  el.btnCapture.disabled = false;
  state.isShooting       = false;
  el.btnDl.classList.add('ready');

  // Upload ke ImgBB lalu generate QR
  await uploadAndGenerateQR();
}

function runCountdown() {
  return new Promise(resolve => {
    let n = 3; showCountdown(n);
    const iv = setInterval(() => {
      n--;
      if (n > 0) showCountdown(n);
      else { clearInterval(iv); el.countdown.classList.remove('on'); resolve(); }
    }, 1000);
  });
}

function showCountdown(n) {
  el.countdown.textContent = n;
  el.countdown.classList.remove('on');
  void el.countdown.offsetWidth;
  el.countdown.classList.add('on');
}

function captureFrame() {
  const W  = el.video.videoWidth  || 640;
  const H  = el.video.videoHeight || 480;
  const wc = el.workCanvas;
  wc.width = W; wc.height = H;
  const ctx = wc.getContext('2d');
  ctx.save();
  if (state.zoomLevel === 0.5) {
    const scale = 0.6;
    const ox = (W - W * scale) / 2;
    const oy = (H - H * scale) / 2;
    if (state.facingMode === 'user') { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.filter = state.activeFilter || 'none';
    ctx.drawImage(el.video, ox, oy, W * scale, H * scale);
  } else {
    if (state.facingMode === 'user') { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.filter = state.activeFilter || 'none';
    ctx.drawImage(el.video, 0, 0, W, H);
  }
  ctx.restore();
  ctx.filter = 'none';
  drawStickersTo(ctx, W, H);
  triggerBlitz();
  return wc.toDataURL('image/jpeg', 0.95);
}

function drawStickersTo(ctx, W, H) {
  if (!state.activeStickers.length) return;
  ctx.font = `${Math.round(W * 0.12)}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  state.activeStickers.forEach(({ emoji, tx, ty }) => {
    ctx.fillText(emoji, (tx / 100) * W, (ty / 100) * H);
  });
}

function triggerBlitz() {
  const b = el.blitz;
  b.style.transition = 'none'; b.style.opacity = '0';
  void b.offsetWidth;
  b.style.transition = 'opacity 0.04s'; b.style.opacity = '1';
  setTimeout(() => {
    b.style.transition = 'opacity 0.08s'; b.style.opacity = '0.2';
    setTimeout(() => {
      b.style.transition = 'opacity 0.04s'; b.style.opacity = '0.9';
      setTimeout(() => {
        b.style.transition = 'opacity 0.35s ease-out'; b.style.opacity = '0';
      }, 60);
    }, 80);
  }, 60);
}

/* ============================================================
   IMGBB UPLOAD + QR
   ============================================================ */

/**
 * uploadAndGenerateQR()
 *
 * Alur:
 *   1. Render strip canvas
 *   2. Ambil base64 dari canvas (tanpa prefix "data:image/jpeg;base64,")
 *   3. POST ke ImgBB API dengan FormData
 *   4. ImgBB return JSON berisi URL permanen
 *   5. URL di-encode ke QR Code
 *   6. QR tampil di layar
 */
async function uploadAndGenerateQR() {
  if (!state.captured.length) return;

  setStatus('⏳ Mengupload foto ke cloud...');

  try {
    // Step 1: Render strip
    const stripCanvas = await buildStripCanvas();

    // Step 2: Ambil base64 bersih (tanpa prefix)
    const dataUrl  = stripCanvas.toDataURL('image/jpeg', 0.92);
    const base64   = dataUrl.split(',')[1];

    // Step 3: Upload ke ImgBB
    const formData = new FormData();
    formData.append('key',   IMGBB_API_KEY);
    formData.append('image', base64);
    formData.append('name',  `snapbooth_${Date.now()}`);

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body:   formData,
    });

    if (!response.ok) throw new Error(`ImgBB error: ${response.status}`);

    const json = await response.json();

    if (!json.success) throw new Error('Upload gagal: ' + json.error?.message);

    // Step 4: Ambil URL permanen dari response
    // json.data.url         = URL langsung ke gambar
    // json.data.display_url = URL tampilan (bisa dibuka di browser)
    // json.data.url_viewer  = halaman viewer ImgBB
    const imageUrl = json.data.url_viewer; // pakai viewer agar HP bisa langsung lihat
    state.lastImgUrl = imageUrl;

    // Step 5: Generate QR dari URL permanen
    await QRCode.toCanvas(el.qrCanvas, imageUrl, {
      width:  220,
      margin: 2,
      color: {
        dark:  '#0d0d0d',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });

    // Step 6: Tampilkan section QR + link
    el.qrSection.style.display = 'flex';
    if (el.qrLink) {
      el.qrLink.href        = imageUrl;
      el.qrLink.textContent = 'Buka link foto →';
    }

    setStatus('✅ QR siap! Link permanen — scan kapanpun 📲');

  } catch (err) {
    // Fallback: jika upload gagal, pakai blob URL lokal
    setStatus('⚠️ Upload gagal, pakai QR lokal: ' + err.message);
    console.error('[ImgBB]', err);
    await generateQRLocal();
  }
}

/**
 * generateQRLocal()
 * Fallback jika ImgBB tidak bisa diakses (offline/error).
 * Pakai blob URL lokal — link mati kalau tab ditutup.
 */
async function generateQRLocal() {
  try {
    const stripCanvas = await buildStripCanvas();
    const blob        = await new Promise(r => stripCanvas.toBlob(r, 'image/jpeg', 0.92));
    const blobUrl     = URL.createObjectURL(blob);

    await QRCode.toCanvas(el.qrCanvas, blobUrl, {
      width: 220, margin: 2,
      color: { dark: '#0d0d0d', light: '#ffffff' },
    });

    el.qrSection.style.display = 'flex';
    setStatus('⚠️ QR lokal aktif — jangan tutup tab browser!');
  } catch (err) {
    setStatus('⚠️ Gagal buat QR: ' + err.message);
  }
}

/* ============================================================
   STRIP
   ============================================================ */
function renderSlots() {
  if (!el.strip) return;
  el.strip.innerHTML = '';
  el.strip.style.background = state.frameColor;
  for (let i = 0; i < state.totalShots; i++) {
    const slot = document.createElement('div');
    slot.className = 'strip-slot'; slot.id = `slot-${i}`;
    slot.innerHTML = `<span class="empty">FOTO ${i + 1}</span>`;
    el.strip.appendChild(slot);
  }
  updateDots();
  el.btnDl?.classList.remove('ready');
}

function fillSlot(i, dataUrl) {
  const slot = document.getElementById(`slot-${i}`);
  if (!slot) return;
  slot.innerHTML = '';
  const img = document.createElement('img');
  img.src = dataUrl; img.alt = `Foto ${i + 1}`;
  slot.appendChild(img);
}

function updateDots() {
  if (!el.shotDots) return;
  el.shotDots.innerHTML = '';
  for (let i = 0; i < state.totalShots; i++) {
    const d = document.createElement('div');
    d.className = 'dot' + (i < state.captured.length ? ' done' : '');
    el.shotDots.appendChild(d);
  }
}

/* ============================================================
   DOWNLOAD
   ============================================================ */
async function downloadStrip() {
  if (!state.captured.length) return;
  setStatus('⏳ Menyiapkan file...');
  try {
    const dlc  = await buildStripCanvas();
    const a    = document.createElement('a');
    a.href     = dlc.toDataURL('image/jpeg', 0.93);
    a.download = `snapbooth_${Date.now()}.jpg`;
    a.click();
    setStatus('✅ Strip berhasil didownload!');
  } catch (err) { setStatus('⚠️ Gagal download: ' + err.message); }
}

async function buildStripCanvas() {
  const SW=480, SH=360, PAD=28, GAP=8, FH=72;
  const TW = SW + PAD * 2;
  const TH = PAD + (SH + GAP) * state.captured.length - GAP + PAD + FH;
  const c  = document.createElement('canvas');
  c.width  = TW; c.height = TH;
  const dc = c.getContext('2d');
  dc.fillStyle = state.frameColor; dc.fillRect(0, 0, TW, TH);
  for (let i = 0; i < state.captured.length; i++) {
    const img = await loadImage(state.captured[i]);
    const y   = PAD + i * (SH + GAP);
    dc.drawImage(img, PAD, y, SW, SH);
    dc.save();
    dc.globalAlpha = 0.28; dc.fillStyle = '#fff';
    dc.font = 'bold 13px sans-serif';
    dc.textAlign = 'right'; dc.textBaseline = 'bottom';
    dc.fillText('snapbooth.app', PAD + SW - 8, y + SH - 7);
    dc.restore();
  }
  const dark = state.frameColor === '#1a1a1a';
  dc.textAlign = 'center'; dc.textBaseline = 'middle';
  dc.font = '500 15px sans-serif'; dc.fillStyle = dark ? '#666' : '#aaa';
  dc.fillText('✦ SNAPBOOTH ✦', TW / 2, TH - FH + 26);
  dc.font = 'bold 13px sans-serif'; dc.fillStyle = dark ? '#999' : '#555';
  dc.fillText(getTodayString(), TW / 2, TH - FH + 52);
  return c;
}

/* ============================================================
   RESET
   ============================================================ */
function resetAll() {
  if (state.isShooting) return;
  state.captured = []; state.activeStickers = [];
  if (el.stickerOvl) el.stickerOvl.innerHTML = '';
  el.stickerRow?.querySelectorAll('.stk-btn').forEach(b => b.classList.remove('active'));
  el.qrSection.style.display = 'none';
  renderSlots();
  el.btnDl?.classList.remove('ready');
  setStatus('Reset — siap ambil foto baru');
}

/* ============================================================
   HELPERS
   ============================================================ */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar'));
    img.src = src;
  });
}

function setStatus(html) { if (el.status) el.status.innerHTML = html; }
function setStripDate()  { if (el.stripDate) el.stripDate.textContent = getTodayString(); }
function getTodayString() {
  return new Date().toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}