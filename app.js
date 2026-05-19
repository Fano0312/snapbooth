/**
 * app.js — SnapBooth FINAL
 * Fitur: ImgBB + EmailJS + QR + Sharp HD + Save Local Server
 */

const IMGBB_API_KEY       = '6947b43c605be95646f5101da2a2ede4';
const EMAILJS_SERVICE_ID  = 'service_9wazu13';
const EMAILJS_TEMPLATE_ID = 'template_nhhqm4z';
const EMAILJS_PUBLIC_KEY  = '255XRSfdjkDg_uJdP';

const state = {
  stream:           null,
  captured:         [],
  totalShots:       1,
  isShooting:       false,
  activeFilter:     '',
  filterLabel:      'Normal',
  activeStickers:   [],
  frameColor:       '#ffffff',
  facingMode:       'user',
  zoomLevel:        1,
  layout:           'vertical',
  currentImageUrl:  null,
};

let el = {};

document.addEventListener('DOMContentLoaded', () => {
  emailjs.init(EMAILJS_PUBLIC_KEY);

  el = {
    video:               document.getElementById('video'),
    workCanvas:          document.createElement('canvas'),
    countdown:           document.getElementById('countdown'),
    blitz:               document.getElementById('blitz'),
    status:              document.getElementById('status'),
    shotDots:            document.getElementById('shot-dots'),
    filterLabel:         document.getElementById('filter-label'),
    zoomLabel:           document.getElementById('zoom-label'),
    stickerOvl:          document.getElementById('sticker-overlay'),
    noCam:               document.getElementById('no-cam'),
    stripPreviewWrapper: document.getElementById('strip-preview-wrapper'),
    strip:               document.getElementById('photo-strip'),
    stripFoot:           document.getElementById('strip-foot'),
    stripDate:           document.getElementById('strip-date'),
    btnCapture:          document.getElementById('btn-capture'),
    btnDl:               document.getElementById('btn-dl'),
    btnEmail:            document.getElementById('btn-email'),
    shotRow:             document.getElementById('shot-row'),
    filterRow:           document.getElementById('filter-row'),
    layoutRow:           document.getElementById('layout-row'),
    stickerRow:          document.getElementById('sticker-row'),
    swatches:            document.getElementById('swatches'),
    qrSection:           document.getElementById('qr-section'),
    qrCanvas:            document.getElementById('qr-canvas'),
    qrLink:              document.getElementById('qr-link'),
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
  setStatus('⏳ Meminta izin & memindai lensa...');
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }

  try {
    await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
      .then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});

    const devices     = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d => d.kind === 'videoinput');

    let finalConstraints = {
      video: { width: { ideal: 960 }, height: { ideal: 1280 } }
    };
    let isUltraWideFound = false;

    if (state.facingMode === 'user') {
      finalConstraints.video.facingMode = 'user';
    } else {
      const backCams = videoInputs.filter(d =>
        d.label.toLowerCase().includes('back') ||
        d.label.toLowerCase().includes('belakang') ||
        d.label.toLowerCase().includes('environment') ||
        (!d.label.toLowerCase().includes('front') &&
         !d.label.toLowerCase().includes('depan'))
      );
      if (state.zoomLevel === 0.5) {
        const uwCam = backCams.find(d =>
          d.label.toLowerCase().match(/ultra|wide|0\.5/)
        );
        if (uwCam) {
          finalConstraints.video.deviceId = { exact: uwCam.deviceId };
          isUltraWideFound = true;
        } else if (backCams.length > 1) {
          finalConstraints.video.deviceId = { exact: backCams[backCams.length - 1].deviceId };
          isUltraWideFound = true;
        } else {
          finalConstraints.video.facingMode = { ideal: 'environment' };
        }
      } else {
        if (backCams.length > 0)
          finalConstraints.video.deviceId = { exact: backCams[0].deviceId };
        else
          finalConstraints.video.facingMode = { ideal: 'environment' };
      }
    }

    state.stream = await navigator.mediaDevices.getUserMedia(finalConstraints);
    el.video.srcObject = state.stream;

    await new Promise(resolve => {
      if (el.video.readyState >= 2) { resolve(); return; }
      el.video.addEventListener('canplay', resolve, { once: true });
    });

    el.video.style.display        = 'block';
    el.noCam.classList.remove('show');
    el.video.style.transform      = state.facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
    el.video.style.transformOrigin = 'center center';
    if (el.zoomLabel) el.zoomLabel.textContent =
      (state.zoomLevel === 0.5 && state.facingMode === 'environment') ? '0.5×' : '1×';

    tryNativeZoom();

    if (state.facingMode === 'user')     setStatus('Kamera depan aktif 🟢');
    else if (state.zoomLevel === 0.5)    setStatus(isUltraWideFound ? 'Lensa Ultra-Wide aktif 🔭' : '⚠️ Ultra-Wide tidak terdeteksi, pakai kamera biasa');
    else                                 setStatus('Kamera belakang aktif 🟢');

  } catch (err) {
    setStatus('⚠️ Akses ditolak atau kamera tidak ditemukan.');
    el.noCam.classList.add('show');
    console.error('[Camera]', err);
  }
}

async function tryNativeZoom() {
  try {
    const track = state.stream?.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities?.();
    if (caps?.zoom) {
      if (state.zoomLevel === 0.5)
        await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
      else
        await track.applyConstraints({ advanced: [{ zoom: Math.max(caps.zoom.min, 1) }] });
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

  // Shot count
  el.shotRow.addEventListener('click', e => {
    const btn = e.target.closest('[data-shots]');
    if (!btn || state.isShooting) return;
    el.shotRow.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.totalShots = parseInt(btn.dataset.shots, 10);
    if (state.totalShots < 4 && state.layout === 'grid') {
      state.layout = 'vertical';
      el.layoutRow.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
      el.layoutRow.querySelector('[data-layout="vertical"]').classList.add('active');
    }
    const btnGrid = el.layoutRow.querySelector('[data-layout="grid"]');
    if (state.totalShots === 4) { btnGrid.disabled = false; btnGrid.title = ''; }
    else                        { btnGrid.disabled = true;  btnGrid.title = 'Grid 2×2 hanya untuk 4 foto'; }
    resetAll();
    setStatus(`Mode <strong>${state.totalShots} foto</strong> dipilih`);
  });

  // Layout
  el.layoutRow.addEventListener('click', e => {
    const btn = e.target.closest('[data-layout]');
    if (!btn || btn.disabled) return;
    el.layoutRow.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.layout = btn.dataset.layout;
    renderSlots();
  });

  // Filter
  el.filterRow.addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    el.filterRow.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeFilter = btn.dataset.filter;
    el.video.style.filter = state.activeFilter || 'none';
    if (el.filterLabel) el.filterLabel.textContent = (btn.dataset.label || 'Normal').toUpperCase();
  });

  // Stiker
  el.stickerRow.addEventListener('click', e => {
    const btn = e.target.closest('[data-s]');
    if (!btn) return;
    const { s: emoji, tx, ty } = btn.dataset;
    const idx = state.activeStickers.findIndex(s => s.emoji === emoji);
    if (idx !== -1) {
      state.activeStickers.splice(idx, 1);
      btn.classList.remove('active');
      document.getElementById('live-' + encodeURIComponent(emoji))?.remove();
    } else {
      if (state.activeStickers.length >= 4) {
        setStatus('Maksimal <strong>4 stiker</strong>'); return;
      }
      state.activeStickers.push({ emoji, tx: +tx, ty: +ty });
      btn.classList.add('active');
      const div       = document.createElement('div');
      div.className   = 'live-sticker';
      div.id          = 'live-' + encodeURIComponent(emoji);
      div.textContent = emoji;
      div.style.left  = tx + '%';
      div.style.top   = ty + '%';
      el.stickerOvl.appendChild(div);
    }
  });

  // Warna frame
  el.swatches.addEventListener('click', e => {
    const sw = e.target.closest('[data-c]');
    if (!sw) return;
    el.swatches.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');

    const val = sw.dataset.c;
    state.frameColor = val;

    // Support gradient
    const isGrad = val.startsWith('grad:');
    let bgCss = val;
    if (isGrad) {
      const cols = val.replace('grad:', '').split(',');
      bgCss = `linear-gradient(135deg, ${cols[0]}, ${cols[1]})`;
    }

    if (el.stripPreviewWrapper) el.stripPreviewWrapper.style.background = bgCss;

    // Warna teks footer preview
    const dark = isColorDark(isGrad ? val.replace('grad:', '').split(',')[0] : val);
    const brand = el.stripFoot?.querySelector('.strip-foot-brand');
    const date  = el.stripFoot?.querySelector('.strip-foot-date');
    if (brand) brand.style.color = dark ? '#888' : 'rgba(0,0,0,0.45)';
    if (date)  date.style.color  = dark ? '#aaa' : 'rgba(0,0,0,0.55)';
  });
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

  if (el.btnEmail) {
    el.btnEmail.style.display = 'none';
    el.btnEmail.disabled      = false;
    el.btnEmail.innerHTML     = '📧 KIRIM KE jasbona18@gmail.com';
  }

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
  await uploadAndGenerateQR();
}

function runCountdown() {
  return new Promise(resolve => {
    let n = 3;
    el.countdown.textContent = n;
    el.countdown.classList.add('on');
    const iv = setInterval(() => {
      n--;
      if (n > 0) {
        el.countdown.classList.remove('on');
        void el.countdown.offsetWidth;
        el.countdown.textContent = n;
        el.countdown.classList.add('on');
      } else {
        clearInterval(iv);
        el.countdown.classList.remove('on');
        resolve();
      }
    }, 1000);
  });
}

function captureFrame() {
  const W  = el.video.videoWidth  || 640;
  const H  = el.video.videoHeight || 480;
  const wc = el.workCanvas;
  wc.width = W; wc.height = H;
  const ctx = wc.getContext('2d');

  ctx.save();
  if (state.facingMode === 'user') { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.filter = state.activeFilter || 'none';
  ctx.drawImage(el.video, 0, 0, W, H);
  ctx.restore();
  ctx.filter = 'none';

  if (state.activeStickers.length) {
    ctx.font         = `${Math.round(W * 0.12)}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    state.activeStickers.forEach(({ emoji, tx, ty }) => {
      ctx.fillText(emoji, (tx / 100) * W, (ty / 100) * H);
    });
  }

  triggerBlitz();
  return wc.toDataURL('image/jpeg', 0.95);
}

function triggerBlitz() {
  const b = el.blitz;
  if (!b) return;
  b.style.transition = 'none'; b.style.opacity = '0'; void b.offsetWidth;
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
   UPLOAD IMGBB + QR
   ============================================================ */
async function uploadAndGenerateQR() {
  if (!state.captured.length) return;
  setStatus('⏳ Mengupload foto ke cloud...');
  try {
    const stripCanvas = await buildStripCanvas();
    const base64      = stripCanvas.toDataURL('image/jpeg', 0.92).split(',')[1];
    const formData    = new FormData();
    formData.append('key',   IMGBB_API_KEY);
    formData.append('image', base64);
    formData.append('name',  `snapbooth_${Date.now()}`);

    const res  = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error('Upload gagal');

    const imageUrl        = json.data.url_viewer;
    state.currentImageUrl = imageUrl;

    // Simpan ke server lokal (jika diakses via localhost)
    await saveToLocalServer(stripCanvas.toDataURL('image/jpeg', 1.0));

    if (el.btnEmail) el.btnEmail.style.display = 'block';

    await QRCode.toCanvas(el.qrCanvas, imageUrl, {
      width: 220, margin: 2,
      color: { dark: '#0d0d0d', light: '#ffffff' },
    });
    el.qrSection.style.display = 'flex';
    if (el.qrLink) el.qrLink.href = imageUrl;
    setStatus('✅ Foto siap! Scan QR atau klik kirim untuk mencetak.');

  } catch (err) {
    console.warn('[ImgBB]', err.message);
    setStatus('⚠️ Cloud gagal, pakai QR lokal...');
    try {
      const stripCanvas = await buildStripCanvas();

      // Tetap simpan ke server lokal meski ImgBB gagal
      await saveToLocalServer(stripCanvas.toDataURL('image/jpeg', 1.0));

      const blob = await new Promise(r => stripCanvas.toBlob(r, 'image/jpeg', 0.92));
      const url  = URL.createObjectURL(blob);
      await QRCode.toCanvas(el.qrCanvas, url, {
        width: 220, margin: 2,
        color: { dark: '#0d0d0d', light: '#ffffff' },
      });
      el.qrSection.style.display = 'flex';
      if (el.qrLink) el.qrLink.href = url;
      setStatus('📲 QR lokal aktif — jangan tutup tab browser!');
    } catch (_) {}
  }
}

/* ============================================================
   SAVE TO LOCAL SERVER (Sharp HD Enhancement)
   ============================================================ */
/**
 * saveToLocalServer(dataUrl)
 *
 * Kirim foto ke server Node.js di laptop.
 * Server akan proses foto dengan Sharp (sharpen, enhance)
 * lalu simpan ke folder hasil_foto/.
 *
 * Hanya aktif saat web dibuka via:
 *   http://localhost:3000
 *   http://192.168.x.x:3000
 */
async function saveToLocalServer(dataUrl) {
  try {
    const host    = window.location.hostname;
    const isLocal = host === 'localhost'
      || host.startsWith('192.168.')
      || host.startsWith('10.')
      || host.startsWith('172.');

    if (!isLocal) {
      console.log('[LocalServer] Skip — bukan server lokal');
      return;
    }

    const serverUrl = `http://${host}:3000/save-photo`;
    console.log('[LocalServer] Mengirim foto ke:', serverUrl);

    const response = await fetch(serverUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        image:  dataUrl,
        layout: state.layout,
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`[LocalServer] ✅ Tersimpan: ${result.filename} (${result.size})`);
      setStatus(`✅ Foto tersimpan di laptop! 💾 (${result.filename})`);
    } else {
      throw new Error(result.message);
    }

  } catch (err) {
    // Tidak tampilkan error ke user — server lokal opsional
    console.warn('[LocalServer] Tidak bisa simpan:', err.message);
  }
}

/* ============================================================
   KIRIM EMAIL MANUAL
   ============================================================ */
function sendToAdminManual() {
  if (!state.currentImageUrl) return;
  el.btnEmail.disabled  = true;
  el.btnEmail.innerHTML = '⏳ MENGIRIM...';
  setStatus('⏳ Mengirim foto ke jasbona18@gmail.com...');

  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    photo_link: state.currentImageUrl,
    waktu:      new Date().toLocaleString('id-ID'),
  }).then(() => {
    setStatus('✅ Sukses! Foto dikirim ke Admin untuk dicetak 🖨️');
    el.btnEmail.innerHTML = '✅ TERKIRIM KE EMAIL';
  }, (err) => {
    setStatus('⚠️ Gagal kirim email. Coba klik lagi.');
    el.btnEmail.disabled  = false;
    el.btnEmail.innerHTML = '📧 COBA KIRIM LAGI';
    console.error('[EmailJS]', err);
  });
}

/* ============================================================
   BUILD STRIP CANVAS
   ============================================================ */
async function buildStripCanvas() {
  return (state.layout === 'grid' && state.captured.length === 4)
    ? await buildGridCanvas()
    : await buildVerticalCanvas();
}

// Helper: gambar background (support solid dan gradient)
function drawFrameBackground(dc, W, H) {
  const val = state.frameColor;
  if (val && val.startsWith('grad:')) {
    const colors = val.replace('grad:', '').split(',');
    const grad   = dc.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1] || colors[0]);
    dc.fillStyle = grad;
  } else {
    dc.fillStyle = val || '#ffffff';
  }
  dc.fillRect(0, 0, W, H);
}

async function buildGridCanvas() {
  const SLOT_W = 300, SLOT_H = 400, PAD = 45, GAP = 18, LOGO_H = 100, FOOT_H = 70;
  const TW = PAD + (SLOT_W + GAP) * 2 - GAP + PAD;
  const TH = LOGO_H + PAD + (SLOT_H + GAP) * 2 - GAP + PAD + FOOT_H;

  const c  = document.createElement('canvas');
  c.width  = TW; c.height = TH;
  const dc = c.getContext('2d');

  // Background
  drawFrameBackground(dc, TW, TH);

  // Logo
  dc.textAlign    = 'center';
  dc.textBaseline = 'middle';
  dc.fillStyle    = getCanvasTextColor(0.85);
  dc.font         = 'bold 40px sans-serif';
  dc.fillText('✦ SNAPBOOTH ✦', TW / 2, LOGO_H / 2 + 10);

  // 4 foto grid 2×2
  for (let i = 0; i < 4; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const x = PAD + col * (SLOT_W + GAP);
    const y = LOGO_H + PAD + row * (SLOT_H + GAP);

    // Border putih
    dc.fillStyle = '#ffffff';
    dc.fillRect(x - 6, y - 6, SLOT_W + 12, SLOT_H + 12);

    const img    = await loadImage(state.captured[i]);
    const cropW  = img.width;
    const cropH  = img.width * (SLOT_H / SLOT_W);
    const cropY  = (img.height - cropH) / 2;

    dc.imageSmoothingEnabled = true;
    dc.imageSmoothingQuality = 'high';
    dc.drawImage(img, 0, cropY, cropW, cropH, x, y, SLOT_W, SLOT_H);
  }

  // Footer tanggal
  dc.textAlign    = 'center';
  dc.textBaseline = 'middle';
  dc.font         = 'bold 18px sans-serif';
  dc.fillStyle    = getCanvasTextColor(0.5);
  dc.fillText(getTodayString(), TW / 2, TH - FOOT_H / 2);

  return c;
}

async function buildVerticalCanvas() {
  const SW = 360, SH = 480, PAD = 45, GAP = 18, FH = 85;
  const TW = SW + PAD * 2;
  const TH = PAD + (SH + GAP) * state.captured.length - GAP + PAD + FH;

  const c  = document.createElement('canvas');
  c.width  = TW; c.height = TH;
  const dc = c.getContext('2d');

  // Background
  drawFrameBackground(dc, TW, TH);

  for (let i = 0; i < state.captured.length; i++) {
    const img  = await loadImage(state.captured[i]);
    const y    = PAD + i * (SH + GAP);

    // Border putih
    dc.fillStyle = '#ffffff';
    dc.fillRect(PAD - 6, y - 6, SW + 12, SH + 12);

    const cropW = img.width;
    const cropH = img.width * (SH / SW);
    const cropY = (img.height - cropH) / 2;

    dc.imageSmoothingEnabled = true;
    dc.imageSmoothingQuality = 'high';
    dc.drawImage(img, 0, cropY, cropW, cropH, PAD, y, SW, SH);
  }

  // Footer
  dc.textAlign    = 'center';
  dc.textBaseline = 'middle';
  dc.font         = '600 14px sans-serif';
  dc.fillStyle    = getCanvasTextColor(0.4);
  dc.fillText('✦ SNAPBOOTH ✦', TW / 2, TH - FH + 30);
  dc.font         = 'bold 13px sans-serif';
  dc.fillStyle    = getCanvasTextColor(0.5);
  dc.fillText(getTodayString(), TW / 2, TH - FH + 54);

  return c;
}

// Rounded rectangle helper
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y,         x + r, y);
  ctx.closePath();
}

/* ============================================================
   RENDER STRIP (preview UI)
   ============================================================ */
function renderSlots() {
  if (!el.strip) return;
  el.strip.innerHTML = '';

  const isGrad = state.frameColor.startsWith('grad:');
  let bgCss = state.frameColor;
  if (isGrad) {
    const cols = state.frameColor.replace('grad:', '').split(',');
    bgCss = `linear-gradient(135deg, ${cols[0]}, ${cols[1]})`;
  }
  if (el.stripPreviewWrapper) {
    el.stripPreviewWrapper.style.background = bgCss;
    el.stripPreviewWrapper.className =
      (state.layout === 'grid' && state.totalShots === 4)
        ? 'strip-preview-wrapper layout-grid'
        : 'strip-preview-wrapper layout-vertical';
  }

  for (let i = 0; i < state.totalShots; i++) {
    const slot     = document.createElement('div');
    slot.className = 'strip-slot';
    slot.id        = `slot-${i}`;
    slot.innerHTML = `<span class="empty">FOTO ${i + 1}</span>`;
    el.strip.appendChild(slot);
  }

  updateDots();
  if (el.btnDl) el.btnDl.classList.remove('ready');
}

function fillSlot(i, dataUrl) {
  const slot = document.getElementById(`slot-${i}`);
  if (!slot) return;
  slot.innerHTML = '';
  const img = document.createElement('img');
  img.src   = dataUrl;
  img.alt   = `Foto ${i + 1}`;
  slot.appendChild(img);
}

function updateDots() {
  if (!el.shotDots) return;
  el.shotDots.innerHTML = '';
  for (let i = 0; i < state.totalShots; i++) {
    const d     = document.createElement('div');
    d.className = 'dot' + (i < state.captured.length ? ' done' : '');
    el.shotDots.appendChild(d);
  }
}

/* ============================================================
   DOWNLOAD
   ============================================================ */
async function downloadStrip() {
  if (!state.captured.length) return;
  setStatus('⏳ Menyiapkan file HD...');
  try {
    const dlc      = await buildStripCanvas();
    const dataUrl  = dlc.toDataURL('image/jpeg', 1.0);
    const a        = document.createElement('a');
    a.href         = dataUrl;
    a.download     = `snapbooth_${Date.now()}.jpg`;
    a.click();
    setStatus('✅ Strip HD berhasil didownload!');
  } catch (err) {
    setStatus('⚠️ Gagal download: ' + err.message);
  }
}

/* ============================================================
   RESET
   ============================================================ */
function resetAll() {
  if (state.isShooting) return;
  state.captured       = [];
  state.activeStickers = [];
  state.currentImageUrl = null;

  if (el.stickerOvl)  el.stickerOvl.innerHTML = '';
  el.stickerRow?.querySelectorAll('.stk-btn').forEach(b => b.classList.remove('active'));
  el.qrSection.style.display = 'none';

  if (el.btnEmail) {
    el.btnEmail.style.display = 'none';
    el.btnEmail.disabled      = false;
    el.btnEmail.innerHTML     = '📧 KIRIM KE jasbona18@gmail.com';
  }

  renderSlots();
  if (el.btnDl) el.btnDl.classList.remove('ready');
  setStatus('Reset — siap ambil foto baru');
}

/* ============================================================
   HELPERS
   ============================================================ */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img   = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar'));
    img.src     = src;
  });
}

function setStatus(html) { if (el.status) el.status.innerHTML = html; }
function setStripDate()  { if (el.stripDate) el.stripDate.textContent = getTodayString(); }
function getTodayString() {
  return new Date().toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function isColorDark(hex) {
  if (!hex || hex.startsWith('grad:')) hex = (hex || '').replace('grad:', '').split(',')[0] || '#ffffff';
  const c   = hex.replace('#', '');
  if (c.length < 6) return false;
  const r   = parseInt(c.substring(0, 2), 16) / 255;
  const g   = parseInt(c.substring(2, 4), 16) / 255;
  const b   = parseInt(c.substring(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.4;
}

function getCanvasTextColor(alpha = 0.5) {
  return isColorDark(state.frameColor)
    ? `rgba(255,255,255,${alpha})`
    : `rgba(0,0,0,${alpha})`;
}
