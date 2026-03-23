/**
 * app.js — SnapBooth FINAL
 * Fitur: filter, stiker, multi-shot, blitz, kamera potret
 * + ImgBB upload + QR permanen 
 * + BINGKAI TEBAL 
 * + DEEP SCAN ULTRA-WIDE LENS
 */

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
  layout:         'vertical',
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
    stripPreviewWrapper: document.getElementById('strip-preview-wrapper'),
    strip:       document.getElementById('photo-strip'),
    stripFoot:   document.getElementById('strip-foot'),
    stripDate:   document.getElementById('strip-date'),
    btnCapture:  document.getElementById('btn-capture'),
    btnDl:       document.getElementById('btn-dl'),
    shotRow:     document.getElementById('shot-row'),
    filterRow:   document.getElementById('filter-row'),
    layoutRow:   document.getElementById('layout-row'),
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
   KAMERA DENGAN DEEP SCAN ULTRA-WIDE
   ============================================================ */
async function startCamera() {
  setStatus('⏳ Meminta izin & memindai lensa...');
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }

  try {
    // 1. Pancing izin kamera dulu agar label perangkat terbaca
    await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
      .then(s => s.getTracks().forEach(t => t.stop())).catch(e => {});

    // 2. Scan semua lensa yang ada di HP
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d => d.kind === 'videoinput');
    
    let finalConstraints = {
      video: { width: { ideal: 960 }, height: { ideal: 1280 } }
    };

    let isUltraWideFound = false;

    if (state.facingMode === 'user') {
      finalConstraints.video.facingMode = 'user';
    } else {
      // Saring hanya lensa belakang
      const backCams = videoInputs.filter(d => 
        d.label.toLowerCase().includes('back') || 
        d.label.toLowerCase().includes('belakang') ||
        d.label.toLowerCase().includes('environment') ||
        d.label.toLowerCase().includes('camera2') ||
        (!d.label.toLowerCase().includes('front') && !d.label.toLowerCase().includes('depan'))
      );

      if (state.zoomLevel === 0.5) {
        // Cari lensa Ultra-Wide secara spesifik
        const uwCam = backCams.find(d => 
          d.label.toLowerCase().match(/ultra|wide|0\.5/)
        );

        if (uwCam) {
          finalConstraints.video.deviceId = { exact: uwCam.deviceId };
          isUltraWideFound = true;
        } else if (backCams.length > 1) {
          // Jika tidak ada label khusus tapi ada banyak lensa belakang,
          // paksakan mengambil lensa terakhir (biasanya ultrawide/macro di Android)
          finalConstraints.video.deviceId = { exact: backCams[backCams.length - 1].deviceId };
          isUltraWideFound = true;
        } else {
          finalConstraints.video.facingMode = { ideal: 'environment' };
        }
      } else {
        // 1x Normal (Kamera Belakang Utama, biasanya index 0)
        if (backCams.length > 0) {
          finalConstraints.video.deviceId = { exact: backCams[0].deviceId };
        } else {
          finalConstraints.video.facingMode = { ideal: 'environment' };
        }
      }
    }

    // 3. Nyalakan kamera dengan lensa yang terpilih
    state.stream = await navigator.mediaDevices.getUserMedia(finalConstraints);
    el.video.srcObject = state.stream;
    
    await new Promise(resolve => {
      if (el.video.readyState >= 2) { resolve(); return; }
      el.video.addEventListener('canplay', resolve, { once: true });
    });

    el.video.style.display = 'block';
    el.noCam.classList.remove('show');
    
    applyMirroring();
    tryNativeZoom();

    // Notifikasi status ke user
    if (state.facingMode === 'user') {
      setStatus('Kamera depan aktif 🟢');
    } else if (state.zoomLevel === 0.5) {
      if (isUltraWideFound) {
        setStatus('Lensa Ultra-Wide fisik berhasil diakses 🔭');
      } else {
        setStatus('⚠️ Browser memblokir ultra-wide fisik (pakai max-zoom standar)');
      }
    } else {
      setStatus('Kamera belakang aktif 🟢');
    }

  } catch (err) {
    setStatus('⚠️ Akses ditolak atau kamera tidak ditemukan.');
    el.noCam.classList.add('show');
  }
}

function applyMirroring() {
  // Hanya mirror kamera depan. Kamera belakang biarkan apa adanya agar tidak manipulasi zoom digital.
  if (state.facingMode === 'user') {
    el.video.style.transform = 'scaleX(-1)'; 
  } else {
    el.video.style.transform = 'scaleX(1)';   
  }
  el.video.style.transformOrigin = 'center center';
  el.zoomLabel.textContent = (state.zoomLevel === 0.5 && state.facingMode === 'environment') ? '0.5×' : '1×';
}

async function tryNativeZoom() {
  try {
    const track = state.stream?.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities?.();
    if (caps?.zoom) {
      if (state.zoomLevel === 0.5) {
        await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
      } else {
        const baseline = Math.max(caps.zoom.min, 1);
        await track.applyConstraints({ advanced: [{ zoom: baseline }] });
      }
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

    if (state.totalShots < 4 && state.layout === 'grid') {
      state.layout = 'vertical';
      el.layoutRow.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
      el.layoutRow.querySelector('[data-layout="vertical"]').classList.add('active');
    }

    const btnGrid = el.layoutRow.querySelector('[data-layout="grid"]');
    if (state.totalShots === 4) {
      btnGrid.disabled = false; btnGrid.title = '';
    } else {
      btnGrid.disabled = true; btnGrid.title = 'Grid 2×2 hanya untuk 4 foto';
    }

    resetAll();
    setStatus(`Mode <strong>${state.totalShots} foto</strong> dipilih`);
  });

  el.layoutRow.addEventListener('click', e => {
    const btn = e.target.closest('[data-layout]');
    if (!btn || btn.disabled) return;
    el.layoutRow.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.layout = btn.dataset.layout;
    renderSlots();
  });

  el.filterRow.addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    el.filterRow.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeFilter = btn.dataset.filter;
    el.video.style.filter = state.activeFilter || 'none';
    el.filterLabel.textContent = btn.dataset.label.toUpperCase();
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
      if (state.activeStickers.length >= 4) return setStatus('Maksimal <strong>4 stiker</strong>');
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
    
    if (el.stripPreviewWrapper) el.stripPreviewWrapper.style.background = state.frameColor;
    
    const dark = state.frameColor === '#1a1a1a';
    el.stripFoot.querySelector('.strip-foot-brand').style.color = dark ? '#666' : '#aaa';
    el.stripFoot.querySelector('.strip-foot-date').style.color  = dark ? '#999' : '#555';
  });
}

function addLiveSticker(emoji, tx, ty) {
  const id = 'live-' + encodeURIComponent(emoji);
  if (document.getElementById(id)) return;
  const div = document.createElement('div');
  div.className = 'live-sticker'; div.id = id; div.textContent = emoji;
  div.style.left = tx + '%'; div.style.top = ty + '%';
  el.stickerOvl.appendChild(div);
}
function removeLiveSticker(emoji) { document.getElementById('live-' + encodeURIComponent(emoji))?.remove(); }

/* ============================================================
   SESI CAPTURE
   ============================================================ */
async function startSession() {
  if (!state.stream || state.isShooting) return;
  state.isShooting = true; el.btnCapture.disabled = true;
  state.captured = []; el.qrSection.style.display = 'none';
  renderSlots();

  for (let i = 0; i < state.totalShots; i++) {
    setStatus(`Bersiap foto <strong>${i + 1}</strong>...`);
    await runCountdown();
    const dataUrl = captureFrame();
    state.captured.push(dataUrl);
    fillSlot(i, dataUrl);
    updateDots();
    setStatus(`✅ Foto <strong>${i + 1}</strong> berhasil diambil`);
    if (i < state.totalShots - 1) await sleep(850);
  }

  el.btnCapture.disabled = false; state.isShooting = false;
  el.btnDl.classList.add('ready');
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
  el.countdown.textContent = n; el.countdown.classList.remove('on');
  void el.countdown.offsetWidth; el.countdown.classList.add('on');
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
  void b.offsetWidth; b.style.transition = 'opacity 0.04s'; b.style.opacity = '1';
  setTimeout(() => {
    b.style.transition = 'opacity 0.08s'; b.style.opacity = '0.2';
    setTimeout(() => {
      b.style.transition = 'opacity 0.04s'; b.style.opacity = '0.9';
      setTimeout(() => { b.style.transition = 'opacity 0.35s ease-out'; b.style.opacity = '0'; }, 60);
    }, 80);
  }, 60);
}

/* ============================================================
   IMGBB + QR
   ============================================================ */
async function uploadAndGenerateQR() {
  if (!state.captured.length) return;
  setStatus('⏳ Mengupload foto ke cloud...');
  try {
    const stripCanvas = await buildStripCanvas();
    const base64      = stripCanvas.toDataURL('image/jpeg', 0.92).split(',')[1];
    const formData    = new FormData();
    formData.append('key', IMGBB_API_KEY); formData.append('image', base64);
    formData.append('name', `snapbooth_${Date.now()}`);

    const response = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: formData });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (!json.success) throw new Error('Upload gagal');

    const imageUrl = json.data.url_viewer;
    await QRCode.toCanvas(el.qrCanvas, imageUrl, { width: 220, margin: 2, color: { dark: '#0d0d0d', light: '#ffffff' } });

    el.qrSection.style.display = 'flex';
    if (el.qrLink) el.qrLink.href = imageUrl;
    setStatus('✅ QR siap! Link permanen — scan kapanpun 📲');

  } catch (err) {
    setStatus('⚠️ Cloud gagal, pakai QR lokal...');
    try {
      const stripCanvas = await buildStripCanvas();
      const blob = await new Promise(r => stripCanvas.toBlob(r, 'image/jpeg', 0.92));
      const blobUrl = URL.createObjectURL(blob);
      await QRCode.toCanvas(el.qrCanvas, blobUrl, { width: 220, margin: 2, color: { dark: '#0d0d0d', light: '#ffffff' } });
      el.qrSection.style.display = 'flex';
      if (el.qrLink) el.qrLink.href = blobUrl;
      setStatus('📲 QR lokal dibuat (jangan tutup browser!)');
    } catch (e) {}
  }
}

/* ============================================================
   BUILD STRIP CANVAS 
   ============================================================ */
async function buildStripCanvas() {
  if (state.layout === 'grid' && state.captured.length === 4) return await buildGridCanvas();
  return await buildVerticalCanvas();
}

async function buildGridCanvas() {
  const SLOT_W = 300; 
  const SLOT_H = 400; 
  const PAD    = 45;  
  const GAP    = 18;  
  const LOGO_H = 100;
  const FOOT_H = 70;
  
  const TW = PAD + (SLOT_W + GAP) * 2 - GAP + PAD;
  const TH = LOGO_H + PAD + (SLOT_H + GAP) * 2 - GAP + PAD + FOOT_H;

  const c = document.createElement('canvas');
  c.width = TW; c.height = TH; const dc = c.getContext('2d');

  dc.fillStyle = state.frameColor; dc.fillRect(0, 0, TW, TH);

  const isDark = state.frameColor === '#1a1a1a';
  dc.textAlign = 'center'; dc.textBaseline = 'middle';
  dc.fillStyle = isDark ? '#ffffff' : '#000000';
  dc.font = 'bold 40px sans-serif';
  dc.fillText('✦ SNAPBOOTH ✦', TW / 2, LOGO_H / 2 + 10);

  for (let i = 0; i < 4; i++) {
    const col = i % 2; const row = Math.floor(i / 2);
    const x = PAD + col * (SLOT_W + GAP);
    const y = LOGO_H + PAD + row * (SLOT_H + GAP);

    dc.fillStyle = '#ffffff'; dc.fillRect(x - 6, y - 6, SLOT_W + 12, SLOT_H + 12);

    const img = await loadImage(state.captured[i]);
    const cropW = img.width; const cropH = img.width * (SLOT_H / SLOT_W);
    const cropX = 0; const cropY = (img.height - cropH) / 2;
    dc.drawImage(img, cropX, cropY, cropW, cropH, x, y, SLOT_W, SLOT_H);

    dc.save(); dc.globalAlpha = 0.25; dc.fillStyle = '#fff'; dc.font = 'bold 12px sans-serif';
    dc.textAlign = 'right'; dc.textBaseline = 'bottom';
    dc.fillText('snapbooth.app', x + SLOT_W - 8, y + SLOT_H - 8); dc.restore();
  }

  dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.font = 'bold 18px sans-serif';
  dc.fillStyle = isDark ? '#888' : 'rgba(0,0,0,0.45)';
  dc.fillText(getTodayString(), TW / 2, TH - FOOT_H / 2);

  return c;
}

async function buildVerticalCanvas() {
  const SW  = 360; 
  const SH  = 480; 
  const PAD = 45;  
  const GAP = 18;  
  const FH  = 85;  
  const TW  = SW + PAD * 2;
  const TH  = PAD + (SH + GAP) * state.captured.length - GAP + PAD + FH;

  const c = document.createElement('canvas');
  c.width = TW; c.height = TH; const dc = c.getContext('2d');

  dc.fillStyle = state.frameColor; dc.fillRect(0, 0, TW, TH);

  for (let i = 0; i < state.captured.length; i++) {
    const img = await loadImage(state.captured[i]);
    const y   = PAD + i * (SH + GAP);

    dc.fillStyle = '#ffffff'; dc.fillRect(PAD - 6, y - 6, SW + 12, SH + 12);

    const cropW = img.width; const cropH = img.width * (SH / SW);
    const cropX = 0; const cropY = (img.height - cropH) / 2;
    dc.drawImage(img, cropX, cropY, cropW, cropH, PAD, y, SW, SH);

    dc.save(); dc.globalAlpha = 0.25; dc.fillStyle = '#fff'; dc.font = 'bold 12px sans-serif';
    dc.textAlign = 'right'; dc.textBaseline = 'bottom';
    dc.fillText('snapbooth.app', PAD + SW - 8, y + SH - 8); dc.restore();
  }

  const isDark = state.frameColor === '#1a1a1a';
  dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.font = '600 14px sans-serif';
  dc.fillStyle = isDark ? '#777' : 'rgba(0,0,0,0.4)';
  dc.fillText('✦ SNAPBOOTH ✦', TW / 2, TH - FH + 30);
  dc.font = 'bold 13px sans-serif'; dc.fillStyle = isDark ? '#999' : 'rgba(0,0,0,0.5)';
  dc.fillText(getTodayString(), TW / 2, TH - FH + 54);

  return c;
}

/* ============================================================
   RENDER PREVIEW UI
   ============================================================ */
function renderSlots() {
  if (!el.strip) return;
  el.strip.innerHTML = '';
  
  if (el.stripPreviewWrapper) el.stripPreviewWrapper.style.background = state.frameColor;
  el.strip.removeAttribute('style');

  const isGrid = state.layout === 'grid' && state.totalShots === 4;
  if (isGrid) {
    el.stripPreviewWrapper.className = 'strip-preview-wrapper layout-grid';
    el.strip.style.display = 'grid'; el.strip.style.gridTemplateColumns = '1fr 1fr';
  } else {
    el.stripPreviewWrapper.className = 'strip-preview-wrapper layout-vertical';
    el.strip.style.display = 'flex'; el.strip.style.flexDirection = 'column';
  }

  for (let i = 0; i < state.totalShots; i++) {
    const slot = document.createElement('div');
    slot.className = 'strip-slot'; slot.id = `slot-${i}`;
    slot.innerHTML = `<span class="empty">FOTO ${i + 1}</span>`;
    el.strip.appendChild(slot);
  }
  updateDots(); if (el.btnDl) el.btnDl.classList.remove('ready');
}

function fillSlot(i, dataUrl) {
  const slot = document.getElementById(`slot-${i}`); if (!slot) return;
  slot.innerHTML = ''; const img = document.createElement('img');
  img.src = dataUrl; slot.appendChild(img);
}

function updateDots() {
  if (!el.shotDots) return; el.shotDots.innerHTML = '';
  for (let i = 0; i < state.totalShots; i++) {
    const d = document.createElement('div');
    d.className = 'dot' + (i < state.captured.length ? ' done' : '');
    el.shotDots.appendChild(d);
  }
}

async function downloadStrip() {
  if (!state.captured.length) return;
  setStatus('⏳ Menyiapkan file...');
  try {
    const dlc = await buildStripCanvas(); const a = document.createElement('a');
    a.href = dlc.toDataURL('image/jpeg', 0.93); a.download = `snapbooth_${Date.now()}.jpg`;
    a.click(); setStatus('✅ Strip berhasil didownload!');
  } catch (err) { setStatus('⚠️ Gagal download: ' + err.message); }
}

function resetAll() {
  if (state.isShooting) return;
  state.captured = []; state.activeStickers = [];
  if (el.stickerOvl) el.stickerOvl.innerHTML = '';
  el.stickerRow?.querySelectorAll('.stk-btn').forEach(b => b.classList.remove('active'));
  el.qrSection.style.display = 'none'; renderSlots();
  if (el.btnDl) el.btnDl.classList.remove('ready');
  setStatus('Reset — siap ambil foto baru');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function loadImage(src) {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src; });
}
function setStatus(html) { if (el.status) el.status.innerHTML = html; }
function setStripDate()  { if (el.stripDate) el.stripDate.textContent = new Date().toLocaleDateString('id-ID', {day: '2-digit', month: 'short', year: 'numeric'}); }
function getTodayString() { return new Date().toLocaleDateString('id-ID', {day: '2-digit', month: 'short', year: 'numeric'}); }
