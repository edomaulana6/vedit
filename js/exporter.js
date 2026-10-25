/* =========================================================================
 * js/exporter.js
 * Ekspor video di browser (ES module, tanpa dependensi statis).
 *
 * Alur:
 *   1. Render real-time ke canvas.captureStream() + MediaRecorder.
 *   2. Audio (AudioBuffer) diputar lewat AudioContext -> MediaStreamDestination
 *      dan digabung ke stream video.
 *   3. mimeType dipilih dari yang didukung (MP4 native bila ada, jika tidak WebM).
 *   4. Bila diminta 'mp4' tetapi browser hanya bisa WebM, ffmpeg.wasm dimuat
 *      secara lazy dari CDN untuk transkode WebM -> MP4. Jika gagal, hasil
 *      WebM dikembalikan sebagai fallback aman (blob.fallback = true).
 * ========================================================================= */

/** Daftar resolusi (sisi pendek video). */
export const RESOLUTIONS = [
  { id: '480p', label: '480p', short: 480 },
  { id: '720p', label: '720p HD', short: 720 },
  { id: '1080p', label: '1080p Full HD', short: 1080 },
];

const RATIOS = { '9:16': [9, 16], '1:1': [1, 1], '16:9': [16, 9] };

/** Ukuran piksel (genap) untuk resolusi & rasio tertentu. */
export function sizeFor(resolusi, rasio = '9:16') {
  const id = typeof resolusi === 'string' ? resolusi : resolusi && resolusi.id;
  const res = RESOLUTIONS.find((r) => r.id === id) || RESOLUTIONS[1];
  const [rw, rh] = RATIOS[rasio] || RATIOS['9:16'];
  const short = res.short;
  let width, height;
  if (rw <= rh) { // potret atau persegi: sisi pendek = lebar
    width = short;
    height = Math.round((short * rh) / rw);
  } else {        // lanskap: sisi pendek = tinggi
    height = short;
    width = Math.round((short * rw) / rh);
  }
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(width), height: even(height) };
}

const MP4_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
];
const WEBM_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function pickMime(list) {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  for (const m of list) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* lanjut */ }
  }
  return null;
}

/** Format yang bisa dihasilkan browser ini. */
export function supportedFormats() {
  const recorder = typeof MediaRecorder !== 'undefined';
  const mp4Native = recorder && !!pickMime(MP4_CANDIDATES);
  const webm = recorder && !!pickMime(WEBM_CANDIDATES);
  const wasm = typeof WebAssembly !== 'undefined';
  return {
    webm,
    mp4Native,
    // MP4 tetap bisa lewat ffmpeg.wasm bila WebM tersedia dan WebAssembly ada
    mp4: mp4Native || (webm && wasm),
    mp4ViaWasm: !mp4Native && webm && wasm,
    recorder,
  };
}

function abortError() {
  const e = new Error('Ekspor dibatalkan.');
  e.name = 'AbortError';
  return e;
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/* ------------------------------------------------------------------------
 * ffmpeg.wasm (lazy)
 * ---------------------------------------------------------------------- */

let ffmpegPromise = null;
const FFMPEG_ESM = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
const FFMPEG_UTIL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js';
const FFMPEG_CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';

async function loadFFmpeg(onLog) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      try {
        const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
          import(/* @vite-ignore */ FFMPEG_ESM),
          import(/* @vite-ignore */ FFMPEG_UTIL),
        ]);
        const ff = new FFmpeg();
        if (onLog) ff.on('log', ({ message }) => onLog(message));
        await ff.load({
          coreURL: await toBlobURL(FFMPEG_CORE + '/ffmpeg-core.js', 'text/javascript'),
          wasmURL: await toBlobURL(FFMPEG_CORE + '/ffmpeg-core.wasm', 'application/wasm'),
        });
        return ff;
      } catch (err) {
        ffmpegPromise = null; // izinkan coba lagi
        throw new Error('Gagal memuat ffmpeg.wasm (cek koneksi internet): ' + (err && err.message ? err.message : err));
      }
    })();
  }
  return ffmpegPromise;
}

async function transcodeToMp4(webmBlob, onProgress, signal) {
  const ff = await loadFFmpeg();
  if (signal && signal.aborted) throw abortError();
  const handler = ({ progress }) => {
    if (onProgress && Number.isFinite(progress)) onProgress(Math.min(1, Math.max(0, progress)));
  };
  ff.on('progress', handler);
  const onAbort = () => { try { ff.terminate(); } catch (e) { /* abaikan */ } ffmpegPromise = null; };
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  try {
    const data = new Uint8Array(await webmBlob.arrayBuffer());
    await ff.writeFile('in.webm', data);
    const code = await ff.exec([
      '-i', 'in.webm',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      'out.mp4',
    ]);
    if (signal && signal.aborted) throw abortError();
    if (code !== 0) throw new Error('ffmpeg mengembalikan kode ' + code);
    const out = await ff.readFile('out.mp4');
    try { await ff.deleteFile('in.webm'); await ff.deleteFile('out.mp4'); } catch (e) { /* abaikan */ }
    return new Blob([out.buffer], { type: 'video/mp4' });
  } catch (err) {
    if (signal && signal.aborted) throw abortError();
    throw err;
  } finally {
    ff.off('progress', handler);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/* ------------------------------------------------------------------------
 * Ekspor utama
 * ---------------------------------------------------------------------- */

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas kanvas yang digambar oleh renderFrame
 * @param {(t:number)=>void|Promise<void>} o.renderFrame menggambar frame pada waktu t (detik)
 * @param {number} o.duration durasi (detik)
 * @param {number} [o.fps=30]
 * @param {number} [o.width] @param {number} [o.height]
 * @param {AudioBuffer} [o.audioBuffer]
 * @param {number} [o.audioOffset=0] detik offset mulai audio (negatif = tunda audio)
 * @param {'webm'|'mp4'} [o.format='webm']
 * @param {number} [o.bitrate] bit per detik video
 * @param {(p:number, tahap?:string)=>void} [o.onProgress] p 0..1
 * @param {AbortSignal} [o.signal]
 * @returns {Promise<Blob>}
 */
export async function exportVideo({
  canvas, renderFrame, duration, fps = 30, width, height,
  audioBuffer, audioOffset = 0, format = 'webm', bitrate, onProgress, signal,
} = {}) {
  if (!canvas || typeof canvas.captureStream !== 'function') {
    throw new Error('Kanvas tidak valid atau browser tidak mendukung captureStream.');
  }
  if (typeof renderFrame !== 'function') throw new Error('renderFrame harus berupa fungsi.');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Durasi ekspor tidak valid.');
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Browser ini tidak mendukung MediaRecorder. Coba Chrome, Edge, atau Safari terbaru.');
  }
  if (signal && signal.aborted) throw abortError();

  const report = (p, tahap) => { if (onProgress) { try { onProgress(Math.min(1, Math.max(0, p)), tahap); } catch (e) { /* abaikan */ } } };

  if (width && height && (canvas.width !== width || canvas.height !== height)) {
    canvas.width = width;
    canvas.height = height;
  }
  fps = Math.min(60, Math.max(1, Math.round(fps) || 30));

  // --- Pilih mimeType ---
  const wantMp4 = format === 'mp4';
  let mime = null;
  let nativeMp4 = false;
  if (wantMp4) {
    mime = pickMime(MP4_CANDIDATES);
    nativeMp4 = !!mime;
  }
  if (!mime) mime = pickMime(WEBM_CANDIDATES);
  if (!mime) throw new Error('Browser tidak mendukung perekaman video (MP4/WebM).');
  const needTranscode = wantMp4 && !nativeMp4;
  if (needTranscode && typeof WebAssembly === 'undefined') {
    throw new Error('MP4 tidak didukung browser ini dan WebAssembly tidak tersedia. Pilih format WebM.');
  }

  // --- Stream video ---
  const videoStream = canvas.captureStream(fps);
  const tracks = [...videoStream.getVideoTracks()];

  // --- Audio ---
  let actx = null;
  let source = null;
  if (audioBuffer) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('Browser tidak mendukung Web Audio API.');
    actx = new Ctx();
    if (actx.state === 'suspended') { try { await actx.resume(); } catch (e) { /* abaikan */ } }
    const dest = actx.createMediaStreamDestination();
    source = actx.createBufferSource();
    source.buffer = audioBuffer;
    const gain = actx.createGain();
    // Fade-out singkat di akhir agar tidak berbunyi "klik"
    const fadeStart = Math.max(0, duration - 0.15);
    gain.gain.setValueAtTime(1, actx.currentTime + fadeStart);
    gain.gain.linearRampToValueAtTime(0, actx.currentTime + duration);
    source.connect(gain);
    gain.connect(dest);
    tracks.push(...dest.stream.getAudioTracks());
  }
  const stream = new MediaStream(tracks);

  const vbr = Math.round(bitrate || Math.max(1.5e6, (canvas.width * canvas.height * fps) * 0.1));
  let recorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: vbr,
      audioBitsPerSecond: 192000,
    });
  } catch (err) {
    cleanup();
    throw new Error('Gagal membuat MediaRecorder: ' + (err && err.message ? err.message : err));
  }

  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (e) => reject((e && e.error) || new Error('Perekaman gagal.'));
  });

  function cleanup() {
    try { tracks.forEach((t) => t.stop()); } catch (e) { /* abaikan */ }
    try { if (source) source.stop(); } catch (e) { /* belum mulai */ }
    try { if (actx && actx.state !== 'closed') actx.close(); } catch (e) { /* abaikan */ }
  }

  let aborted = false;
  const onAbort = () => { aborted = true; };
  if (signal) signal.addEventListener('abort', onAbort, { once: true });

  // Porsi progres: rekam 0..0.85 (atau 1 bila tanpa transkode)
  const recShare = needTranscode ? 0.85 : 1;

  try {
    recorder.start(250);
    // Mulai audio sinkron dengan frame pertama
    if (source) {
      const when = actx.currentTime + 0.05;
      if (audioOffset >= 0) source.start(when, Math.min(audioOffset, Math.max(0, audioBuffer.duration - 0.01)));
      else source.start(when - audioOffset);
    }

    const t0 = performance.now();
    while (true) {
      if (aborted || (signal && signal.aborted)) throw abortError();
      const t = (performance.now() - t0) / 1000;
      if (t >= duration) break;
      await renderFrame(t);
      report((t / duration) * recShare, 'Merekam');
      await nextFrame();
    }
    await renderFrame(duration); // frame terakhir
    await new Promise((r) => setTimeout(r, 120)); // beri waktu encoder
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
  } catch (err) {
    try { if (recorder.state !== 'inactive') recorder.stop(); } catch (e) { /* abaikan */ }
    cleanup();
    if (signal) signal.removeEventListener('abort', onAbort);
    throw err;
  }
  cleanup();
  if (signal) signal.removeEventListener('abort', onAbort);
  if (signal && signal.aborted) throw abortError();

  const baseType = mime.split(';')[0];
  const recorded = new Blob(chunks, { type: baseType });
  if (!recorded.size) throw new Error('Hasil ekspor kosong. Coba lagi atau turunkan resolusi.');

  if (!needTranscode) {
    report(1, 'Selesai');
    return recorded;
  }

  // --- Transkode WebM -> MP4 (ffmpeg.wasm) ---
  try {
    report(recShare, 'Memuat konverter MP4');
    const mp4 = await transcodeToMp4(
      recorded,
      (p) => report(recShare + p * (1 - recShare), 'Mengonversi ke MP4'),
      signal,
    );
    report(1, 'Selesai');
    return mp4;
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    // Fallback aman: kembalikan WebM agar kerja pengguna tidak hilang.
    console.warn('[exporter] Transkode MP4 gagal, memakai WebM:', err);
    recorded.fallback = true;
    recorded.fallbackReason = 'Konversi MP4 gagal (' + (err && err.message ? err.message : err) +
      '). Video disimpan sebagai WebM.';
    report(1, 'Selesai (WebM)');
    return recorded;
  }
}

export default { exportVideo, supportedFormats, RESOLUTIONS, sizeFor };
