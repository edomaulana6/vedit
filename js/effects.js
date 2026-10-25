/* =========================================================================
 * js/effects.js
 * Mesin efek visual untuk editor video di browser (ES module, tanpa dependensi).
 *
 * Cara kerja:
 *   - Memakai WebGL (shader GLSL orisinal) dengan 2 tahap render:
 *       Tahap 1 : transisi antar klip  -> ditulis ke framebuffer (FBO)
 *       Tahap 2 : seluruh efek/grading -> ditulis ke kanvas
 *   - Jika WebGL tidak tersedia, otomatis pakai Canvas2D (versi sederhana).
 *   - Sumber di-"cover-fit" ke kanvas (mengisi penuh, tanpa distorsi).
 *
 * Skala parameter (params):
 *   Semua bernilai 0..1, kecuali `temperature` dan `exposure` (-1..1).
 *   Nilai 0 = netral / efek mati. Untuk `contrast` dan `saturation`,
 *   nilai 0..1 adalah TAMBAHAN kekuatan (0 = tidak berubah).
 *   Untuk menurunkan saturasi gunakan efek `mono`.
 * ========================================================================= */

/** Daftar transisi yang didukung (id dipakai di UI & preset). */
export const TRANSITIONS = [
  { id: 'cut', label: 'Cut' },
  { id: 'whip', label: 'Whip Pan' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'zoom', label: 'Zoom Blur' },
  { id: 'spin', label: 'Spin' },
  { id: 'lightleak', label: 'Light Leak' },
  { id: 'morphblur', label: 'Morph Blur' },
  { id: 'wipeLeft', label: 'Wipe Kiri' },
  { id: 'wipeRight', label: 'Wipe Kanan' },
  { id: 'wipeUp', label: 'Wipe Atas' },
  { id: 'fade', label: 'Fade' },
  { id: 'dissolve', label: 'Dissolve' },
];

/** Kunci parameter efek yang dikenali renderer. */
export const PARAM_KEYS = [
  'exposure', 'contrast', 'saturation', 'temperature', 'vignette', 'sharpen',
  'grain', 'blur', 'letterbox', 'rgbSplit', 'glitch', 'shake', 'zoomPunch',
  'beatFlash', 'halation', 'scanlines', 'vhs', 'crt', 'posterize', 'halftone',
  'sepia', 'mono', 'neon', 'cel', 'bloom', 'lightLeak', 'dream', 'tealOrange',
  'filmGate', 'slowPush',
];

/** Membuat objek parameter netral (semua 0). */
export function defaultParams() {
  const p = {};
  for (const k of PARAM_KEYS) p[k] = 0;
  return p;
}

/** Peta id transisi -> nomor untuk shader. */
const TRANSITION_INDEX = {};
TRANSITIONS.forEach((t, i) => { TRANSITION_INDEX[t.id] = i; });

/* ------------------------------------------------------------------------
 * KODE SHADER
 * ---------------------------------------------------------------------- */

const VERT_SRC = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

/* Fungsi hash/noise bersama (dibuat sendiri, berbasis fract-sin). */
const COMMON_GLSL = `
const float PI = 3.14159265;
float hash11(float n) { return fract(sin(n * 127.1 + 11.7) * 43758.5453); }
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

/* ---------------- TAHAP 1: TRANSISI ---------------- */
const FRAG_TRANSITION = PRECISION + COMMON_GLSL + `
uniform sampler2D uTo;
uniform sampler2D uFrom;
uniform vec4 uCoverTo;
uniform vec4 uCoverFrom;
uniform vec2 uRes;
uniform float uProg;
uniform float uTime;
uniform int uType;
varying vec2 vUv;

vec2 mir(vec2 q) { return 1.0 - abs(1.0 - mod(q, 2.0)); }
vec3 T(vec2 uv) { return texture2D(uTo, mir((uv - 0.5) * uCoverTo.xy + 0.5 + uCoverTo.zw)).rgb; }
vec3 F(vec2 uv) { return texture2D(uFrom, mir((uv - 0.5) * uCoverFrom.xy + 0.5 + uCoverFrom.zw)).rgb; }
float ease(float x) { return x * x * (3.0 - 2.0 * x); }
vec2 rot(vec2 uv, float a) {
  float asp = uRes.x / uRes.y;
  vec2 d = (uv - 0.5) * vec2(asp, 1.0);
  float s = sin(a); float c = cos(a);
  d = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  return d / vec2(asp, 1.0) + 0.5;
}

void main() {
  vec2 uv = vUv;
  float p = clamp(uProg, 0.0, 1.0);
  vec3 col = T(uv);

  if (uType == 0) {
    col = T(uv);                                   // cut
  } else if (uType == 1) {                         // whip pan
    float e = ease(p);
    float str = sin(p * PI);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 10; i++) {
      float o = (float(i) / 9.0 - 0.5) * str * 0.35;
      float u = uv.x + e + o;
      if (u < 1.0) acc += F(vec2(u, uv.y));
      else acc += T(vec2(u - 1.0, uv.y));
    }
    col = acc / 10.0;
  } else if (uType == 2) {                         // glitch
    float s = sin(p * PI);
    float ft = floor(uTime * 20.0);
    float row = floor(uv.y * mix(14.0, 40.0, hash11(ft)));
    float r = hash11(row + ft * 7.1);
    float off = (r - 0.5) * 0.25 * s * step(0.45, r);
    float sp = 0.02 * s;
    vec2 u = vec2(uv.x + off, uv.y);
    vec3 a = vec3(F(u + vec2(sp, 0.0)).r, F(u).g, F(u - vec2(sp, 0.0)).b);
    vec3 b = vec3(T(u + vec2(sp, 0.0)).r, T(u).g, T(u - vec2(sp, 0.0)).b);
    float sel = step(hash11(row * 1.7 + 3.0) * 0.8 + 0.1, p);
    col = mix(a, b, sel);
    col += s * 0.12 * step(0.93, hash21(vec2(row, ft)));
  } else if (uType == 3) {                         // zoom blur
    float e = ease(p);
    vec2 c = vec2(0.5);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float s = float(i) / 7.0;
      float sa = 1.0 + e * 1.5 - s * 0.25 * sin(p * PI);
      float sb = 1.0 + (1.0 - e) * 0.9 - s * 0.25 * sin(p * PI);
      vec3 a = F(c + (uv - c) / max(sa, 0.2));
      vec3 b = T(c + (uv - c) / max(sb, 0.2));
      acc += mix(a, b, smoothstep(0.45, 0.55, p));
    }
    col = acc / 8.0;
  } else if (uType == 4) {                         // spin
    float e = ease(p);
    float z = 1.0 + sin(p * PI) * 0.6;
    vec2 q = vec2(0.5) + (uv - 0.5) / z;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float da = (float(i) / 5.0 - 0.5) * sin(p * PI) * 0.35;
      vec3 a = F(rot(q, e * 1.6 + da));
      vec3 b = T(rot(q, (e - 1.0) * 1.6 + da));
      acc += mix(a, b, smoothstep(0.4, 0.6, p));
    }
    col = acc / 6.0;
  } else if (uType == 5) {                         // light leak
    vec3 base = mix(F(uv), T(uv), smoothstep(0.35, 0.65, p));
    float s = sin(p * PI);
    float cx = p * 1.4 - 0.2;
    float g = exp(-pow((uv.x - cx) * 2.4, 2.0)) * (0.6 + 0.4 * sin(uv.y * 5.0 + uTime * 2.0));
    vec3 leak = vec3(1.0, 0.5, 0.18) * g + vec3(1.0, 0.15, 0.35) * g * g * 0.6;
    col = base + leak * s * 1.3;
  } else if (uType == 6) {                         // morph blur
    float s = sin(p * PI);
    float r = s * 0.05;
    vec2 asp = vec2(uRes.y / uRes.x, 1.0);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float ang = fi * 2.39996;
      float rad = sqrt((fi + 0.5) / 12.0) * r;
      vec2 o = vec2(cos(ang), sin(ang)) * rad * asp;
      float n = vnoise(uv * 4.0 + o * 30.0 + uTime) - 0.5;
      acc += mix(F(uv + o + n * s * 0.03), T(uv + o - n * s * 0.03), ease(p));
    }
    col = acc / 12.0;
  } else if (uType == 7) {                         // wipe kiri (tepi bergerak ke kiri)
    float m = smoothstep(-0.02, 0.02, uv.x - (1.0 - p * 1.04 + 0.02));
    col = mix(F(uv), T(uv), m);
  } else if (uType == 8) {                         // wipe kanan
    float m = smoothstep(-0.02, 0.02, (p * 1.04 - 0.02) - uv.x);
    col = mix(F(uv), T(uv), m);
  } else if (uType == 9) {                         // wipe atas
    float m = smoothstep(-0.02, 0.02, (p * 1.04 - 0.02) - uv.y);
    col = mix(F(uv), T(uv), m);
  } else if (uType == 10) {                        // fade
    col = mix(F(uv), T(uv), p);
  } else if (uType == 11) {                        // dissolve (noise)
    float n = vnoise(uv * vec2(uRes.x / uRes.y, 1.0) * 12.0) * 0.6
            + vnoise(uv * vec2(uRes.x / uRes.y, 1.0) * 31.0) * 0.4;
    float t = p * 1.3 - 0.15;
    col = mix(F(uv), T(uv), smoothstep(n - 0.1, n + 0.1, t));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

/* ---------------- TAHAP 2: EFEK ---------------- */
function buildEffectFragment() {
  const decl = PARAM_KEYS.map((k) => `uniform float ${k};`).join('\n');
  return PRECISION + COMMON_GLSL + decl + `
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uBeat;
varying vec2 vUv;

vec3 S(vec2 uv) { return texture2D(uTex, clamp(uv, 0.0, 1.0)).rgb; }
float L(vec2 uv) { return luma(S(uv)); }

void main() {
  vec2 uv = vUv;
  vec2 c = vec2(0.5);
  float t = uTime;
  float beat = clamp(uBeat, 0.0, 1.0);
  vec2 asp = vec2(uRes.y / uRes.x, 1.0);
  float inside = 1.0;

  // --- Geometri: zoom punch (kena beat) + slow push (dorong lambat) ---
  float zoom = 1.0 + zoomPunch * beat * 0.14 + slowPush * (1.0 - exp(-t * 0.15)) * 0.2;
  uv = c + (uv - c) / zoom;

  // --- Shake (getar kamera, makin kuat saat beat) ---
  if (shake > 0.001) {
    float k = shake * 0.012 * (1.0 + beat * 1.5);
    float ft = floor(t * 30.0);
    uv += vec2(hash11(ft) - 0.5, hash11(ft + 17.0) - 0.5) * k;
  }

  // --- Film gate weave (goyangan halus proyektor) ---
  if (filmGate > 0.001) {
    uv += vec2(sin(t * 2.1) * 0.0006, (hash11(floor(t * 12.0)) - 0.5) * 0.0012) * filmGate;
  }

  // --- CRT: lengkung tabung ---
  if (crt > 0.001) {
    vec2 d = uv - c;
    uv = c + d * (1.0 + dot(d, d) * 0.22 * crt);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) inside = 0.0;
  }

  // --- VHS: jitter garis + tracking bar ---
  if (vhs > 0.001) {
    float line = floor(uv.y * uRes.y / 2.0);
    float j = hash11(line + floor(t * 30.0)) - 0.5;
    uv.x += j * 0.003 * vhs;
    float bar = fract(uv.y * 0.8 - t * 0.25);
    uv.x += smoothstep(0.92, 1.0, bar) * 0.015 * vhs * (0.5 + hash11(floor(t * 10.0)));
  }

  // --- Glitch: pergeseran blok horizontal ---
  if (glitch > 0.001) {
    float ft = floor(t * 18.0);
    float gate = step(1.0 - (glitch * 0.5 + beat * glitch * 0.4), hash11(ft * 3.7));
    float row = floor(uv.y * mix(8.0, 30.0, hash11(ft)));
    float r = hash11(row * 1.3 + ft);
    uv.x += gate * step(0.5, r) * (r - 0.5) * 0.2 * glitch;
  }

  // --- Dream: gelombang lembut ---
  if (dream > 0.001) {
    uv += vec2(sin(uv.y * 9.0 + t * 1.3), cos(uv.x * 7.0 + t * 1.1)) * 0.004 * dream;
  }

  // --- RGB split (chromatic aberration, menguat saat beat) ---
  float sp = rgbSplit * 0.012 * (1.0 + beat * 1.2) + glitch * 0.005 + vhs * 0.003;
  vec2 d = vec2(sp, 0.0) + (uv - c) * sp * 2.0;
  vec3 col = vec3(S(uv + d).r, S(uv).g, S(uv - d).b);

  // --- Blur (cakram 2 cincin) ---
  if (blur > 0.001) {
    vec3 acc = col;
    float r = blur * 0.03;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      acc += S(uv + vec2(cos(a), sin(a)) * r * asp);
    }
    for (int i = 0; i < 4; i++) {
      float a = float(i) * 1.570796 + 0.785398;
      acc += S(uv + vec2(cos(a), sin(a)) * r * 0.5 * asp);
    }
    col = mix(col, acc / 13.0, min(1.0, blur * 2.0));
  }

  // --- Sharpen (unsharp mask) ---
  if (sharpen > 0.001) {
    vec2 px = 1.0 / uRes;
    vec3 avg = (S(uv + vec2(px.x, 0.0)) + S(uv - vec2(px.x, 0.0))
              + S(uv + vec2(0.0, px.y)) + S(uv - vec2(0.0, px.y))) * 0.25;
    col += (col - avg) * sharpen * 2.0;
  }

  // --- Glow bersama: bloom, halation, dream ---
  if (bloom + halation + dream > 0.001) {
    vec3 avg = vec3(0.0);
    vec3 bright = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float ang = fi * 2.39996;
      float rad = sqrt((fi + 0.5) / 12.0) * 0.05;
      vec3 v = S(uv + vec2(cos(ang), sin(ang)) * rad * asp);
      avg += v;
      bright += max(v - 0.6, 0.0);
    }
    avg /= 12.0;
    bright /= 12.0;
    col += bright * bloom * 3.0;
    col += vec3(1.0, 0.38, 0.18) * dot(bright, vec3(0.3333)) * halation * 4.5;
    col = mix(col, avg, dream * 0.45);
    col += bright * dream * 2.0;
    col = mix(col, col * vec3(1.04, 0.97, 1.08) + 0.03, dream);
  }

  // --- Deteksi tepi untuk neon & cel ---
  float edge = 0.0;
  if (neon + cel > 0.001) {
    vec2 px = 1.5 / uRes;
    float gx = L(uv + vec2(px.x, 0.0)) - L(uv - vec2(px.x, 0.0));
    float gy = L(uv + vec2(0.0, px.y)) - L(uv - vec2(0.0, px.y));
    edge = length(vec2(gx, gy));
  }
  if (neon > 0.001) {
    vec3 hue = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + t * 0.15 + uv.x * 0.3));
    col = mix(col, col * 0.35, neon * 0.8);
    col += hue * smoothstep(0.03, 0.25, edge) * neon * 2.2;
  }

  // --- Color: exposure, temperature, contrast, saturation ---
  col *= exp2(exposure * 1.5);
  col.r *= 1.0 + temperature * 0.15;
  col.b *= 1.0 - temperature * 0.15;
  col.g *= 1.0 + temperature * 0.03;
  col = (col - 0.5) * (1.0 + contrast * 0.9) + 0.5;
  col = max(col, 0.0);
  float l = luma(col);
  col = mix(vec3(l), col, 1.0 + saturation);

  // --- Teal & Orange (split toning berbasis luma) ---
  if (tealOrange > 0.001) {
    float ws = 1.0 - smoothstep(0.0, 0.6, l);
    float wh = smoothstep(0.4, 1.0, l);
    col = mix(col, col * vec3(0.78, 1.0, 1.1) + vec3(0.0, 0.03, 0.06), ws * tealOrange * 0.8);
    col = mix(col, col * vec3(1.12, 1.0, 0.82) + vec3(0.04, 0.01, 0.0), wh * tealOrange * 0.8);
  }

  // --- Film gate: kurva S, hitam terangkat, debu, kedip ---
  if (filmGate > 0.001) {
    vec3 cc = clamp(col, 0.0, 1.0);
    col = mix(col, cc * cc * (3.0 - 2.0 * cc), filmGate * 0.6);
    col *= mix(vec3(1.0), vec3(1.03, 1.0, 0.96), filmGate);
    col = col * (1.0 - 0.04 * filmGate) + 0.025 * filmGate * vec3(0.9, 1.0, 1.1);
    float n = hash21(floor(uv * uRes / 3.0) + floor(t * 24.0) * 13.0);
    col -= step(0.9993, n) * 0.5 * filmGate;
    col *= 1.0 + (hash11(floor(t * 24.0)) - 0.5) * 0.04 * filmGate;
  }

  // --- Sepia & Mono ---
  if (sepia > 0.001) {
    float ls = luma(col);
    vec3 sp3 = vec3(ls * 1.07, ls * 0.89, ls * 0.66);
    col = mix(col, sp3, sepia);
  }
  if (mono > 0.001) {
    float lm = luma(col);
    lm = (lm - 0.5) * 1.1 + 0.5;
    col = mix(col, vec3(lm), mono);
  }

  // --- Cel shading: pita warna + garis tepi ---
  if (cel > 0.001) {
    float lc = luma(col);
    float q = floor(lc * 4.0 + 0.5) / 4.0;
    vec3 shaded = col * ((q + 0.02) / (lc + 0.02));
    shaded = mix(vec3(luma(shaded)), shaded, 1.25);
    shaded = mix(shaded, vec3(0.0), smoothstep(0.08, 0.2, edge));
    col = mix(col, shaded, cel);
  }

  // --- Posterize ---
  if (posterize > 0.001) {
    float lv = mix(32.0, 3.0, posterize);
    col = floor(col * lv + 0.5) / lv;
  }

  // --- Halftone (titik raster miring) ---
  if (halftone > 0.001) {
    float cell = uRes.y / mix(60.0, 110.0, halftone);
    vec2 g = gl_FragCoord.xy / cell;
    float ca = cos(0.5); float sa = sin(0.5);
    g = vec2(ca * g.x - sa * g.y, sa * g.x + ca * g.y);
    vec2 f = fract(g) - 0.5;
    float rad = sqrt(clamp(luma(col), 0.0, 1.0)) * 0.7;
    float dotv = smoothstep(rad, rad - 0.15, length(f));
    vec3 ht = col * dotv * 1.1 + 0.02;
    col = mix(col, ht, min(1.0, halftone * 1.5));
  }

  // --- Light leak (screen blend, bergerak) ---
  if (lightLeak > 0.001) {
    float pos = 0.1 + 0.8 * (0.5 + 0.5 * sin(t * 0.6));
    float g = pow(max(0.0, 1.0 - abs(vUv.x - pos) * 2.2), 2.0) * (0.6 + 0.4 * sin(vUv.y * 4.0 + t));
    vec3 leak = vec3(1.0, 0.45, 0.15) * g + vec3(1.0, 0.15, 0.35) * g * g * 0.6;
    col = 1.0 - (1.0 - clamp(col, 0.0, 1.0)) * (1.0 - leak * lightLeak * (0.7 + beat * 0.6));
  }

  // --- Beat flash ---
  col += beat * beatFlash * 0.35;

  // --- Scanlines & CRT mask ---
  if (scanlines > 0.001 || crt > 0.001) {
    float s = 0.5 + 0.5 * sin(vUv.y * uRes.y * PI);
    col *= 1.0 - (scanlines * 0.35 + crt * 0.15) * (1.0 - s);
  }
  if (crt > 0.001) {
    float m = mod(gl_FragCoord.x, 3.0);
    vec3 mask = vec3(m < 1.0 ? 1.0 : 0.7, (m >= 1.0 && m < 2.0) ? 1.0 : 0.7, m >= 2.0 ? 1.0 : 0.7);
    col *= mix(vec3(1.0), mask, crt * 0.35);
    col *= 1.0 + crt * 0.1;
  }

  // --- Vignette ---
  if (vignette > 0.001) {
    float dv = length((vUv - c) * vec2(uRes.x / uRes.y, 1.0));
    col *= 1.0 - vignette * smoothstep(0.35, 0.95, dv);
  }

  // --- Grain ---
  if (grain > 0.001) {
    float n = hash21(gl_FragCoord.xy + fract(t) * vec2(311.0, 173.0)) - 0.5;
    col += n * grain * 0.25 * (1.0 - clamp(luma(col), 0.0, 1.0) * 0.5);
  }

  // --- Letterbox sinematik ---
  if (letterbox > 0.001) {
    float bar = letterbox * 0.14;
    col *= smoothstep(bar - 0.002, bar + 0.002, vUv.y) * (1.0 - smoothstep(1.0 - bar - 0.002, 1.0 - bar + 0.002, vUv.y));
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * inside, 1.0);
}`;
}

/* ------------------------------------------------------------------------
 * UTILITAS
 * ---------------------------------------------------------------------- */

/** Hitung skala cover-fit: [skalaX, skalaY, offsetX, offsetY]. */
function coverVec(sw, sh, cw, ch) {
  if (!sw || !sh) return [1, 1, 0, 0];
  const sa = sw / sh;
  const ca = cw / ch;
  return sa > ca ? [ca / sa, 1, 0, 0] : [1, sa / ca, 0, 0];
}

/** Ukuran asli sumber (video/gambar/kanvas). */
function sourceSize(src, w, h) {
  if (w && h) return [w, h];
  if (!src) return [0, 0];
  return [
    src.videoWidth || src.naturalWidth || src.width || 0,
    src.videoHeight || src.naturalHeight || src.height || 0,
  ];
}

/** Sumber siap digambar? */
function sourceReady(src) {
  if (!src) return false;
  if (typeof HTMLVideoElement !== 'undefined' && src instanceof HTMLVideoElement) {
    return src.readyState >= 2 && src.videoWidth > 0;
  }
  if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
    return src.complete && src.naturalWidth > 0;
  }
  return true;
}

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader gagal dikompilasi: ' + log);
  }
  return sh;
}

function linkProgram(gl, vs, fs) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Program gagal di-link: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

function uniformMap(gl, prog, names) {
  const m = {};
  for (const n of names) m[n] = gl.getUniformLocation(prog, n);
  return m;
}

const EFFECT_SRC = buildEffectFragment();

/** Cek apakah WebGL dan shader bisa dipakai (di kanvas sementara). */
function probeWebGL() {
  try {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 8;
    const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
    if (!gl) return false;
    linkProgram(gl, VERT_SRC, FRAG_TRANSITION);
    linkProgram(gl, VERT_SRC, EFFECT_SRC);
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    return true;
  } catch (err) {
    console.warn('[FxRenderer] WebGL tidak bisa dipakai:', err);
    return false;
  }
}

/* ------------------------------------------------------------------------
 * KELAS UTAMA
 * ---------------------------------------------------------------------- */

export class FxRenderer {
  /**
   * @param {HTMLCanvasElement} canvas kanvas tujuan
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.mode = 'none';          // 'webgl' | '2d'
    this.contextLost = false;
    this.onContextChange = null; // callback(opsional): (status: 'lost'|'restored')
    this.width = canvas.width || 1080;
    this.height = canvas.height || 1920;
    this._gl = null;
    this._ctx = null;
    this._handlers = null;

    if (probeWebGL()) {
      try {
        this._initGL();
        this.mode = 'webgl';
      } catch (err) {
        console.warn('[FxRenderer] Inisialisasi WebGL gagal:', err);
      }
    }
    if (this.mode === 'none') {
      this._ctx = canvas.getContext('2d');
      this.mode = '2d';
    }
    this.resize(this.width, this.height);
  }

  /* ---------------- WebGL ---------------- */

  _initGL() {
    const canvas = this.canvas;
    const gl = canvas.getContext('webgl', {
      alpha: false, antialias: false, preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    }) || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL tidak tersedia');
    this._gl = gl;

    if (!this._handlers) {
      this._handlers = {
        lost: (e) => {
          e.preventDefault();            // wajib agar konteks bisa dipulihkan
          this.contextLost = true;
          if (this.onContextChange) this.onContextChange('lost');
        },
        restored: () => {
          try {
            this._buildResources();
            this.contextLost = false;
            this.resize(this.width, this.height);
            if (this.onContextChange) this.onContextChange('restored');
          } catch (err) {
            console.error('[FxRenderer] Gagal memulihkan WebGL:', err);
          }
        },
      };
      canvas.addEventListener('webglcontextlost', this._handlers.lost, false);
      canvas.addEventListener('webglcontextrestored', this._handlers.restored, false);
    }
    this._buildResources();
  }

  /** Membuat ulang semua resource GPU (dipanggil saat init & setelah konteks pulih). */
  _buildResources() {
    const gl = this._gl;
    this._progT = linkProgram(gl, VERT_SRC, FRAG_TRANSITION);
    this._progE = linkProgram(gl, VERT_SRC, EFFECT_SRC);
    this._uT = uniformMap(gl, this._progT,
      ['uTo', 'uFrom', 'uCoverTo', 'uCoverFrom', 'uRes', 'uProg', 'uTime', 'uType']);
    this._uE = uniformMap(gl, this._progE,
      ['uTex', 'uRes', 'uTime', 'uBeat'].concat(PARAM_KEYS));

    this._quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    this._texTo = this._makeTexture();
    this._texFrom = this._makeTexture();
    this._fboTex = null;
    this._fbo = null;
    this._toValid = false;
    this._fromValid = false;
  }

  _makeTexture() {
    const gl = this._gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // piksel hitam sementara supaya tekstur selalu valid
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return tex;
  }

  _makeTarget(w, h) {
    const gl = this._gl;
    if (this._fboTex) gl.deleteTexture(this._fboTex);
    if (this._fbo) gl.deleteFramebuffer(this._fbo);
    this._fboTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._fboTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this._fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._fboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _upload(tex, source) {
    const gl = this._gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      return true;
    } catch (err) {
      return false; // mis. video belum punya frame; pakai isi tekstur sebelumnya
    }
  }

  _bindQuad() {
    const gl = this._gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  /* ---------------- API publik ---------------- */

  /** Ubah ukuran kanvas (piksel). */
  resize(w, h) {
    w = Math.max(2, Math.round(w));
    h = Math.max(2, Math.round(h));
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.mode === 'webgl' && !this.contextLost) {
      this._makeTarget(w, h);
    }
  }

  /**
   * Gambar satu frame.
   * @param {object} o
   * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} o.source sumber utama
   * @param {number} o.srcW lebar asli sumber
   * @param {number} o.srcH tinggi asli sumber
   * @param {object} o.params parameter efek (lihat PARAM_KEYS)
   * @param {number} o.time waktu klip (detik)
   * @param {number} o.beat 0..1, meluruh setelah tiap beat
   * @param {{type:string,progress:number,fromSource:*,fromW:number,fromH:number}|null} o.transition
   */
  render(o) {
    if (!o) return;
    if (this.mode === 'webgl') this._renderGL(o);
    else this._render2D(o);
  }

  /** Bersihkan listener & resource. */
  dispose() {
    if (this._handlers) {
      this.canvas.removeEventListener('webglcontextlost', this._handlers.lost, false);
      this.canvas.removeEventListener('webglcontextrestored', this._handlers.restored, false);
      this._handlers = null;
    }
    const gl = this._gl;
    if (gl && !this.contextLost) {
      gl.deleteTexture(this._texTo);
      gl.deleteTexture(this._texFrom);
      if (this._fboTex) gl.deleteTexture(this._fboTex);
      if (this._fbo) gl.deleteFramebuffer(this._fbo);
      gl.deleteBuffer(this._quad);
      gl.deleteProgram(this._progT);
      gl.deleteProgram(this._progE);
    }
  }

  /* ---------------- Render WebGL ---------------- */

  _renderGL(o) {
    const gl = this._gl;
    if (!gl || this.contextLost || gl.isContextLost()) return; // tunggu pemulihan konteks

    const W = this.width;
    const H = this.height;
    const params = o.params || {};
    const time = o.time || 0;
    const beat = Math.min(1, Math.max(0, o.beat || 0));

    // --- Unggah tekstur ---
    if (sourceReady(o.source) && this._upload(this._texTo, o.source)) this._toValid = true;
    const tr = o.transition || null;
    const trIdx = tr ? (TRANSITION_INDEX[tr.type] ?? 0) : 0;
    const useFrom = !!(tr && trIdx !== 0 && tr.fromSource);
    if (useFrom && sourceReady(tr.fromSource)) {
      if (this._upload(this._texFrom, tr.fromSource)) this._fromValid = true;
    }

    const [tw, th] = sourceSize(o.source, o.srcW, o.srcH);
    const coverTo = coverVec(tw, th, W, H);
    let coverFrom = coverTo;
    if (useFrom) {
      const [fw, fh] = sourceSize(tr.fromSource, tr.fromW, tr.fromH);
      coverFrom = coverVec(fw, fh, W, H);
    }

    this._bindQuad();
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // --- TAHAP 1: transisi -> FBO ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this._progT);
    const ut = this._uT;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texTo);
    gl.uniform1i(ut.uTo, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, useFrom && this._fromValid ? this._texFrom : this._texTo);
    gl.uniform1i(ut.uFrom, 1);
    gl.uniform4fv(ut.uCoverTo, coverTo);
    gl.uniform4fv(ut.uCoverFrom, coverFrom);
    gl.uniform2f(ut.uRes, W, H);
    gl.uniform1f(ut.uProg, tr ? Math.min(1, Math.max(0, tr.progress || 0)) : 1);
    gl.uniform1f(ut.uTime, time);
    gl.uniform1i(ut.uType, useFrom ? trIdx : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // --- TAHAP 2: efek -> kanvas ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this._progE);
    const ue = this._uE;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._fboTex);
    gl.uniform1i(ue.uTex, 0);
    gl.uniform2f(ue.uRes, W, H);
    gl.uniform1f(ue.uTime, time);
    gl.uniform1f(ue.uBeat, beat);
    for (const k of PARAM_KEYS) {
      let v = Number(params[k]);
      if (!Number.isFinite(v)) v = 0;
      const lo = (k === 'temperature' || k === 'exposure') ? -1 : 0;
      gl.uniform1f(ue[k], Math.min(1, Math.max(lo, v)));
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------------- Fallback Canvas2D ---------------- */

  _drawCover(ctx, src, sw, sh) {
    const [w, h] = sourceSize(src, sw, sh);
    if (!w || !h || !sourceReady(src)) return;
    const W = this.width;
    const H = this.height;
    const s = Math.max(W / w, H / h);
    const dw = w * s;
    const dh = h * s;
    try {
      ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } catch (err) { /* frame belum siap */ }
  }

  _render2D(o) {
    const ctx = this._ctx;
    if (!ctx) return;
    const W = this.width;
    const H = this.height;
    const p = o.params || {};
    const g = (k) => {
      const v = Number(p[k]);
      return Number.isFinite(v) ? v : 0;
    };
    const beat = Math.min(1, Math.max(0, o.beat || 0));
    const time = o.time || 0;
    const tr = o.transition || null;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Filter warna dasar (hanya jika browser mendukung ctx.filter)
    if ('filter' in ctx) {
      const f = [];
      f.push('brightness(' + Math.pow(2, g('exposure') * 1.2).toFixed(3) + ')');
      f.push('contrast(' + (1 + g('contrast') * 0.9).toFixed(3) + ')');
      f.push('saturate(' + (1 + g('saturation')) * (1 - g('mono')) + ')');
      if (g('sepia') > 0) f.push('sepia(' + g('sepia') + ')');
      if (g('blur') > 0) f.push('blur(' + (g('blur') * 8).toFixed(1) + 'px)');
      ctx.filter = f.join(' ');
    }

    // Zoom + shake
    const zoom = 1 + g('zoomPunch') * beat * 0.14 + g('slowPush') * (1 - Math.exp(-time * 0.15)) * 0.2;
    const sh = g('shake') * 0.012 * (1 + beat * 1.5) * W;
    ctx.translate(W / 2 + (Math.random() - 0.5) * sh, H / 2 + (Math.random() - 0.5) * sh);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);

    // Transisi sederhana
    const prog = tr ? Math.min(1, Math.max(0, tr.progress || 0)) : 1;
    const type = tr ? tr.type : 'cut';
    if (tr && type !== 'cut' && tr.fromSource && prog < 1) {
      this._drawCover(ctx, tr.fromSource, tr.fromW, tr.fromH);
      ctx.save();
      if (type === 'wipeLeft') {
        ctx.beginPath(); ctx.rect(W * (1 - prog), 0, W * prog, H); ctx.clip();
      } else if (type === 'wipeRight') {
        ctx.beginPath(); ctx.rect(0, 0, W * prog, H); ctx.clip();
      } else if (type === 'wipeUp') {
        ctx.beginPath(); ctx.rect(0, H * (1 - prog), W, H * prog); ctx.clip();
      } else if (type === 'zoom') {
        ctx.globalAlpha = prog;
        ctx.translate(W / 2, H / 2);
        const z = 1 + (1 - prog) * 0.6;
        ctx.scale(z, z);
        ctx.translate(-W / 2, -H / 2);
      } else {
        ctx.globalAlpha = prog; // fade, dissolve, dll.
      }
      this._drawCover(ctx, o.source, o.srcW, o.srcH);
      ctx.restore();
    } else {
      this._drawCover(ctx, o.source, o.srcW, o.srcH);
    }

    ctx.restore();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if ('filter' in ctx) ctx.filter = 'none';

    // Suhu warna
    const temp = g('temperature');
    if (temp !== 0) {
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = temp > 0 ? 'rgba(255,150,40,' + temp * 0.3 + ')' : 'rgba(40,120,255,' + -temp * 0.3 + ')';
      ctx.fillRect(0, 0, W, H);
    }
    // Teal & orange
    if (g('tealOrange') > 0) {
      ctx.globalCompositeOperation = 'soft-light';
      const gr = ctx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'rgba(255,150,60,' + g('tealOrange') * 0.5 + ')');
      gr.addColorStop(1, 'rgba(0,120,150,' + g('tealOrange') * 0.5 + ')');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
    // Light leak
    if (g('lightLeak') > 0) {
      ctx.globalCompositeOperation = 'screen';
      const x = W * (0.1 + 0.8 * (0.5 + 0.5 * Math.sin(time * 0.6)));
      const lg = ctx.createRadialGradient(x, H * 0.3, 0, x, H * 0.3, W * 0.8);
      lg.addColorStop(0, 'rgba(255,115,40,' + g('lightLeak') * (0.6 + beat * 0.3) + ')');
      lg.addColorStop(1, 'rgba(255,40,90,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, W, H);
    }
    // Scanlines
    ctx.globalCompositeOperation = 'source-over';
    const sl = g('scanlines') + g('crt') * 0.5;
    if (sl > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + sl * 0.3 + ')';
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    }
    // Beat flash
    if (g('beatFlash') > 0 && beat > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + beat * g('beatFlash') * 0.35 + ')';
      ctx.fillRect(0, 0, W, H);
    }
    // Vignette
    if (g('vignette') > 0) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,' + g('vignette') + ')');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    // Grain
    if (g('grain') > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      const n = Math.floor(g('grain') * 400);
      for (let i = 0; i < n; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    // Letterbox
    if (g('letterbox') > 0) {
      const bar = g('letterbox') * 0.14 * H;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
    }
    ctx.restore();
  }
}

export default FxRenderer;
