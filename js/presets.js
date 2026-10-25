/* =========================================================================
 * js/presets.js
 * Pustaka preset gaya editan (ES module, tanpa dependensi).
 *
 * Skala params (sama dengan effects.js):
 *   exposure & temperature : -1..1
 *   parameter lain         : 0..1
 *   Kunci yang tidak disebut dianggap 0 (efek mati / netral).
 * ========================================================================= */

/** Kunci parameter yang dikenali renderer. */
const PARAM_KEYS = [
  'exposure', 'contrast', 'saturation', 'temperature', 'vignette', 'sharpen',
  'grain', 'blur', 'letterbox', 'rgbSplit', 'glitch', 'shake', 'zoomPunch',
  'beatFlash', 'halation', 'scanlines', 'vhs', 'crt', 'posterize', 'halftone',
  'sepia', 'mono', 'neon', 'cel', 'bloom', 'lightLeak', 'dream', 'tealOrange',
  'filmGate', 'slowPush',
];

/** Kategori preset untuk UI. */
export const CATEGORIES = [
  { id: 'beat', label: 'Jedag-Jedug & Beat' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'clean', label: 'Bersih & Sosial' },
  { id: 'soft', label: 'Aesthetic & Lembut' },
  { id: 'retro', label: 'Retro & Film' },
  { id: 'stylized', label: 'Stylized & Seni' },
  { id: 'mood', label: 'Mood & Suasana' },
  { id: 'pro', label: 'Profesional & Komersial' },
  { id: 'genre', label: 'Genre & Niche' },
  { id: 'user', label: 'Preset Saya' },
];

/** Helper pembuat preset agar ringkas. */
function P(id, label, category, moods, bpmRange, params) {
  return { id, label, category, moods, bpmRange, params };
}

export const PRESETS = [
  /* ---------------- Jedag-Jedug & Beat ---------------- */
  P('jj-classic', 'Jedag-Jedug Klasik', 'beat', ['energik', 'gelap', 'cerah'], [120, 170],
    { contrast: 0.35, saturation: 0.3, beatFlash: 0.7, shake: 0.6, zoomPunch: 0.7, rgbSplit: 0.5, glitch: 0.35, sharpen: 0.3, vignette: 0.2 }),
  P('jj-hardbass', 'Hard Bass Slam', 'beat', ['energik', 'gelap'], [130, 180],
    { contrast: 0.5, saturation: 0.2, beatFlash: 0.9, shake: 0.85, zoomPunch: 0.9, rgbSplit: 0.6, glitch: 0.2, vignette: 0.35, exposure: -0.05 }),
  P('jj-glitchcore', 'Glitchcore', 'beat', ['energik', 'gelap'], [140, 190],
    { contrast: 0.3, saturation: 0.4, beatFlash: 0.5, glitch: 0.85, rgbSplit: 0.8, shake: 0.4, scanlines: 0.2, zoomPunch: 0.4 }),
  P('jj-strobe', 'Strobe Flash', 'beat', ['energik', 'cerah'], [128, 175],
    { contrast: 0.4, saturation: 0.35, beatFlash: 1, zoomPunch: 0.5, shake: 0.3, bloom: 0.3 }),
  P('jj-phonk', 'Phonk Drift', 'beat', ['gelap', 'energik'], [130, 160],
    { contrast: 0.45, saturation: 0.15, exposure: -0.15, beatFlash: 0.55, shake: 0.55, zoomPunch: 0.6, grain: 0.35, vignette: 0.5, rgbSplit: 0.35, vhs: 0.2 }),
  P('jj-edm', 'EDM Festival', 'beat', ['energik', 'cerah'], [124, 150],
    { contrast: 0.3, saturation: 0.55, beatFlash: 0.7, zoomPunch: 0.65, bloom: 0.5, lightLeak: 0.35, rgbSplit: 0.3, shake: 0.3 }),
  P('jj-trap', 'Trap Neon Pulse', 'beat', ['gelap', 'energik'], [130, 160],
    { contrast: 0.4, saturation: 0.35, neon: 0.35, beatFlash: 0.5, zoomPunch: 0.55, rgbSplit: 0.45, bloom: 0.35, vignette: 0.4, exposure: -0.1 }),
  P('jj-zoompulse', 'Zoom Pulse Halus', 'beat', ['santai', 'energik'], [90, 130],
    { contrast: 0.2, saturation: 0.2, zoomPunch: 0.5, beatFlash: 0.2, sharpen: 0.2, bloom: 0.15 }),

  /* ---------------- Cinematic ---------------- */
  P('cin-classic', 'Cinematic Klasik', 'cinematic', ['dramatis', 'tenang'], [60, 100],
    { letterbox: 0.8, tealOrange: 0.7, grain: 0.3, halation: 0.35, slowPush: 0.6, contrast: 0.25, vignette: 0.35, saturation: 0.1 }),
  P('cin-blockbuster', 'Blockbuster', 'cinematic', ['dramatis', 'energik'], [80, 130],
    { letterbox: 0.9, tealOrange: 0.9, contrast: 0.4, grain: 0.2, halation: 0.3, bloom: 0.25, slowPush: 0.5, vignette: 0.4, sharpen: 0.2 }),
  P('cin-epic', 'Epic Trailer', 'cinematic', ['dramatis', 'gelap'], [70, 120],
    { letterbox: 0.85, tealOrange: 0.6, contrast: 0.45, exposure: -0.12, vignette: 0.5, slowPush: 0.8, grain: 0.25, bloom: 0.2, zoomPunch: 0.2, beatFlash: 0.1 }),
  P('cin-moody', 'Cinematic Moody', 'cinematic', ['gelap', 'tenang'], [55, 95],
    { letterbox: 0.7, tealOrange: 0.5, exposure: -0.2, contrast: 0.35, saturation: -0, vignette: 0.55, grain: 0.35, halation: 0.25, slowPush: 0.5, temperature: -0.15 }),
  P('cin-warm', 'Cinematic Hangat', 'cinematic', ['hangat', 'tenang'], [60, 100],
    { letterbox: 0.7, temperature: 0.35, tealOrange: 0.35, halation: 0.4, grain: 0.25, slowPush: 0.5, contrast: 0.2, vignette: 0.3, bloom: 0.15 }),
  P('cin-anamorphic', 'Anamorphic Flare', 'cinematic', ['dramatis', 'cerah'], [70, 120],
    { letterbox: 0.9, tealOrange: 0.5, bloom: 0.5, halation: 0.35, lightLeak: 0.25, sharpen: 0.2, contrast: 0.25, slowPush: 0.4, vignette: 0.25 }),
  P('cin-scifi', 'Sci-Fi Dingin', 'cinematic', ['dingin', 'gelap'], [70, 120],
    { letterbox: 0.8, temperature: -0.45, tealOrange: 0.4, contrast: 0.35, exposure: -0.1, bloom: 0.3, grain: 0.15, slowPush: 0.5, vignette: 0.4, sharpen: 0.25 }),
  P('cin-drama', 'Drama Indie', 'cinematic', ['tenang', 'hangat'], [50, 90],
    { letterbox: 0.5, filmGate: 0.4, grain: 0.35, temperature: 0.12, contrast: 0.15, vignette: 0.3, slowPush: 0.4, halation: 0.2 }),

  /* ---------------- Bersih & Sosial ---------------- */
  P('clean-vlog', 'Vlog Bersih', 'clean', ['cerah', 'santai'], [80, 130],
    { exposure: 0.08, contrast: 0.12, saturation: 0.18, sharpen: 0.25, temperature: 0.05 }),
  P('clean-bright', 'Cerah Segar', 'clean', ['cerah', 'energik'], [90, 140],
    { exposure: 0.15, contrast: 0.1, saturation: 0.3, sharpen: 0.2, bloom: 0.1 }),
  P('clean-natural', 'Natural HD', 'clean', ['santai', 'cerah'], [70, 120],
    { contrast: 0.08, saturation: 0.08, sharpen: 0.3 }),
  P('clean-creator', 'Creator Pop', 'clean', ['energik', 'cerah'], [100, 140],
    { exposure: 0.08, contrast: 0.25, saturation: 0.4, sharpen: 0.3, zoomPunch: 0.2, beatFlash: 0.1 }),
  P('clean-selfie', 'Selfie Glow', 'clean', ['cerah', 'hangat'], [80, 120],
    { exposure: 0.12, temperature: 0.12, saturation: 0.15, bloom: 0.2, dream: 0.1, sharpen: 0.1 }),
  P('clean-story', 'Daily Story', 'clean', ['santai', 'hangat'], [70, 110],
    { exposure: 0.05, temperature: 0.1, saturation: 0.15, contrast: 0.1, vignette: 0.12, grain: 0.08 }),

  /* ---------------- Aesthetic & Lembut ---------------- */
  P('soft-dreamy', 'Aesthetic Soft Dreamy', 'soft', ['tenang', 'hangat'], [60, 100],
    { exposure: 0.15, dream: 0.6, bloom: 0.4, saturation: -0, temperature: 0.1, contrast: -0, vignette: 0.15, grain: 0.1, halation: 0.2 }),
  P('soft-pastel', 'Pastel', 'soft', ['cerah', 'tenang'], [70, 110],
    { exposure: 0.2, saturation: 0.1, dream: 0.3, bloom: 0.25, temperature: 0.05, posterize: 0.05 }),
  P('soft-cloud', 'Cloud Haze', 'soft', ['tenang', 'dingin'], [55, 95],
    { exposure: 0.18, temperature: -0.15, dream: 0.5, blur: 0.04, bloom: 0.3, grain: 0.1 }),
  P('soft-peach', 'Peach Blush', 'soft', ['hangat', 'cerah'], [70, 110],
    { exposure: 0.15, temperature: 0.3, dream: 0.35, bloom: 0.3, lightLeak: 0.15, saturation: 0.1 }),
  P('soft-coquette', 'Coquette Glow', 'soft', ['hangat', 'tenang'], [65, 105],
    { exposure: 0.2, dream: 0.55, bloom: 0.4, temperature: 0.15, halation: 0.3, saturation: 0.1, grain: 0.1 }),
  P('soft-goldenhour', 'Golden Hour', 'soft', ['hangat', 'cerah'], [60, 110],
    { temperature: 0.5, exposure: 0.05, halation: 0.35, bloom: 0.3, lightLeak: 0.3, vignette: 0.2, saturation: 0.2, dream: 0.15 }),

  /* ---------------- Retro & Film ---------------- */
  P('retro-vhs', 'Retro VHS', 'retro', ['nostalgia', 'santai'], [80, 130],
    { vhs: 0.8, scanlines: 0.35, rgbSplit: 0.35, grain: 0.35, saturation: 0.2, contrast: 0.15, blur: 0.03, vignette: 0.25 }),
  P('retro-camcorder', 'Camcorder 90an', 'retro', ['nostalgia', 'santai'], [80, 130],
    { vhs: 0.55, scanlines: 0.25, grain: 0.3, saturation: 0.25, exposure: 0.05, sharpen: 0.1, vignette: 0.2, temperature: 0.1 }),
  P('retro-crt', 'CRT Monitor', 'retro', ['nostalgia', 'gelap'], [80, 140],
    { crt: 0.85, scanlines: 0.5, rgbSplit: 0.25, bloom: 0.3, vignette: 0.35, saturation: 0.2, contrast: 0.2 }),
  P('retro-8mm', 'Film 8mm', 'retro', ['nostalgia', 'hangat'], [60, 100],
    { filmGate: 0.9, grain: 0.7, sepia: 0.2, temperature: 0.25, vignette: 0.5, blur: 0.04, contrast: 0.1, lightLeak: 0.25, halation: 0.2 }),
  P('retro-16mm', 'Film 16mm', 'retro', ['nostalgia', 'tenang'], [60, 110],
    { filmGate: 0.7, grain: 0.5, temperature: 0.12, saturation: 0.1, vignette: 0.35, halation: 0.3, contrast: 0.2, sharpen: 0.1 }),
  P('retro-sepia', 'Vintage Sepia', 'retro', ['nostalgia', 'tenang'], [50, 100],
    { sepia: 0.85, grain: 0.4, vignette: 0.55, filmGate: 0.5, contrast: 0.15, blur: 0.02 }),
  P('retro-70s', 'Sinema 70an', 'retro', ['hangat', 'nostalgia'], [60, 110],
    { temperature: 0.35, saturation: 0.15, grain: 0.45, filmGate: 0.5, halation: 0.35, lightLeak: 0.3, vignette: 0.3, contrast: 0.1 }),
  P('retro-y2k', 'Y2K Digicam', 'retro', ['cerah', 'energik'], [100, 140],
    { exposure: 0.15, contrast: 0.3, saturation: 0.4, bloom: 0.35, sharpen: 0.4, grain: 0.15, lightLeak: 0.15, rgbSplit: 0.1 }),
  P('retro-lofi', 'Lo-Fi', 'retro', ['santai', 'nostalgia'], [60, 95],
    { saturation: -0, exposure: -0.05, grain: 0.5, vhs: 0.3, blur: 0.05, temperature: 0.1, vignette: 0.3, dream: 0.15, filmGate: 0.25 }),

  /* ---------------- Stylized & Seni ---------------- */
  P('sty-noir', 'B&W Noir', 'stylized', ['gelap', 'dramatis'], [50, 100],
    { mono: 1, contrast: 0.6, exposure: -0.1, grain: 0.45, vignette: 0.6, letterbox: 0.4, filmGate: 0.3 }),
  P('sty-silent', 'Hitam Putih Klasik', 'stylized', ['tenang', 'nostalgia'], [50, 90],
    { mono: 1, contrast: 0.25, grain: 0.35, filmGate: 0.8, vignette: 0.4, sepia: 0.1 }),
  P('sty-cyber', 'Cyberpunk Neon', 'stylized', ['gelap', 'energik'], [100, 150],
    { neon: 0.6, contrast: 0.4, saturation: 0.5, bloom: 0.5, rgbSplit: 0.4, scanlines: 0.2, glitch: 0.2, vignette: 0.4, exposure: -0.15, temperature: -0.2 }),
  P('sty-anime', 'Anime Cel', 'stylized', ['cerah', 'energik'], [90, 140],
    { cel: 0.8, saturation: 0.45, contrast: 0.2, bloom: 0.2, sharpen: 0.3, exposure: 0.05 }),
  P('sty-comic', 'Comic Halftone', 'stylized', ['energik', 'cerah'], [100, 150],
    { halftone: 0.7, posterize: 0.35, saturation: 0.5, contrast: 0.35, cel: 0.3, sharpen: 0.2 }),
  P('sty-vapor', 'Vaporwave', 'stylized', ['nostalgia', 'santai'], [70, 110],
    { saturation: 0.35, temperature: -0.1, dream: 0.4, bloom: 0.4, scanlines: 0.25, rgbSplit: 0.3, vhs: 0.3, lightLeak: 0.3, contrast: 0.15 }),
  P('sty-synthwave', 'Synthwave Sunset', 'stylized', ['gelap', 'nostalgia'], [90, 130],
    { saturation: 0.5, neon: 0.3, bloom: 0.5, temperature: 0.15, tealOrange: 0.4, scanlines: 0.2, vignette: 0.4, contrast: 0.3, exposure: -0.1 }),
  P('sty-popart', 'Pop Art', 'stylized', ['energik', 'cerah'], [100, 150],
    { posterize: 0.6, halftone: 0.35, saturation: 0.7, contrast: 0.45, sharpen: 0.2 }),
  P('sty-dream', 'Dreamcore', 'stylized', ['tenang', 'nostalgia'], [60, 100],
    { dream: 0.8, bloom: 0.5, blur: 0.06, exposure: 0.15, saturation: 0.15, vhs: 0.2, grain: 0.2, lightLeak: 0.2 }),

  /* ---------------- Mood & Suasana ---------------- */
  P('mood-horror', 'Horror / Dark', 'mood', ['gelap', 'dramatis'], [50, 110],
    { exposure: -0.3, contrast: 0.5, temperature: -0.3, vignette: 0.75, grain: 0.5, glitch: 0.15, shake: 0.2, rgbSplit: 0.15, saturation: -0, mono: 0.35, letterbox: 0.3 }),
  P('mood-sad', 'Melankolis', 'mood', ['tenang', 'gelap'], [50, 85],
    { exposure: -0.1, temperature: -0.3, mono: 0.35, vignette: 0.45, grain: 0.3, dream: 0.2, slowPush: 0.4 }),
  P('mood-romance', 'Romantis', 'mood', ['hangat', 'tenang'], [60, 100],
    { temperature: 0.25, dream: 0.4, bloom: 0.35, halation: 0.4, exposure: 0.08, vignette: 0.25, saturation: 0.1, slowPush: 0.3 }),
  P('mood-cold', 'Dingin Beku', 'mood', ['dingin', 'tenang'], [55, 100],
    { temperature: -0.6, exposure: 0.05, contrast: 0.2, bloom: 0.2, saturation: -0, sharpen: 0.2, vignette: 0.2 }),
  P('mood-sunset', 'Senja Oranye', 'mood', ['hangat', 'tenang'], [60, 100],
    { temperature: 0.6, tealOrange: 0.3, halation: 0.4, lightLeak: 0.25, vignette: 0.3, contrast: 0.2, saturation: 0.25, bloom: 0.2 }),
  P('mood-night', 'Malam Kota', 'mood', ['gelap', 'dingin'], [80, 130],
    { exposure: -0.15, temperature: -0.25, tealOrange: 0.5, contrast: 0.35, neon: 0.1, bloom: 0.4, halation: 0.3, vignette: 0.4, grain: 0.25 }),
  P('mood-rain', 'Hujan Syahdu', 'mood', ['tenang', 'dingin'], [50, 90],
    { exposure: -0.1, temperature: -0.3, saturation: -0, blur: 0.02, grain: 0.3, vignette: 0.4, bloom: 0.2, mono: 0.2 }),

  /* ---------------- Profesional & Komersial ---------------- */
  P('pro-luxury', 'Luxury / Fashion', 'pro', ['dramatis', 'gelap'], [70, 120],
    { contrast: 0.4, exposure: -0.08, saturation: -0, mono: 0.25, vignette: 0.4, grain: 0.15, halation: 0.25, letterbox: 0.35, sharpen: 0.2, slowPush: 0.4 }),
  P('pro-fashion', 'Editorial Fashion', 'pro', ['cerah', 'dramatis'], [90, 130],
    { contrast: 0.35, saturation: 0.1, exposure: 0.05, sharpen: 0.35, grain: 0.15, zoomPunch: 0.25, beatFlash: 0.15, rgbSplit: 0.1 }),
  P('pro-product', 'Product Showcase', 'pro', ['cerah', 'tenang'], [80, 120],
    { exposure: 0.1, contrast: 0.2, saturation: 0.2, sharpen: 0.45, bloom: 0.15, slowPush: 0.35, vignette: 0.1 }),
  P('pro-minimal', 'Minimalis', 'pro', ['tenang', 'cerah'], [60, 100],
    { exposure: 0.1, contrast: 0.12, saturation: 0.05, sharpen: 0.2 }),
  P('pro-doc', 'Dokumenter', 'pro', ['tenang', 'santai'], [60, 100],
    { contrast: 0.15, saturation: 0.05, grain: 0.2, vignette: 0.2, sharpen: 0.15, filmGate: 0.15, slowPush: 0.25 }),
  P('pro-news', 'News', 'pro', ['cerah', 'santai'], [80, 120],
    { contrast: 0.2, saturation: 0.1, sharpen: 0.4, exposure: 0.05, temperature: -0.05 }),
  P('pro-podcast', 'Podcast Clip', 'pro', ['santai', 'hangat'], [70, 110],
    { contrast: 0.2, saturation: 0.1, temperature: 0.1, vignette: 0.25, sharpen: 0.25, exposure: -0.03, zoomPunch: 0.12, grain: 0.08 }),
  P('pro-corporate', 'Corporate Clean', 'pro', ['tenang', 'cerah'], [70, 110],
    { exposure: 0.06, contrast: 0.12, saturation: 0.08, temperature: -0.06, sharpen: 0.3 }),
  P('pro-realestate', 'Properti / Interior', 'pro', ['cerah', 'hangat'], [70, 110],
    { exposure: 0.15, contrast: 0.15, saturation: 0.2, temperature: 0.08, sharpen: 0.35, slowPush: 0.3 }),

  /* ---------------- Genre & Niche ---------------- */
  P('gen-travel', 'Travel', 'genre', ['cerah', 'energik'], [90, 130],
    { exposure: 0.05, contrast: 0.25, saturation: 0.4, temperature: 0.1, sharpen: 0.3, tealOrange: 0.25, vignette: 0.15, slowPush: 0.3 }),
  P('gen-sport', 'Sport / Action', 'genre', ['energik', 'cerah'], [110, 170],
    { contrast: 0.45, saturation: 0.3, sharpen: 0.5, zoomPunch: 0.55, shake: 0.35, beatFlash: 0.35, rgbSplit: 0.2, vignette: 0.2, blur: 0 }),
  P('gen-street', 'Street / Urban', 'genre', ['gelap', 'energik'], [90, 140],
    { contrast: 0.45, saturation: -0, mono: 0.2, grain: 0.4, sharpen: 0.35, vignette: 0.35, shake: 0.2, tealOrange: 0.25 }),
  P('gen-wedding', 'Wedding', 'genre', ['hangat', 'tenang'], [60, 100],
    { exposure: 0.15, temperature: 0.15, dream: 0.4, bloom: 0.35, halation: 0.3, saturation: -0, vignette: 0.2, slowPush: 0.35 }),
  P('gen-gaming', 'Gaming Highlight', 'genre', ['energik', 'gelap'], [120, 170],
    { contrast: 0.4, saturation: 0.5, neon: 0.2, rgbSplit: 0.4, zoomPunch: 0.6, beatFlash: 0.5, shake: 0.5, glitch: 0.3, bloom: 0.3, sharpen: 0.3 }),
  P('gen-asmr', 'ASMR Lembut', 'genre', ['tenang', 'hangat'], [50, 85],
    { exposure: 0.05, temperature: 0.1, dream: 0.25, bloom: 0.2, saturation: 0.05, sharpen: 0.1, vignette: 0.2, slowPush: 0.3 }),
  P('gen-food', 'Kuliner Lezat', 'genre', ['hangat', 'cerah'], [80, 120],
    { exposure: 0.08, temperature: 0.25, saturation: 0.45, contrast: 0.25, sharpen: 0.4, bloom: 0.15, vignette: 0.15 }),
  P('gen-nature', 'Alam Hijau', 'genre', ['tenang', 'cerah'], [60, 100],
    { saturation: 0.35, contrast: 0.2, temperature: 0.05, sharpen: 0.3, halation: 0.1, slowPush: 0.4, vignette: 0.15 }),
  P('gen-car', 'Otomotif', 'genre', ['gelap', 'energik'], [100, 150],
    { contrast: 0.5, saturation: 0.15, tealOrange: 0.45, sharpen: 0.4, bloom: 0.25, vignette: 0.4, letterbox: 0.5, zoomPunch: 0.3, shake: 0.2, exposure: -0.08 }),
  P('gen-beauty', 'Beauty Close-Up', 'genre', ['cerah', 'hangat'], [70, 110],
    { exposure: 0.15, temperature: 0.08, dream: 0.2, bloom: 0.25, sharpen: 0.1, saturation: 0.1, contrast: 0.05 }),
  P('gen-kids', 'Ceria Anak', 'genre', ['cerah', 'energik'], [100, 140],
    { exposure: 0.15, saturation: 0.6, contrast: 0.15, bloom: 0.15, sharpen: 0.2 }),
];

/* ------------------------------------------------------------------------
 * Utilitas
 * ---------------------------------------------------------------------- */

/** Gabungkan params dengan nilai default 0 dan batasi rentangnya. */
export function normalizeParams(params) {
  const out = {};
  for (const k of PARAM_KEYS) {
    let v = Number(params && params[k]);
    if (!Number.isFinite(v)) v = 0;
    const lo = (k === 'exposure' || k === 'temperature') ? -1 : 0;
    out[k] = Math.min(1, Math.max(lo, v));
  }
  return out;
}

/** Cari preset (bawaan atau milik pengguna) berdasarkan id. */
export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || loadUserPresets().find((p) => p.id === id) || null;
}

/* ------------------------------------------------------------------------
 * Analisis mood klip
 * ---------------------------------------------------------------------- */

/**
 * Sampling piksel kecil dari kanvas / video / gambar.
 * @returns {{brightness:number, saturation:number, warmth:number, mood:string}}
 *   brightness 0..1, saturation 0..1, warmth -1..1
 */
export function analyzeClipMood(source) {
  const fallback = { brightness: 0.5, saturation: 0.3, warmth: 0, mood: 'santai' };
  try {
    if (!source) return fallback;
    const size = 32;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let sumL = 0, sumS = 0, sumW = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      sumL += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sumS += mx === 0 ? 0 : (mx - mn) / mx;
      sumW += r - b;
      n++;
    }
    if (!n) return fallback;
    const brightness = sumL / n;
    const saturation = sumS / n;
    const warmth = Math.max(-1, Math.min(1, (sumW / n) * 2));
    let mood;
    if (brightness < 0.28) mood = 'gelap';
    else if (warmth > 0.25) mood = 'hangat';
    else if (warmth < -0.2) mood = 'dingin';
    else if (brightness > 0.62 && saturation > 0.35) mood = 'cerah';
    else if (saturation > 0.5) mood = 'energik';
    else mood = 'santai';
    return { brightness, saturation, warmth, mood };
  } catch (err) {
    // mis. sumber lintas-origin atau belum siap
    return fallback;
  }
}

/* ------------------------------------------------------------------------
 * Pemilihan gaya otomatis
 * ---------------------------------------------------------------------- */

/**
 * Pilih preset terbaik dari mood, BPM, kecerahan, dan saturasi.
 * @returns {string} id preset
 */
export function autoStyle({ mood, bpm, brightness, saturation } = {}) {
  let best = null;
  let bestScore = -Infinity;
  for (const p of PRESETS) {
    let score = 0;
    if (mood) {
      const idx = p.moods.indexOf(mood);
      if (idx === 0) score += 3;
      else if (idx > 0) score += 1.5;
    }
    if (Number.isFinite(bpm) && bpm > 0) {
      const [lo, hi] = p.bpmRange;
      if (bpm >= lo && bpm <= hi) {
        const mid = (lo + hi) / 2;
        score += 3 - Math.abs(bpm - mid) / ((hi - lo) / 2 || 1);
      } else {
        const dist = bpm < lo ? lo - bpm : bpm - hi;
        score -= Math.min(3, dist / 20);
      }
      // BPM tinggi mendukung kategori beat
      if (bpm >= 125 && p.category === 'beat') score += 1.5;
    }
    if (Number.isFinite(brightness)) {
      const ex = p.params.exposure || 0;
      if (brightness < 0.3 && ex > 0) score += 0.8;      // klip gelap butuh terang
      if (brightness > 0.7 && ex > 0.1) score -= 1;      // klip terang jangan terlalu terang
      if (brightness > 0.6 && ex <= 0) score += 0.3;
    }
    if (Number.isFinite(saturation)) {
      const s = p.params.saturation || 0;
      if (saturation < 0.2 && s > 0.2) score += 0.8;     // klip pucat butuh warna
      if (saturation > 0.6 && s > 0.3) score -= 0.8;     // klip sudah tajam warnanya
    }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best ? best.id : 'clean-vlog';
}

/* ------------------------------------------------------------------------
 * Preset pengguna (localStorage)
 * ---------------------------------------------------------------------- */

const STORAGE_KEY = 'vedit.userPresets';

/** Ambil semua preset pengguna; mengembalikan [] jika gagal. */
export function loadUserPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((p) => p && typeof p.id === 'string' && p.params);
  } catch (err) {
    return [];
  }
}

/** Simpan preset baru. Mengembalikan objek preset, atau null jika gagal. */
export function saveUserPreset(name, params) {
  try {
    const label = String(name || '').trim().slice(0, 40) || 'Preset Saya';
    const preset = {
      id: 'user-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      label,
      category: 'user',
      moods: [],
      bpmRange: [0, 999],
      params: normalizeParams(params),
    };
    const list = loadUserPresets();
    list.push(preset);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return preset;
  } catch (err) {
    return null;
  }
}

/** Hapus preset pengguna. Mengembalikan true jika berhasil. */
export function deleteUserPreset(id) {
  try {
    const list = loadUserPresets();
    const next = list.filter((p) => p.id !== id);
    if (next.length === list.length) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch (err) {
    return false;
  }
}

export default PRESETS;
