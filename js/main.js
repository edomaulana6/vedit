/* =========================================================================
 * js/main.js
 * Logika utama VEdit: menghubungkan UI dengan mesin efek, preset, audio,
 * dan ekspor. (ES module, tanpa dependensi)
 *
 * Alur render:
 *   FxRenderer menggambar ke kanvas tersembunyi (fxCanvas, WebGL)
 *   -> teks/subtitle digambar di kanvas overlay (2D)
 *   -> keduanya dikomposit ke #previewCanvas (2D).
 *   #previewCanvas itulah yang direkam saat ekspor.
 *
 * Catatan: suara asli klip video dibisukan; hanya musik yang dipakai.
 * ========================================================================= */

import { FxRenderer, TRANSITIONS } from './effects.js';
import {
  PRESETS, CATEGORIES, autoStyle, analyzeClipMood,
  loadUserPresets, saveUserPreset, deleteUserPreset,
} from './presets.js';
import { decodeAudio, detectBeats, beatsToCuts, getBeatValue } from './audio.js';
import { exportVideo, sizeFor, supportedFormats } from './exporter.js';

/* ------------------------------------------------------------------------
 * Utilitas DOM
 * ---------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const el = {
  canvas: $('previewCanvas'), playBtn: $('playBtn'), timeLabel: $('timeLabel'),
  seek: $('seek'), mediaInput: $('addMediaInput'), audioInput: $('addAudioInput'),
  ratio: $('ratioSelect'), timeline: $('timeline'), clipList: $('clipList'),
  splitBtn: $('splitBtn'), deleteBtn: $('deleteBtn'), durationInput: $('durationInput'),
  speedInput: $('speedInput'), presetCategory: $('presetCategory'), presetGrid: $('presetGrid'),
  autoStyleBtn: $('autoStyleBtn'), savePresetBtn: $('savePresetBtn'),
  userPresetList: $('userPresetList'), transitionSelect: $('transitionSelect'),
  textInput: $('textInput'), fontSelect: $('fontSelect'), textSize: $('textSize'),
  textColor: $('textColor'), addTextBtn: $('addTextBtn'), subtitleInput: $('subtitleInput'),
  beatBtn: $('beatBtn'), bpmLabel: $('bpmLabel'), autoCutBtn: $('autoCutBtn'),
  resolution: $('resolutionSelect'), format: $('formatSelect'), exportBtn: $('exportBtn'),
  exportProgress: $('exportProgress'), status: $('statusLive'),
};

/** Kunci slider -> id elemen (#sl-xxx). */
const SLIDER_KEYS = ['exposure', 'contrast', 'saturation', 'temperature', 'vignette', 'sharpen', 'grain', 'blur'];

const MAX_CLIPS = 60;

/* ------------------------------------------------------------------------
 * State aplikasi
 * ---------------------------------------------------------------------- */

const state = {
  clips: [],            // {id, media, el, trimStart, dur, speed, start, name}
  selectedId: null,
  total: 0,             // durasi total timeline (detik)
  t: 0,                 // posisi playhead (detik)
  playing: false,
  playStartT: 0,
  playStartWall: 0,
  rafId: 0,
  renderPending: false,
  exporting: false,
  abort: null,
  look: {},             // parameter efek aktif (global untuk semua klip)
  presetId: null,
  transition: 'cut',
  texts: [],            // {id, text, font, size, color, start, end, y}
  subs: [],             // subtitle hasil parse
  audioBuffer: null,
  audioName: '',
  beats: [],
  bpm: 0,
  audioCtx: null,
  audioSource: null,
  userPresets: [],
};

let idCounter = 1;
const uid = (p) => p + (idCounter++);

/** Registri media: satu objectURL dipakai bersama oleh beberapa klip (refcount). */
// media: {url, refs, type:'video'|'image', w, h, srcDur, name}

/* ------------------------------------------------------------------------
 * Kanvas & renderer
 * ---------------------------------------------------------------------- */

const ctxMain = el.canvas.getContext('2d');
const fxCanvas = document.createElement('canvas');
const overlay = document.createElement('canvas');
const ctxOv = overlay.getContext('2d');
let fx = null;

try {
  fx = new FxRenderer(fxCanvas);
  fx.onContextChange = (s) => {
    setStatus(s === 'lost' ? 'Konteks grafis hilang sementara, menunggu pemulihan…' : 'Grafis pulih.');
    if (s === 'restored') requestRender();
  };
} catch (err) {
  console.error(err);
}

function setStatus(msg) { el.status.textContent = msg; }

function applyCanvasSize(w, h) {
  el.canvas.width = w; el.canvas.height = h;
  overlay.width = w; overlay.height = h;
  if (fx) fx.resize(w, h);
}

function previewSize() {
  return sizeFor('480p', el.ratio.value);
}

/* ------------------------------------------------------------------------
 * Layout timeline & pencarian klip
 * ---------------------------------------------------------------------- */

function layout() {
  let acc = 0;
  for (const c of state.clips) { c.start = acc; acc += c.dur; }
  state.total = acc;
}

function clipIndexAt(t) {
  const n = state.clips.length;
  if (!n) return -1;
  let idx = 0;
  for (let i = 0; i < n; i++) { if (state.clips[i].start <= t + 1e-6) idx = i; else break; }
  return idx;
}

const selectedClip = () => state.clips.find((c) => c.id === state.selectedId) || null;

function fmt(t) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

function busy() {
  if (state.exporting) { setStatus('Ekspor sedang berjalan. Tunggu selesai atau batalkan dulu.'); return true; }
  return false;
}

/* ------------------------------------------------------------------------
 * Media: memuat, membuat elemen, melepas
 * ---------------------------------------------------------------------- */

function loadVideoEl(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.playsInline = true;
    v.setAttribute('playsinline', ''); v.preload = 'auto';
    const done = () => { v.removeEventListener('loadeddata', ok); v.removeEventListener('error', bad); };
    const ok = () => { done(); resolve(v); };
    const bad = () => { done(); reject(new Error('Video tidak bisa dibaca (format tidak didukung?)')); };
    v.addEventListener('loadeddata', ok);
    v.addEventListener('error', bad);
    v.src = url;
  });
}

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Gambar tidak bisa dibaca'));
    im.src = url;
  });
}

/** Buat elemen baru untuk media yang sudah terdaftar (dipakai saat split). */
function makeElementFor(media, trimStart) {
  if (media.type === 'image') {
    const im = new Image();
    im.src = media.url;
    return im;
  }
  const v = document.createElement('video');
  v.muted = true; v.defaultMuted = true; v.playsInline = true;
  v.setAttribute('playsinline', ''); v.preload = 'auto';
  v.addEventListener('loadedmetadata', () => {
    try { v.currentTime = trimStart; } catch (e) { /* abaikan */ }
  }, { once: true });
  v.src = media.url;
  return v;
}

function releaseClip(clip) {
  const el_ = clip.el;
  if (el_ instanceof HTMLVideoElement) {
    try { el_.pause(); } catch (e) { /* abaikan */ }
    el_.removeAttribute('src');
    try { el_.load(); } catch (e) { /* abaikan */ }
  } else if (el_) {
    el_.src = '';
  }
  clip.media.refs -= 1;
  if (clip.media.refs <= 0) URL.revokeObjectURL(clip.media.url);
  clip.el = null;
}

async function addFiles(files) {
  if (busy()) return;
  const list = Array.from(files || []);
  if (!list.length) return;
  let added = 0;
  for (const file of list) {
    if (state.clips.length >= MAX_CLIPS) { setStatus('Batas ' + MAX_CLIPS + ' klip tercapai.'); break; }
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) { setStatus('File "' + file.name + '" dilewati (bukan video/gambar).'); continue; }
    setStatus('Memuat ' + file.name + '…');
    const url = URL.createObjectURL(file);
    try {
      const node = isVideo ? await loadVideoEl(url) : await loadImageEl(url);
      const media = {
        url, refs: 0, type: isVideo ? 'video' : 'image', name: file.name.replace(/\.[^.]+$/, ''),
        w: isVideo ? node.videoWidth : node.naturalWidth,
        h: isVideo ? node.videoHeight : node.naturalHeight,
        srcDur: isVideo ? (Number.isFinite(node.duration) ? node.duration : 5) : Infinity,
      };
      media.refs = 1;
      if (isVideo) { try { node.currentTime = 0; } catch (e) { /* abaikan */ } }
      const clip = {
        id: uid('c'), media, el: node, trimStart: 0, speed: 1, start: 0,
        dur: isVideo ? Math.min(media.srcDur, 8) : 3, name: media.name,
      };
      state.clips.push(clip);
      state.selectedId = clip.id;
      added++;
    } catch (err) {
      URL.revokeObjectURL(url);
      setStatus('Gagal memuat "' + file.name + '": ' + err.message);
    }
  }
  el.mediaInput.value = '';
  if (added) {
    layout(); refreshAll(); requestRender();
    setStatus(added + ' klip ditambahkan. Total durasi ' + fmt(state.total) + ' detik.');
  }
}

/* ------------------------------------------------------------------------
 * Operasi timeline
 * ---------------------------------------------------------------------- */

function maxDurFor(clip) {
  if (clip.media.type === 'image') return 600;
  return Math.max(0.2, (clip.media.srcDur - clip.trimStart) / clip.speed);
}

/** Pisahkan klip pada waktu lokal l (detik timeline). */
function splitClip(clip, l) {
  if (l < 0.1 || clip.dur - l < 0.1) return null;
  const idx = state.clips.indexOf(clip);
  const second = {
    id: uid('c'), media: clip.media, speed: clip.speed, start: 0,
    trimStart: clip.trimStart + l * clip.speed, dur: clip.dur - l, name: clip.name,
    el: null,
  };
  clip.media.refs += 1;
  second.el = makeElementFor(second.media, second.trimStart);
  clip.dur = l;
  state.clips.splice(idx + 1, 0, second);
  return second;
}

function onSplit() {
  if (busy()) return;
  if (!state.clips.length) { setStatus('Belum ada klip untuk dipotong.'); return; }
  const clip = state.clips[clipIndexAt(state.t)];
  const second = splitClip(clip, state.t - clip.start);
  if (!second) { setStatus('Posisi terlalu dekat dengan tepi klip. Geser playhead ke tengah klip.'); return; }
  state.selectedId = second.id;
  layout(); refreshAll(); requestRender();
  setStatus('Klip dipotong di ' + fmt(state.t) + ' detik.');
}

function onDelete() {
  if (busy()) return;
  const clip = selectedClip() || state.clips[clipIndexAt(state.t)];
  if (!clip) { setStatus('Tidak ada klip yang dipilih.'); return; }
  const idx = state.clips.indexOf(clip);
  state.clips.splice(idx, 1);
  releaseClip(clip);
  const next = state.clips[Math.min(idx, state.clips.length - 1)];
  state.selectedId = next ? next.id : null;
  layout();
  state.t = Math.min(state.t, state.total);
  if (!state.clips.length) pause();
  refreshAll(); requestRender();
  setStatus('Klip dihapus.');
}

function moveClip(id, dir) {
  if (busy()) return;
  const i = state.clips.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.clips.length) return;
  const [c] = state.clips.splice(i, 1);
  state.clips.splice(j, 0, c);
  layout(); refreshAll(); requestRender();
  setStatus('Klip dipindah ke urutan ' + (j + 1) + '.');
}

function selectClip(id, seek) {
  state.selectedId = id;
  const c = selectedClip();
  if (c && seek) seekTo(c.start);
  refreshAll();
}

function onDurationChange() {
  const c = selectedClip();
  if (!c || busy()) return;
  let v = parseFloat(el.durationInput.value);
  if (!Number.isFinite(v)) v = c.dur;
  c.dur = Math.min(maxDurFor(c), Math.max(0.2, v));
  layout(); state.t = Math.min(state.t, state.total);
  refreshAll(); requestRender();
  setStatus('Durasi klip ' + c.dur.toFixed(1) + ' detik.');
}

function onSpeedChange() {
  const c = selectedClip();
  if (!c || busy()) return;
  let v = parseFloat(el.speedInput.value);
  if (!Number.isFinite(v)) v = c.speed;
  c.speed = Math.min(4, Math.max(0.25, v));
  c.dur = Math.min(c.dur, maxDurFor(c));
  layout(); refreshAll(); requestRender();
  setStatus('Kecepatan klip ' + c.speed + '×.');
}

/* ------------------------------------------------------------------------
 * UI: daftar klip & timeline
 * ---------------------------------------------------------------------- */

function renderClipList() {
  el.clipList.textContent = '';
  state.clips.forEach((c, i) => {
    const li = document.createElement('li');
    if (c.id === state.selectedId) li.classList.add('selected');
    li.setAttribute('aria-selected', String(c.id === state.selectedId));

    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 'btn clip-select';
    pick.style.flex = '1'; pick.style.justifyContent = 'flex-start'; pick.style.minHeight = '40px';
    pick.textContent = (i + 1) + '. ' + c.name + ' — ' + c.dur.toFixed(1) + ' dtk';
    pick.addEventListener('click', () => selectClip(c.id, true));

    const up = document.createElement('button');
    up.type = 'button'; up.className = 'btn'; up.textContent = '↑';
    up.setAttribute('aria-label', 'Naikkan klip ' + (i + 1)); up.disabled = i === 0;
    up.addEventListener('click', () => moveClip(c.id, -1));

    const down = document.createElement('button');
    down.type = 'button'; down.className = 'btn'; down.textContent = '↓';
    down.setAttribute('aria-label', 'Turunkan klip ' + (i + 1)); down.disabled = i === state.clips.length - 1;
    down.addEventListener('click', () => moveClip(c.id, 1));

    li.append(pick, up, down);
    el.clipList.appendChild(li);
  });
  if (!state.clips.length) {
    const li = document.createElement('li');
    li.textContent = 'Belum ada klip.';
    el.clipList.appendChild(li);
  }
}

let dragId = null;

function renderTimeline() {
  const vTrack = el.timeline.querySelector('.tl-track[data-track="video"]');
  const aTrack = el.timeline.querySelector('.tl-track[data-track="audio"]');
  if (vTrack) {
    vTrack.textContent = '';
    for (const c of state.clips) {
      const b = document.createElement('div');
      b.className = 'tl-clip' + (c.id === state.selectedId ? ' selected' : '');
      b.style.width = Math.max(36, Math.round(c.dur * 50)) + 'px';
      b.textContent = c.name;
      b.title = c.name + ' (' + c.dur.toFixed(1) + ' dtk)';
      b.tabIndex = 0;
      b.setAttribute('role', 'button');
      b.draggable = true;
      b.addEventListener('click', () => selectClip(c.id, true));
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectClip(c.id, true); }
        else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); moveClip(c.id, -1); }
        else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); moveClip(c.id, 1); }
      });
      // Reorder dengan drag & drop
      b.addEventListener('dragstart', (e) => { dragId = c.id; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; });
      b.addEventListener('dragover', (e) => e.preventDefault());
      b.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragId || dragId === c.id || busy()) return;
        const from = state.clips.findIndex((x) => x.id === dragId);
        const to = state.clips.findIndex((x) => x.id === c.id);
        if (from < 0 || to < 0) return;
        const [m] = state.clips.splice(from, 1);
        state.clips.splice(to, 0, m);
        dragId = null;
        layout(); refreshAll(); requestRender();
      });
      vTrack.appendChild(b);
    }
  }
  if (aTrack) {
    aTrack.textContent = '';
    if (state.audioBuffer) {
      const b = document.createElement('div');
      b.className = 'tl-clip';
      b.style.width = Math.max(60, Math.round(state.audioBuffer.duration * 50)) + 'px';
      b.textContent = '♪ ' + (state.audioName || 'Musik');
      aTrack.appendChild(b);
    }
  }
}

function syncClipInputs() {
  const c = selectedClip();
  el.durationInput.disabled = !c;
  el.speedInput.disabled = !c;
  if (c) {
    el.durationInput.value = c.dur.toFixed(1);
    el.speedInput.value = String(c.speed);
  }
}

function refreshAll() {
  layout();
  renderClipList();
  renderTimeline();
  syncClipInputs();
  updateTransport();
}

function updateTransport() {
  el.timeLabel.textContent = fmt(state.t) + ' / ' + fmt(state.total);
  el.seek.value = state.total > 0 ? String(Math.round((state.t / state.total) * 1000)) : '0';
  el.playBtn.textContent = state.playing ? '⏸ Jeda' : '▶ Putar';
}

/* ------------------------------------------------------------------------
 * Sinkronisasi video & render satu frame
 * ---------------------------------------------------------------------- */

function syncVideos(idx, l, prevIdx, playing) {
  const cur = state.clips[idx];
  state.clips.forEach((c, i) => {
    if (!(c.el instanceof HTMLVideoElement)) return;
    if (i === idx) return;
    if (!c.el.paused) c.el.pause();
    if (i === prevIdx) {
      // Klip sebelumnya diam di frame terakhirnya selama transisi
      const endT = Math.min(c.media.srcDur - 0.05, c.trimStart + c.dur * c.speed);
      if (!c.el.seeking && Math.abs(c.el.currentTime - endT) > 0.15) {
        try { c.el.currentTime = Math.max(0, endT); } catch (e) { /* abaikan */ }
      }
    }
  });
  if (!cur || !(cur.el instanceof HTMLVideoElement)) return;
  const v = cur.el;
  const target = Math.min(Math.max(0, cur.media.srcDur - 0.03), cur.trimStart + l * cur.speed);
  if (playing) {
    if (v.playbackRate !== cur.speed) v.playbackRate = cur.speed;
    if (v.paused) {
      try { v.currentTime = target; } catch (e) { /* abaikan */ }
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    } else if (Math.abs(v.currentTime - target) > 0.3 && !v.seeking) {
      try { v.currentTime = target; } catch (e) { /* abaikan */ }
    }
  } else {
    if (!v.paused) v.pause();
    if (!v.seeking && Math.abs(v.currentTime - target) > 0.04) {
      try { v.currentTime = target; } catch (e) { /* abaikan */ }
    }
  }
}

/** Pecah teks menjadi baris sesuai lebar maksimum. */
function wrapLines(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawOverlay(t) {
  const W = overlay.width, H = overlay.height;
  ctxOv.clearRect(0, 0, W, H);
  const items = state.texts.concat(state.subs);
  const scale = W / 1080;
  for (const it of items) {
    if (t < it.start || t >= it.end) continue;
    const age = t - it.start;
    const pop = age < 0.18 ? 0.85 + 0.15 * (age / 0.18) : 1;
    const size = Math.max(8, it.size * scale * pop);
    ctxOv.save();
    ctxOv.font = '700 ' + size + 'px ' + it.font;
    ctxOv.textAlign = 'center';
    ctxOv.textBaseline = 'middle';
    ctxOv.lineJoin = 'round';
    ctxOv.globalAlpha = Math.min(1, age / 0.12 + 0.2);
    const lines = wrapLines(ctxOv, it.text, W * 0.88);
    const lh = size * 1.2;
    const y0 = H * it.y - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => {
      const y = y0 + i * lh;
      ctxOv.lineWidth = Math.max(2, size * 0.14);
      ctxOv.strokeStyle = 'rgba(0,0,0,0.85)';
      ctxOv.strokeText(ln, W / 2, y);
      ctxOv.fillStyle = it.color;
      ctxOv.fillText(ln, W / 2, y);
    });
    ctxOv.restore();
  }
}

/** Gambar satu frame pada waktu global t. */
function drawFrame(t, playing) {
  const W = el.canvas.width, H = el.canvas.height;
  if (!state.clips.length || !fx) {
    ctxMain.fillStyle = '#000';
    ctxMain.fillRect(0, 0, W, H);
    return;
  }
  const idx = clipIndexAt(t);
  const c = state.clips[idx];
  const l = Math.min(c.dur, Math.max(0, t - c.start));

  // Transisi di awal klip (kecuali klip pertama)
  let transition = null;
  let prevIdx = -1;
  if (idx > 0 && state.transition !== 'cut') {
    const prev = state.clips[idx - 1];
    const td = Math.min(0.6, prev.dur / 2, c.dur / 2);
    if (td > 0 && l < td) {
      prevIdx = idx - 1;
      transition = {
        type: state.transition, progress: l / td,
        fromSource: prev.el, fromW: prev.media.w, fromH: prev.media.h,
      };
    }
  }

  syncVideos(idx, l, prevIdx, playing);

  const beat = state.beats.length ? getBeatValue(state.beats, t) : 0;
  fx.render({
    source: c.el, srcW: c.media.w, srcH: c.media.h,
    params: state.look, time: l, beat, transition,
  });

  drawOverlay(t);
  ctxMain.drawImage(fxCanvas, 0, 0, W, H);
  ctxMain.drawImage(overlay, 0, 0, W, H);
}

function requestRender() {
  if (state.playing || state.exporting || state.renderPending) return;
  state.renderPending = true;
  requestAnimationFrame(() => {
    state.renderPending = false;
    if (state.playing || state.exporting) return;
    drawFrame(state.t, false);
  });
}

/* ------------------------------------------------------------------------
 * Pemutaran
 * ---------------------------------------------------------------------- */

function ensureAudioCtx() {
  if (!state.audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) state.audioCtx = new Ctx();
  }
  if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume().catch(() => {});
  return state.audioCtx;
}

function stopAudio() {
  if (state.audioSource) {
    try { state.audioSource.stop(); } catch (e) { /* belum mulai */ }
    try { state.audioSource.disconnect(); } catch (e) { /* abaikan */ }
    state.audioSource = null;
  }
}

function startAudio(t) {
  stopAudio();
  if (!state.audioBuffer || t >= state.audioBuffer.duration) return;
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = state.audioBuffer;
  src.connect(ctx.destination);
  src.start(0, t);
  state.audioSource = src;
}

function tick() {
  if (!state.playing) return;
  let t = state.playStartT + (performance.now() - state.playStartWall) / 1000;
  let ended = false;
  if (t >= state.total) { t = state.total; ended = true; }
  state.t = t;
  drawFrame(t, !ended);
  updateTransport();
  if (ended) { pause(); setStatus('Pemutaran selesai.'); return; }
  state.rafId = requestAnimationFrame(tick);
}

function play() {
  if (busy()) return;
  if (!state.total) { setStatus('Tambahkan video atau gambar dulu.'); return; }
  if (state.t >= state.total - 0.02) state.t = 0;
  state.playing = true;
  state.playStartT = state.t;
  state.playStartWall = performance.now();
  startAudio(state.t);
  cancelAnimationFrame(state.rafId);
  state.rafId = requestAnimationFrame(tick);
  updateTransport();
  setStatus('Memutar.');
}

function pauseVideos() {
  for (const c of state.clips) {
    if (c.el instanceof HTMLVideoElement && !c.el.paused) c.el.pause();
  }
}

function pause() {
  state.playing = false;
  cancelAnimationFrame(state.rafId);
  stopAudio();
  pauseVideos();
  updateTransport();
  requestRender();
}

function togglePlay() { if (state.playing) { pause(); setStatus('Dijeda.'); } else play(); }

function seekTo(t) {
  state.t = Math.min(state.total, Math.max(0, t));
  if (state.playing) {
    state.playStartT = state.t;
    state.playStartWall = performance.now();
    startAudio(state.t);
  } else {
    requestRender();
  }
  updateTransport();
}

/* ------------------------------------------------------------------------
 * Preset, slider, Auto Style
 * ---------------------------------------------------------------------- */

function neutralLook() {
  const o = {};
  // Jalankan lewat preset netral: semua kunci 0
  [
    'exposure', 'contrast', 'saturation', 'temperature', 'vignette', 'sharpen', 'grain', 'blur',
    'letterbox', 'rgbSplit', 'glitch', 'shake', 'zoomPunch', 'beatFlash', 'halation', 'scanlines',
    'vhs', 'crt', 'posterize', 'halftone', 'sepia', 'mono', 'neon', 'cel', 'bloom', 'lightLeak',
    'dream', 'tealOrange', 'filmGate', 'slowPush',
  ].forEach((k) => { o[k] = 0; });
  return o;
}

function syncSliders() {
  for (const k of SLIDER_KEYS) {
    const s = $('sl-' + k);
    if (s) s.value = String(state.look[k] || 0);
  }
}

function applyPreset(id, announce = true) {
  const p = PRESETS.find((x) => x.id === id) || state.userPresets.find((x) => x.id === id);
  if (!p) return;
  state.look = Object.assign(neutralLook(), p.params);
  state.presetId = p.id;
  syncSliders();
  renderPresetGrid();
  requestRender();
  if (announce) setStatus('Gaya "' + p.label + '" diterapkan.');
}

function renderPresetGrid() {
  const cat = el.presetCategory.value || 'all';
  let list;
  if (cat === 'user') list = state.userPresets;
  else if (cat === 'all') list = PRESETS.concat(state.userPresets);
  else list = PRESETS.filter((p) => p.category === cat);
  el.presetGrid.textContent = '';
  for (const p of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset-card' + (p.id === state.presetId ? ' active' : '');
    b.setAttribute('aria-pressed', String(p.id === state.presetId));
    const name = document.createElement('strong');
    name.textContent = p.label;
    const meta = document.createElement('small');
    const c = CATEGORIES.find((x) => x.id === p.category);
    meta.textContent = c ? c.label : p.category;
    b.append(name, meta);
    b.addEventListener('click', () => applyPreset(p.id));
    el.presetGrid.appendChild(b);
  }
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Belum ada preset di kategori ini.';
    el.presetGrid.appendChild(p);
  }
}

function renderUserPresets() {
  state.userPresets = loadUserPresets();
  el.userPresetList.textContent = '';
  if (!state.userPresets.length) {
    const li = document.createElement('li');
    li.textContent = 'Belum ada preset tersimpan.';
    el.userPresetList.appendChild(li);
    return;
  }
  for (const p of state.userPresets) {
    const li = document.createElement('li');
    const use = document.createElement('button');
    use.type = 'button'; use.className = 'btn'; use.style.flex = '1';
    use.style.justifyContent = 'flex-start'; use.style.minHeight = '40px';
    use.textContent = p.label;
    use.addEventListener('click', () => applyPreset(p.id));
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn'; del.textContent = '🗑';
    del.setAttribute('aria-label', 'Hapus preset ' + p.label);
    del.addEventListener('click', () => {
      if (deleteUserPreset(p.id)) {
        if (state.presetId === p.id) state.presetId = null;
        renderUserPresets(); renderPresetGrid();
        setStatus('Preset "' + p.label + '" dihapus.');
      }
    });
    li.append(use, del);
    el.userPresetList.appendChild(li);
  }
}

function onSavePreset() {
  const name = window.prompt('Nama preset:', 'Preset Saya');
  if (name === null) return;
  const saved = saveUserPreset(name, state.look);
  if (!saved) { setStatus('Gagal menyimpan preset (penyimpanan browser tidak tersedia).'); return; }
  state.presetId = saved.id;
  renderUserPresets(); renderPresetGrid();
  setStatus('Preset "' + saved.label + '" disimpan di perangkat ini.');
}

function onAutoStyle() {
  if (!state.clips.length) { setStatus('Tambahkan klip dulu supaya Auto Style bisa menganalisis.'); return; }
  const c = state.clips[clipIndexAt(state.t)];
  const info = analyzeClipMood(c.el);
  const id = autoStyle({
    mood: info.mood, bpm: state.bpm || undefined,
    brightness: info.brightness, saturation: info.saturation,
  });
  applyPreset(id, false);
  const p = PRESETS.find((x) => x.id === id);
  setStatus('Auto Style memilih "' + (p ? p.label : id) + '" (mood ' + info.mood +
    (state.bpm ? ', ' + state.bpm + ' BPM' : '') + ').');
}

/* ------------------------------------------------------------------------
 * Teks & subtitle
 * ---------------------------------------------------------------------- */

let textListEl = null;

function ensureTextList() {
  if (textListEl) return textListEl;
  textListEl = document.createElement('ul');
  textListEl.className = 'user-presets';
  textListEl.setAttribute('aria-label', 'Daftar teks');
  el.addTextBtn.insertAdjacentElement('afterend', textListEl);
  return textListEl;
}

function renderTextList() {
  const ul = ensureTextList();
  ul.textContent = '';
  for (const tx of state.texts) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = '"' + tx.text + '" (' + tx.start.toFixed(1) + '–' + tx.end.toFixed(1) + ' dtk)';
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn'; del.textContent = '🗑';
    del.setAttribute('aria-label', 'Hapus teks ' + tx.text);
    del.addEventListener('click', () => {
      state.texts = state.texts.filter((x) => x.id !== tx.id);
      renderTextList(); requestRender();
      setStatus('Teks dihapus.');
    });
    li.append(span, del);
    ul.appendChild(li);
  }
}

function onAddText() {
  const text = el.textInput.value.trim();
  if (!text) { setStatus('Ketik teks dulu.'); el.textInput.focus(); return; }
  const size = Math.min(300, Math.max(12, parseInt(el.textSize.value, 10) || 64));
  const start = state.t;
  const end = Math.max(start + 0.5, Math.min(start + 3, state.total || start + 3));
  state.texts.push({
    id: uid('t'), text, font: el.fontSelect.value, size, color: el.textColor.value,
    start, end, y: 0.4,
  });
  el.textInput.value = '';
  renderTextList();
  // Pastikan font web sudah termuat sebelum digambar
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 ' + size + 'px ' + el.fontSelect.value).then(requestRender).catch(() => {});
  }
  requestRender();
  setStatus('Teks ditambahkan pada ' + fmt(start) + ' detik.');
}

function parseSubtitles() {
  const subs = [];
  const lines = el.subtitleInput.value.split(/\r?\n/);
  let bad = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([\d.,]+)\s*-\s*([\d.,]+)\s*\|\s*(.+)$/);
    if (!m) { bad++; continue; }
    const a = parseFloat(m[1].replace(',', '.'));
    const b = parseFloat(m[2].replace(',', '.'));
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) { bad++; continue; }
    subs.push({
      id: uid('s'), text: m[3].trim(), start: a, end: b,
      font: el.fontSelect.value, size: Math.min(300, Math.max(12, parseInt(el.textSize.value, 10) || 64)),
      color: el.textColor.value, y: 0.82,
    });
  }
  state.subs = subs;
  requestRender();
  setStatus(subs.length + ' subtitle terbaca' + (bad ? ', ' + bad + ' baris dilewati (format salah).' : '.'));
}

/* ------------------------------------------------------------------------
 * Audio & beat
 * ---------------------------------------------------------------------- */

async function onAudioFile() {
  const file = el.audioInput.files && el.audioInput.files[0];
  if (!file || busy()) return;
  setStatus('Membaca musik…');
  try {
    const buf = await decodeAudio(file);
    pause();
    state.audioBuffer = buf;
    state.audioName = file.name.replace(/\.[^.]+$/, '');
    state.beats = []; state.bpm = 0;
    el.bpmLabel.textContent = '— BPM';
    renderTimeline();
    setStatus('Musik dimuat (' + fmt(buf.duration) + ' detik). Tekan "Deteksi beat".');
  } catch (err) {
    setStatus('Gagal memuat musik: ' + err.message);
  }
}

const nextPaint = () => new Promise((r) => setTimeout(r, 40));

async function runBeatDetection() {
  if (!state.audioBuffer) { setStatus('Tambahkan musik dulu.'); return false; }
  setStatus('Menganalisis beat…');
  el.beatBtn.disabled = true; el.autoCutBtn.disabled = true;
  await nextPaint();
  try {
    const res = detectBeats(state.audioBuffer);
    state.beats = res.beats || [];
    state.bpm = res.bpm || 0;
    el.bpmLabel.textContent = state.bpm ? state.bpm + ' BPM' : '— BPM';
    setStatus(state.beats.length
      ? 'Terdeteksi ' + state.beats.length + ' beat, tempo ' + state.bpm + ' BPM.'
      : 'Beat tidak terdeteksi jelas pada musik ini.');
    requestRender();
    return state.beats.length > 0;
  } catch (err) {
    setStatus('Deteksi beat gagal: ' + err.message);
    return false;
  } finally {
    el.beatBtn.disabled = false; el.autoCutBtn.disabled = false;
  }
}

async function onAutoCut() {
  if (busy()) return;
  if (!state.clips.length) { setStatus('Tambahkan video atau gambar dulu.'); return; }
  if (!state.beats.length) {
    const ok = await runBeatDetection();
    if (!ok) return;
  }
  pause();
  // Jarak minimum: setiap 2 beat pada tempo cepat, tiap beat pada tempo lambat
  const beatLen = state.bpm ? 60 / state.bpm : 0.5;
  const minGap = Math.max(0.4, state.bpm >= 120 ? beatLen * 2 : beatLen);
  const total = state.total;
  const cuts = beatsToCuts(state.beats, total, minGap).filter((x) => x > 0 && x < total);
  let made = 0;
  for (const cut of cuts) {
    if (state.clips.length >= MAX_CLIPS) break;
    layout();
    const clip = state.clips[clipIndexAt(cut - 1e-4)];
    if (!clip) continue;
    if (splitClip(clip, cut - clip.start)) made++;
  }
  layout();
  state.selectedId = state.clips.length ? state.clips[0].id : null;
  refreshAll(); requestRender();
  setStatus(made
    ? 'Potong otomatis: ' + made + ' titik potong mengikuti beat.'
    : 'Tidak ada titik potong baru (klip sudah pendek atau batas klip tercapai).');
}

/* ------------------------------------------------------------------------
 * Ekspor
 * ---------------------------------------------------------------------- */

function downloadBlob(blob, ext) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vedit-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.' + ext;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

async function onExport() {
  if (state.exporting) {
    if (state.abort) state.abort.abort();
    setStatus('Membatalkan ekspor…');
    return;
  }
  if (!state.total) { setStatus('Belum ada klip untuk diekspor.'); return; }
  pause();

  const fmts = supportedFormats();
  if (!fmts.recorder) { setStatus('Browser ini tidak mendukung perekaman video. Coba Chrome atau Edge terbaru.'); return; }
  let format = el.format.value;
  if (format === 'mp4' && !fmts.mp4) { format = 'webm'; setStatus('MP4 tidak tersedia di browser ini, memakai WebM.'); }

  const { width, height } = sizeFor(el.resolution.value, el.ratio.value);
  const previous = { w: el.canvas.width, h: el.canvas.height };
  const total = state.total;

  state.exporting = true;
  state.abort = new AbortController();
  el.exportBtn.textContent = '✖ Batalkan ekspor';
  el.exportProgress.value = 0;
  document.body.setAttribute('aria-busy', 'true');
  setStatus('Menyiapkan ekspor ' + width + '×' + height + '…');

  try {
    // Pastikan font teks sudah siap
    if (document.fonts && document.fonts.load) {
      const used = state.texts.concat(state.subs);
      await Promise.all(used.map((x) => document.fonts.load('700 ' + x.size + 'px ' + x.font).catch(() => null)));
    }
    applyCanvasSize(width, height);
    drawFrame(0, false);

    const blob = await exportVideo({
      canvas: el.canvas,
      renderFrame: (t) => drawFrame(Math.min(t, total), t < total),
      duration: total, fps: 30, width, height,
      audioBuffer: state.audioBuffer, audioOffset: 0, format,
      onProgress: (p, tahap) => {
        el.exportProgress.value = p;
        setStatus((tahap || 'Mengekspor') + '… ' + Math.round(p * 100) + '%');
      },
      signal: state.abort.signal,
    });

    const ext = /mp4/.test(blob.type) ? 'mp4' : 'webm';
    downloadBlob(blob, ext);
    setStatus(blob.fallback && blob.fallbackReason
      ? blob.fallbackReason
      : 'Ekspor selesai. File ' + ext.toUpperCase() + ' diunduh.');
  } catch (err) {
    if (err && err.name === 'AbortError') setStatus('Ekspor dibatalkan.');
    else setStatus('Ekspor gagal: ' + (err && err.message ? err.message : err));
    el.exportProgress.value = 0;
  } finally {
    state.exporting = false;
    state.abort = null;
    pauseVideos();
    el.exportBtn.textContent = '⬇ Ekspor video';
    document.body.removeAttribute('aria-busy');
    applyCanvasSize(previous.w, previous.h);
    state.t = 0;
    updateTransport();
    requestRender();
  }
}

/* ------------------------------------------------------------------------
 * Tab
 * ---------------------------------------------------------------------- */

function initTabs() {
  const tabs = $$('.tab');
  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = $(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab, false));
    tab.addEventListener('keydown', (e) => {
      let n = -1;
      if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = tabs.length - 1;
      if (n >= 0) { e.preventDefault(); select(tabs[n], true); }
    });
  });
}

/* ------------------------------------------------------------------------
 * Inisialisasi
 * ---------------------------------------------------------------------- */

function init() {
  if (!fx) setStatus('WebGL/efek tidak bisa dimulai di browser ini. Coba browser lain.');

  state.look = neutralLook();
  applyCanvasSize(previewSize().width, previewSize().height);

  // Opsi kategori preset
  el.presetCategory.textContent = '';
  const all = new Option('Semua gaya', 'all');
  el.presetCategory.appendChild(all);
  for (const c of CATEGORIES) el.presetCategory.appendChild(new Option(c.label, c.id));
  el.presetCategory.value = 'beat';

  // Pastikan opsi transisi sesuai daftar efek
  if (el.transitionSelect.options.length !== TRANSITIONS.length) {
    el.transitionSelect.textContent = '';
    for (const t of TRANSITIONS) el.transitionSelect.appendChild(new Option(t.label, t.id));
  }
  state.transition = el.transitionSelect.value;

  // Format yang tidak didukung
  const f = supportedFormats();
  if (!f.mp4) {
    const opt = Array.from(el.format.options).find((o) => o.value === 'mp4');
    if (opt) opt.disabled = true;
    el.format.value = 'webm';
  }

  renderUserPresets();
  renderPresetGrid();
  renderTextList();
  initTabs();
  syncSliders();
  refreshAll();
  requestRender();

  // --- Event ---
  el.mediaInput.addEventListener('change', () => addFiles(el.mediaInput.files));
  el.audioInput.addEventListener('change', onAudioFile);
  el.playBtn.addEventListener('click', togglePlay);
  el.seek.addEventListener('input', () => seekTo((parseInt(el.seek.value, 10) / 1000) * state.total));
  el.splitBtn.addEventListener('click', onSplit);
  el.deleteBtn.addEventListener('click', onDelete);
  el.durationInput.addEventListener('change', onDurationChange);
  el.speedInput.addEventListener('change', onSpeedChange);
  el.presetCategory.addEventListener('change', renderPresetGrid);
  el.autoStyleBtn.addEventListener('click', onAutoStyle);
  el.savePresetBtn.addEventListener('click', onSavePreset);
  el.transitionSelect.addEventListener('change', () => {
    state.transition = el.transitionSelect.value;
    const t = TRANSITIONS.find((x) => x.id === state.transition);
    setStatus('Transisi: ' + (t ? t.label : state.transition) + '.');
    requestRender();
  });
  el.ratio.addEventListener('change', () => {
    if (state.exporting) { el.ratio.value = el.ratio.dataset.prev || '9:16'; return; }
    el.ratio.dataset.prev = el.ratio.value;
    const s = previewSize();
    applyCanvasSize(s.width, s.height);
    requestRender();
    setStatus('Rasio ' + el.ratio.value + '.');
  });
  el.ratio.dataset.prev = el.ratio.value;

  for (const k of SLIDER_KEYS) {
    const s = $('sl-' + k);
    if (!s) continue;
    s.addEventListener('input', () => {
      state.look[k] = parseFloat(s.value) || 0;
      if (state.presetId) { state.presetId = null; renderPresetGrid(); }
      requestRender();
    });
  }

  el.addTextBtn.addEventListener('click', onAddText);
  el.textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onAddText(); } });
  let subTimer = 0;
  el.subtitleInput.addEventListener('input', () => {
    clearTimeout(subTimer);
    subTimer = setTimeout(parseSubtitles, 400);
  });
  if (el.subtitleInput.value.trim()) parseSubtitles();

  el.beatBtn.addEventListener('click', runBeatDetection);
  el.autoCutBtn.addEventListener('click', onAutoCut);
  el.exportBtn.addEventListener('click', onExport);

  // Spasi = putar/jeda (di luar kolom input)
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    const tag = (e.target && e.target.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tag) || (e.target && e.target.isContentEditable)) return;
    e.preventDefault();
    togglePlay();
  });

  // Hindari kehilangan hasil kerja tanpa sadar saat ekspor berjalan
  window.addEventListener('beforeunload', (e) => {
    if (state.exporting) { e.preventDefault(); e.returnValue = ''; }
  });

  // Bersihkan objectURL & resource saat halaman ditutup
  window.addEventListener('pagehide', () => {
    for (const c of state.clips.slice()) releaseClip(c);
    stopAudio();
    if (state.audioCtx && state.audioCtx.state !== 'closed') state.audioCtx.close().catch(() => {});
    if (fx && fx.dispose) fx.dispose();
  });
}

init();
