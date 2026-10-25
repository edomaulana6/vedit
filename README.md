# VEdit — Editor Video di Browser

VEdit adalah editor video berbasis browser untuk membuat klip vertikal (TikTok, Reels, Shorts) dengan efek visual, transisi, dan sinkron beat. Semua pemrosesan berjalan di perangkat Anda, jadi tidak perlu server render. Proyek ini berupa situs statis yang siap dipasang di Vercel.

---

## Struktur Folder

```
vedit/
├── index.html          # Halaman utama (UI editor)
├── css/
│   └── styles.css      # Tampilan
├── js/
│   ├── main.js         # Logika aplikasi & penghubung UI
│   ├── effects.js      # Mesin efek WebGL (shader) + fallback Canvas2D
│   ├── presets.js      # Pustaka preset gaya, Auto Style, preset pengguna
│   ├── audio.js        # Decode audio, deteksi beat, waveform
│   └── exporter.js     # Ekspor video (MediaRecorder, MP4 via ffmpeg.wasm)
├── assets/             # Aset statis (ikon, gambar)
└── vercel.json         # Konfigurasi Vercel (header & cache)
```

---

## Fitur

- **Efek buatan sendiri (shader WebGL):** exposure, contrast, saturation, temperature, vignette, sharpen, grain, blur, letterbox, RGB split, glitch, shake, zoom punch, beat flash, halation, scanlines, VHS, CRT, posterize, halftone, sepia, mono, neon, cel shading, bloom, light leak, dream, teal & orange, film gate, dan slow push.
- **12 transisi:** Cut, Whip Pan, Glitch, Zoom Blur, Spin, Light Leak, Morph Blur, Wipe (kiri/kanan/atas), Fade, dan Dissolve.
- **Puluhan preset gaya** dalam kategori:
  - Jedag-Jedug & Beat
  - Cinematic
  - Bersih & Sosial
  - Aesthetic & Lembut
  - Retro & Film
  - Stylized & Seni
  - Mood & Suasana
  - Profesional & Komersial
  - Genre & Niche
  - Preset Saya
- **Auto Style:** memilih preset yang cocok dari mood klip dan BPM musik.
- **Deteksi beat & BPM:** zoom punch, flash, dan potongan bisa mengikuti musik.
- **Waveform audio** dan titik potong otomatis dari beat.
- **Rasio 9:16, 1:1, 16:9** dengan resolusi 480p, 720p, dan 1080p.
- **Ekspor** WebM atau MP4 langsung dari browser.
- **Simpan preset sendiri** di perangkat.
- **Fallback:** jika WebGL tidak tersedia, renderer memakai Canvas2D versi sederhana.

---

## Cara Pakai Singkat

1. Buka situs, lalu unggah footage (video atau gambar).
2. Unggah musik (opsional). Aplikasi menganalisis beat dan BPM.
3. Pilih preset secara manual atau tekan **Auto Style**.
4. Atur transisi dan sesuaikan slider efek sesuai selera.
5. Pratinjau hasilnya.
6. Pilih rasio, resolusi, dan format, lalu tekan **Ekspor**.
7. Tunggu sampai selesai, lalu unduh file.

---

## Menjalankan Secara Lokal

Modul JavaScript (ES module) tidak bisa dibuka lewat `file://`, jadi gunakan server lokal:

```bash
cd vedit
python3 -m http.server 8000
```

Buka `http://localhost:8000` di browser.

---

## Deploy ke Vercel

Proyek ini situs statis. Tidak ada build command.

### Opsi A — Dashboard (drag-drop atau GitHub import)

1. Masuk ke [vercel.com](https://vercel.com).
2. Pilih **Add New → Project**.
3. Impor repositori GitHub Anda, atau seret folder proyek ke dashboard.
4. Atur **Framework Preset** ke **Other**.
5. Kosongkan **Build Command** dan **Install Command**.
6. Biarkan **Output Directory** sesuai `vercel.json` (`.`).
7. Klik **Deploy**.

### Opsi B — Vercel CLI

```bash
npm i -g vercel
cd vedit
vercel          # deploy pratinjau
vercel --prod   # deploy produksi
```

Konfigurasi di `vercel.json` mengatur `cleanUrls`, header keamanan dasar, dan cache panjang untuk `/css`, `/js`, dan `/assets`.

> **Catatan cache:** file di `/css` dan `/js` di-cache setahun (`immutable`). Jika Anda mengubah file tanpa mengganti namanya, pengunjung lama mungkin masih memakai versi lama. Ganti nama file, atau tambahkan versi pada URL impor, setiap kali ada pembaruan.

---

## Cara Kerja Preset, Auto Style, dan Preset Pengguna

### Preset
Preset adalah kumpulan parameter efek. Skalanya:

- `exposure` dan `temperature`: -1 sampai 1.
- Parameter lain: 0 sampai 1.
- Parameter yang tidak disebut dianggap 0 (efek mati).

Setiap preset juga punya daftar **mood** dan **rentang BPM** yang cocok. Keduanya dipakai oleh Auto Style.

### Auto Style
1. Aplikasi mengambil sampel piksel kecil dari klip dan menghitung kecerahan, saturasi, dan kehangatan warna. Dari situ ditentukan mood: gelap, hangat, dingin, cerah, energik, atau santai.
2. BPM didapat dari analisis musik.
3. Setiap preset diberi skor berdasarkan kecocokan mood, BPM, kecerahan, dan saturasi. Preset dengan skor tertinggi dipilih.

Auto Style adalah saran awal. Anda tetap bisa mengubah preset atau slider.

### Simpan Preset Sendiri
Preset buatan Anda disimpan di `localStorage` browser dengan kunci `vedit.userPresets`. Artinya:

- Data tersimpan hanya di browser dan perangkat yang sama.
- Menghapus data situs atau memakai mode privat akan menghapusnya.
- Preset tidak otomatis pindah antarperangkat.

---

## Keterbatasan (Jujur)

- **Berbasis browser, bukan API render server-side.** Semua proses jalan di perangkat pengguna. VEdit bukan layanan seperti JSON2Video atau Rendi.dev.
- **Tidak bisa dipanggil otomatis oleh workflow.** Tidak ada endpoint HTTP. Editor harus dioperasikan manual di browser, jadi tidak cocok untuk otomasi harian tanpa campur tangan manusia.
- **Performa klip panjang bergantung perangkat.** Klip panjang, resolusi tinggi (1080p), dan efek berat (bloom, blur, neon) dapat membuat pratinjau patah-patah di perangkat lemah. Turunkan resolusi atau kurangi efek jika perlu.
- **Ekspor real-time.** Video direkam saat diputar, jadi durasi ekspor kira-kira sama dengan durasi video. Video 30 detik butuh sekitar 30 detik. Tab harus tetap terbuka dan aktif selama ekspor.
- **MP4 tergantung dukungan browser.**
  - Jika browser mendukung perekaman MP4 secara native, hasil langsung MP4.
  - Jika tidak, hasil direkam sebagai WebM lalu dikonversi dengan **ffmpeg.wasm**. Pustaka ini dimuat saat dibutuhkan dari CDN (jsDelivr), sehingga perlu koneksi internet dan unduhan tambahan yang cukup besar. Konversi menambah waktu.
  - Jika konversi gagal, video disimpan sebagai WebM sebagai cadangan.
- **Batas memori di ponsel.** Konversi MP4 dengan ffmpeg.wasm dan klip panjang memakai banyak RAM. Di ponsel, tab bisa crash atau gagal. Gunakan klip pendek dan resolusi lebih rendah.
- **Deteksi beat bersifat perkiraan.** Analisis audio dapat salah, misalnya BPM terbaca setengah atau dua kali lipat, atau beat meleset pada musik tanpa ritme jelas. Periksa hasilnya dan koreksi manual bila perlu.
- **Font dan lisensi musik tanggung jawab pengguna.** Pastikan Anda berhak memakai musik, footage, dan font yang digunakan, terutama untuk konten komersial. Platform seperti TikTok bisa membisukan atau menghapus video yang melanggar hak cipta.
- **Efek di Canvas2D lebih sederhana.** Jika WebGL tidak tersedia, sebagian efek (misalnya neon, halftone, dan transisi tertentu) tidak tampil sama.

---

## Kompatibilitas

Disarankan memakai Chrome atau Edge versi terbaru di desktop. Safari dan browser ponsel umumnya bisa dipakai, tetapi dukungan `MediaRecorder`, format MP4, dan WebGL berbeda-beda antarperangkat.

---

## Lisensi dan Tanggung Jawab

Kode proyek ini Anda kelola sendiri. Sebelum memakai ffmpeg.wasm atau pustaka pihak ketiga lain untuk keperluan komersial, periksa lisensinya.
