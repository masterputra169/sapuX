# SapuX

<img src="icons/icon128.png" width="72" alt="Logo SapuX" align="right">

**Unfollow akun X (Twitter) yang sudah tidak aktif dengan aman, langsung dari browser kamu.**

SapuX adalah ekstensi Chrome kecil yang men-scan akun yang kamu follow, mengelompokkannya berdasarkan kapan terakhir posting, lalu meng-unfollow akun yang kamu pilih secara pelan dan dengan batas harian. Semua berjalan lokal: tanpa server, tanpa daftar akun, tanpa API key, tanpa dependency.

[English](README.md)

<p>
  <img src="docs/screenshots/review.png" width="260" alt="Tab Daftar">
  <img src="docs/screenshots/indonesian-light.png" width="260" alt="Tampilan Bahasa Indonesia, tema terang">
  <img src="docs/screenshots/confirm-dialog.png" width="260" alt="Konfirmasi sebelum unfollow asli">
</p>

## Fitur

- **Filter tidak aktif.** Akun yang tidak posting, reply, atau repost selama N hari (default 180) otomatis terpilih.
- **Akun kecil.** Opsional: unfollow juga akun dengan followers di bawah N (bot, farm airdrop) walau masih aktif.
- **Sepihak.** Opsional: unfollow juga akun yang tidak follow balik.
- **Deteksi aktivitas diam-diam.** Kalau jumlah following sebuah akun berubah di antara dua scan, orangnya masih membuka X walau tidak posting, jadi dianggap aktif.
- **Filter follow balik.** Chip di bawah kolom cari (Semua · Follow balik · Tidak follow balik) menyaring grup yang sedang dibuka, lengkap dengan jumlahnya.
- **Aturan lokasi.** SapuX menebak asal akun dari bendera, nama tempat, dan kata sehari-hari di nama, bio, dan kolom lokasi, ditambah bahasa posting terakhir, lalu memberi tingkat keyakinan tinggi, sedang, atau rendah. Setelah sebagian akun dicek ke X, SapuX menampilkan seberapa sering tebakannya cocok. Lindungi negara atau wilayah tertentu (misalnya Indonesia atau Asia Tenggara), dan dahulukan yang lain di antrean (misalnya India). Kandidat juga bisa dicek ke data resmi X "Account based in" (satu request per akun, pelan, dan mengikuti batas dari X); data ini menggantikan tebakan, dan akun yang ditandai X mungkin memakai VPN tidak pernah diprioritaskan. Secara default hanya data X yang bisa mendahulukan akun di antrean; tebakan dipakai untuk perlindungan. Lokasi saja tidak pernah membuat akun jadi kandidat unfollow.
- **Perlindungan.** Whitelist, mutual, dan akun dengan followers di atas N tidak pernah disentuh. Tambah atau lepas akun dari whitelist dengan satu klik.
- **Antrean yang bisa dilanjutkan.** Kalau jatah harian habis, kamu klik Hentikan, atau tab tertutup, sisa akun disimpan. Besok tinggal klik Lanjutkan.
- **Notifikasi desktop** saat proses unfollow asli selesai atau berhenti.
- **Backup dan restore** aturan + whitelist sebagai file JSON.
- **Riwayat dengan undo.** Setiap unfollow tercatat; follow lagi dengan satu klik. Export CSV untuk hasil scan dan riwayat.
- **Preset kecepatan** Aman, Seimbang, atau Cepat untuk mengisi semua jeda sekaligus.
- **Cek kesehatan** sekali klik: menguji SapuX ke X saat ini juga (hanya membaca) dan memberi tahu bagian mana yang bermasalah serta cara memperbaikinya.
- **Mode simulasi aktif secara default**, plus pop-up konfirmasi sebelum setiap proses: jumlah akun, sisa antrean, perkiraan waktu, dan peringatan.
- English dan Bahasa Indonesia (tombol EN / ID), tema terang dan gelap (mengikuti X).

## Instalasi

1. Download repo ini (Code → Download ZIP) lalu ekstrak, atau `git clone`.
2. Buka `chrome://extensions`, aktifkan **Developer mode** di kanan atas.
3. Klik **Load unpacked**, pilih folder yang berisi `manifest.json`.
4. Buka https://x.com, login, scroll timeline beberapa detik supaya sesi tertangkap.
5. Klik tombol **SapuX** kuning di kiri bawah, atau ikon ekstensi di toolbar.

Bisa dipakai di Chrome, Brave, Edge, dan browser Chromium lain.

## Cara pakai

Nama tab dalam Bahasa Indonesia: **Daftar**, **Riwayat**, **Aturan**.

1. **Aturan.** Atur batas hari tidak aktif, dan opsional: lindungi akun besar, unfollow akun kecil, unfollow akun sepihak, isi whitelist. Simpan.
2. **Daftar → Scan following.** Hasilnya dikelompokkan:

   | Kategori | Artinya | Terpilih otomatis |
   |---|---|---|
   | Tidak aktif | Posting terakhir lebih lama dari batas | Ya |
   | Kecil | Followers di bawah batas walau aktif (kalau diaktifkan) | Ya |
   | Sepihak | Tidak follow balik walau aktif (kalau diaktifkan) | Ya |
   | Tanpa data | Belum pernah posting / data tidak ada | Tidak, cek manual |
   | Aktif | Masih posting | Tidak bisa dipilih |
   | Dilindungi | Whitelist, mutual, atau akun besar | Tidak bisa dipilih |

3. Cek daftarnya. Cari nama atau @handle, saring dengan chip **Follow balik / Tidak follow balik**, klik baris untuk centang / hapus centang, atau klik **Lindungi** supaya akun masuk whitelist.
4. Klik **Simulasi**: seluruh alur jalan tanpa mengirim unfollow, hasilnya masuk Riwayat.
5. Kalau sudah yakin, matikan **Mode simulasi** di Aturan, lalu klik **Unfollow N**. Biarkan tab X terbuka; tombol **Hentikan** bisa dipakai kapan saja.
6. Sisa akun (jatah habis, dihentikan, tab tertutup) muncul sebagai kartu antrean dengan tombol **Lanjutkan** dan **Buang**.
7. Salah unfollow? **Riwayat → Follow lagi**.

Scan ulang tiap beberapa minggu. Deteksi aktivitas diam-diam butuh dua scan untuk dibandingkan.

## Keamanan

| Risiko | Penanganan |
|---|---|
| Kena limit / suspend | Jeda acak 20-45 detik, istirahat 3-6 menit tiap 10 unfollow, batas 80/hari secara default (maksimal 500). Jeda minimum dikunci 10 detik. Naikkan batas harian bertahap. |
| X membalas rate limit, 403, akun dikunci, atau error tak dikenal | Berhenti total, tidak mencoba ulang. |
| Salah unfollow | Simulasi default, konfirmasi, export CSV, whitelist, Follow lagi. |
| Akun tanpa data ikut ter-unfollow | Dipisah di kategori sendiri dan tidak terpilih otomatis. |
| Token dicuri | Token hanya di `chrome.storage.session` (RAM), hilang saat browser ditutup. Cookie `auth_token` tidak pernah dibaca. |
| Data dikirim ke luar | Request hanya ke `x.com` dan `api.x.com`. Tanpa analytics atau CDN; font dan ikon dibundel. |
| Nama / bio berisi skrip jahat | Panel di Shadow DOM tertutup, teks dirender lewat `textContent`. |
| CSV berisi formula jahat | Sel yang diawali `= + - @` di-escape. |
| File backup dimodifikasi | Pengaturan hasil import divalidasi ulang: angka dikunci ke batas aman, field asing dibuang. |

Permission: `storage`, `webRequest` (membaca header `Authorization` dari request X sendiri), `notifications` (bisa dimatikan di Aturan), dan akses host hanya ke `x.com` / `api.x.com`.

## Batasan

- Memakai API internal web X, bukan API resmi berbayar. Kalau X mengubahnya, scan bisa gagal sampai SapuX diperbarui. Otomatisasi tetap punya risiko terhadap aturan X, jadi pakai batas harian yang wajar.
- "Aktif" dihitung dari posting, reply, atau repost terakhir. Like tidak terhitung. X tidak menyediakan data "terakhir dilihat"; deteksi aktivitas diam-diam adalah sinyal terdekat.
- Chrome memperlambat timer di tab latar belakang. Tetap aman, hanya lebih lambat.

## Tes

```bash
node --test                 # 49 unit test, tanpa dependency
bash tests/e2e/run_all.sh   # end-to-end, butuh Python + Playwright + Chromium
```

Tes end-to-end memuat SapuX ke Chromium sungguhan dengan x.com tiruan, lalu mengklik semua alur seperti pengguna. Kedua jenis tes jalan otomatis di GitHub Actions setiap push.

## Lisensi

[MIT](LICENSE). Font Geist (SIL OFL) dan ikon Phosphor (MIT) dibundel dengan lisensinya masing-masing.

SapuX tidak berafiliasi dengan X Corp.
