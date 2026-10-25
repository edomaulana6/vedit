/* =========================================================================
 * js/audio.js
 * Utilitas audio untuk editor video di browser (ES module, tanpa dependensi).
 *
 * Isi:
 *   decodeAudio(file)                         -> AudioBuffer
 *   detectBeats(audioBuffer)                  -> { bpm, beats, energyEnvelope }
 *   beatsToCuts(beats, totalDuration, minGap) -> number[] (detik)
 *   getBeatValue(beats, t, decay)             -> 0..1
 *   drawWaveform(canvas, audioBuffer)         -> void
 * ========================================================================= */

/* ------------------------------------------------------------------------
 * Konstanta analisis
 * ---------------------------------------------------------------------- */

const FRAME_SIZE = 1024;   // ukuran jendela FFT (harus pangkat 2)
const HOP_SIZE = 512;      // lompatan antar jendela
const MIN_BPM = 60;
const MAX_BPM = 200;

/* ------------------------------------------------------------------------
 * Decode audio
 * ---------------------------------------------------------------------- */

/**
 * Decode file audio/video menjadi AudioBuffer.
 * @param {File|Blob} file berkas audio atau video
 * @returns {Promise<AudioBuffer>}
 */
export async function decodeAudio(file) {
  if (!file) throw new Error('File audio tidak diberikan');
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('Browser tidak mendukung Web Audio API');
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new Ctx();
  try {
    // Bentuk promise & callback dipakai agar kompatibel dengan Safari lama.
    return await new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
  } catch (err) {
    throw new Error('Gagal membaca audio: ' + (err && err.message ? err.message : err));
  } finally {
    if (ctx.close) ctx.close().catch(() => {});
  }
}

/* ------------------------------------------------------------------------
 * Helper internal
 * ---------------------------------------------------------------------- */

/** Ubah ke mono dengan merata-ratakan semua kanal. */
function toMono(buf) {
  const n = buf.length;
  const out = new Float32Array(n);
  const ch = buf.numberOfChannels;
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / ch;
  }
  return out;
}

/** FFT radix-2 in-place (re, im panjang pangkat 2). */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Rata-rata bergerak (jendela setengah-lebar w di kiri & kanan). */
function movingAverage(arr, w) {
  const n = arr.length;
  const out = new Float32Array(n);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + arr[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w);
    const b = Math.min(n, i + w + 1);
    out[i] = (prefix[b] - prefix[a]) / (b - a);
  }
  return out;
}

/** Median dari array (salinan diurutkan). */
function median(arr) {
  if (!arr.length) return 0;
  const s = Array.from(arr).sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Hitung kurva onset (spectral flux) dan envelope energi per frame.
 * @returns {{flux:Float32Array, energy:Float32Array, frameRate:number}}
 */
function computeOnsetCurves(samples, sampleRate) {
  const frames = Math.max(0, Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1);
  const flux = new Float32Array(frames);
  const energy = new Float32Array(frames);
  const win = new Float32Array(FRAME_SIZE);
  for (let i = 0; i < FRAME_SIZE; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME_SIZE - 1)); // Hann
  }
  const bins = FRAME_SIZE / 2;
  const re = new Float32Array(FRAME_SIZE);
  const im = new Float32Array(FRAME_SIZE);
  let prev = new Float32Array(bins);
  let cur = new Float32Array(bins);

  // Batasi pita frekuensi (sekitar 30 Hz - 8 kHz) agar fokus pada ritme.
  const binHz = sampleRate / FRAME_SIZE;
  const lo = Math.max(1, Math.floor(30 / binHz));
  const hi = Math.min(bins - 1, Math.ceil(8000 / binHz));

  for (let f = 0; f < frames; f++) {
    const off = f * HOP_SIZE;
    let e = 0;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const s = samples[off + i];
      re[i] = s * win[i];
      im[i] = 0;
      e += s * s;
    }
    energy[f] = Math.sqrt(e / FRAME_SIZE);
    fft(re, im);
    let sum = 0;
    for (let k = lo; k <= hi; k++) {
      // Kompresi logaritmik supaya bass tidak mendominasi sepenuhnya.
      const mag = Math.log1p(10 * Math.hypot(re[k], im[k]));
      cur[k] = mag;
      const d = mag - prev[k];
      if (d > 0) sum += d; // hanya kenaikan (half-wave rectified)
    }
    flux[f] = sum;
    const t = prev; prev = cur; cur = t;
  }
  return { flux, energy, frameRate: sampleRate / HOP_SIZE };
}

/** Pilih puncak onset dengan adaptive threshold (median + k * rata-rata lokal). */
function pickPeaks(flux, frameRate) {
  const n = flux.length;
  if (!n) return [];
  const w = Math.max(3, Math.round(frameRate * 0.4));
  const localMean = movingAverage(flux, w);
  const med = median(flux);
  const minDist = Math.max(1, Math.round(frameRate * 0.2)); // minimal 0,2 dtk antar puncak
  const peaks = [];
  for (let i = 1; i < n - 1; i++) {
    const thr = localMean[i] * 1.35 + med * 0.25 + 1e-4;
    if (flux[i] > thr && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1]) {
      const last = peaks.length ? peaks[peaks.length - 1] : null;
      if (last && i - last.i < minDist) {
        if (flux[i] > last.v) { last.i = i; last.v = flux[i]; }
      } else {
        peaks.push({ i, v: flux[i] });
      }
    }
  }
  return peaks;
}

/** Estimasi BPM lewat autokorelasi kurva onset. */
function estimateBpm(flux, frameRate) {
  const n = flux.length;
  if (n < frameRate * 3) return 0;
  const mean = flux.reduce((a, b) => a + b, 0) / n;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.max(0, flux[i] - mean);

  const lagMin = Math.max(1, Math.floor((60 / MAX_BPM) * frameRate));
  const lagMax = Math.min(n - 1, Math.ceil((60 / MIN_BPM) * frameRate));
  const ac = new Float32Array(lagMax + 2);
  for (let lag = lagMin; lag <= lagMax + 1 && lag < n; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += x[i] * x[i - lag];
    ac[lag] = s / (n - lag);
  }

  // Beri bobot ringan pada tempo yang umum (sekitar 120 BPM) untuk mengurangi
  // kesalahan oktaf (setengah / dua kali tempo).
  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const bpm = (60 * frameRate) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    const score = ac[lag] * (0.6 + 0.4 * prior);
    if (score > bestScore && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (!bestLag) return 0;

  // Interpolasi parabola untuk presisi sub-frame.
  const a = ac[bestLag - 1] || 0;
  const b = ac[bestLag];
  const c = ac[bestLag + 1] || 0;
  const den = a - 2 * b + c;
  const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
  const lag = bestLag + Math.max(-0.5, Math.min(0.5, shift));
  let bpm = (60 * frameRate) / lag;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return bpm;
}

/**
 * Selaraskan beat ke grid tempo: cari fase terbaik lalu tarik onset
 * ke posisi grid terdekat; slot grid tanpa onset tetap diisi.
 */
function alignToGrid(peaks, bpm, frameRate, duration) {
  const period = 60 / bpm;
  const times = peaks.map((p) => (p.i * HOP_SIZE) / (frameRate * HOP_SIZE) );
  if (!times.length) return [];

  // Cari fase grid yang paling cocok dengan onset (berbobot kekuatan).
  const steps = 48;
  let bestPhase = 0;
  let bestScore = -Infinity;
  for (let s = 0; s < steps; s++) {
    const phase = (s / steps) * period;
    let score = 0;
    for (let k = 0; k < times.length; k++) {
      const d = ((times[k] - phase) % period + period) % period;
      const dist = Math.min(d, period - d) / period; // 0..0.5
      score += peaks[k].v * Math.cos(dist * 2 * Math.PI);
    }
    if (score > bestScore) { bestScore = score; bestPhase = phase; }
  }

  const tol = period * 0.18;
  const beats = [];
  for (let t = bestPhase; t < duration; t += period) {
    // Geser sedikit ke onset terdekat bila masih dalam toleransi.
    let snap = t;
    let bestD = tol;
    for (let k = 0; k < times.length; k++) {
      const d = Math.abs(times[k] - t);
      if (d < bestD) { bestD = d; snap = times[k]; }
    }
    beats.push(Math.max(0, snap));
  }
  return beats;
}

/* ------------------------------------------------------------------------
 * Deteksi beat
 * ---------------------------------------------------------------------- */

/**
 * Deteksi beat dan tempo dari AudioBuffer.
 * @param {AudioBuffer} audioBuffer
 * @returns {{bpm:number, beats:number[], energyEnvelope:Float32Array}}
 *   energyEnvelope dinormalisasi 0..1 (satu nilai per frame ~ sampleRate/512 per detik).
 */
export function detectBeats(audioBuffer) {
  if (!audioBuffer) return { bpm: 0, beats: [], energyEnvelope: new Float32Array(0) };
  const sr = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const mono = toMono(audioBuffer);
  const { flux, energy, frameRate } = computeOnsetCurves(mono, sr);

  // Normalisasi envelope energi 0..1.
  let maxE = 0;
  for (let i = 0; i < energy.length; i++) if (energy[i] > maxE) maxE = energy[i];
  const envelope = new Float32Array(energy.length);
  if (maxE > 0) for (let i = 0; i < energy.length; i++) envelope[i] = energy[i] / maxE;

  const peaks = pickPeaks(flux, frameRate);
  const bpm = estimateBpm(flux, frameRate);

  let beats;
  if (bpm > 0 && peaks.length >= 4) {
    beats = alignToGrid(peaks, bpm, frameRate, duration);
  } else {
    // Cadangan: pakai onset mentah bila tempo tidak bisa diperkirakan.
    beats = peaks.map((p) => (p.i * HOP_SIZE) / sr);
  }
  beats = beats.filter((t) => t >= 0 && t <= duration).sort((a, b) => a - b);
  return { bpm: Math.round(bpm * 10) / 10, beats, energyEnvelope: envelope };
}

/* ------------------------------------------------------------------------
 * Beat -> titik potong
 * ---------------------------------------------------------------------- */

/**
 * Ubah daftar beat menjadi waktu potong dengan jarak minimum.
 * @param {number[]} beats waktu beat (detik)
 * @param {number} totalDuration durasi total (detik)
 * @param {number} [minGap=0.4] jarak minimum antar potongan (detik)
 * @returns {number[]} waktu potong, selalu diawali 0
 */
export function beatsToCuts(beats, totalDuration, minGap = 0.4) {
  const gap = Math.max(0.05, Number(minGap) || 0.4);
  const total = Number.isFinite(totalDuration) ? totalDuration : Infinity;
  const cuts = [0];
  let last = 0;
  const sorted = (beats || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
  for (const t of sorted) {
    if (t <= 0 || t >= total) continue;
    if (t - last >= gap && (total - t >= gap * 0.5)) {
      cuts.push(t);
      last = t;
    }
  }
  return cuts;
}

/* ------------------------------------------------------------------------
 * Nilai beat untuk animasi
 * ---------------------------------------------------------------------- */

/**
 * Nilai 0..1 yang melonjak ke 1 tepat di beat lalu meluruh eksponensial.
 * @param {number[]} beats daftar beat terurut (detik)
 * @param {number} t waktu saat ini (detik)
 * @param {number} [decay=0.25] konstanta waktu peluruhan (detik)
 */
export function getBeatValue(beats, t, decay = 0.25) {
  if (!beats || !beats.length || !Number.isFinite(t)) return 0;
  // Pencarian biner: beat terakhir yang <= t.
  let lo = 0;
  let hi = beats.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  if (idx < 0) return 0;
  const dt = t - beats[idx];
  const d = Math.max(0.01, decay);
  return Math.min(1, Math.max(0, Math.exp(-dt / d)));
}

/* ------------------------------------------------------------------------
 * Gambar waveform
 * ---------------------------------------------------------------------- */

/**
 * Gambar waveform ke kanvas (puncak min/maks per kolom piksel).
 * @param {HTMLCanvasElement} canvas
 * @param {AudioBuffer} audioBuffer
 */
export function drawWaveform(canvas, audioBuffer) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!audioBuffer || !W || !H) return;

  const data = audioBuffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / W));
  const mid = H / 2;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#7cf2ff');
  grad.addColorStop(1, '#a77bff');
  ctx.fillStyle = grad;

  for (let x = 0; x < W; x++) {
    const start = x * step;
    let min = 1;
    let max = -1;
    const end = Math.min(data.length, start + step);
    // Sampling jarang agar tetap ringan pada audio panjang.
    const inc = Math.max(1, Math.floor(step / 64));
    for (let i = start; i < end; i += inc) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min > max) { min = 0; max = 0; }
    const y1 = mid + min * mid * 0.95;
    const y2 = mid + max * mid * 0.95;
    ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }
}

export default { decodeAudio, detectBeats, beatsToCuts, getBeatValue, drawWaveform };
