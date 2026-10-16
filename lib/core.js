/*
 * SapuX: fungsi murni (tidak menyentuh browser/jaringan), bisa dites di Node.
 */
(function (root) {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  // geo.js dimuat lebih dulu di ekstensi; di Node (tes) diambil lewat require.
  const Geo = root.SapuGeo || (typeof require === "function" ? require("./geo.js") : null);

  const DEFAULT_SETTINGS = Object.freeze({
    lang: "en", // bahasa antarmuka: "en" (default) atau "id"
    thresholdDays: 180, // tidak tweet selama >= N hari dianggap tidak aktif
    protectMutuals: true, // akun yang follow balik tidak di-unfollow
    protectMinFollowers: 0, // akun dengan followers >= N tidak di-unfollow (0 = mati)
    smallMaxFollowers: 0, // akun dengan followers < N ikut di-unfollow walau aktif (0 = mati)
    unfollowNonFollowers: false, // akun yang tidak follow balik ikut di-unfollow walau aktif
    detectQuietActivity: true, // following berubah sejak scan sebelumnya = masih aktif
    notifications: true, // notifikasi desktop saat proses unfollow selesai/berhenti
    keepRegions: [], // akun dari negara/wilayah ini tidak di-unfollow, mis. ["ID", "sea"]
    focusRegions: [], // kandidat dari negara/wilayah ini diproses duluan, mis. ["IN"]
    focusOnly: false, // pilih otomatis hanya kandidat dari focusRegions
    whitelist: "", // daftar akun yang tidak boleh di-unfollow
    dryRun: true, // mode simulasi: tidak ada request unfollow yang dikirim
    dailyCap: 80, // maksimal unfollow asli per hari
    minDelaySec: 20, // jeda acak antar unfollow
    maxDelaySec: 45,
    batchSize: 10, // setelah N unfollow, istirahat lebih lama
    batchPauseMinMin: 3, // istirahat antar batch (menit)
    batchPauseMaxMin: 6,
  });

  const LIMITS = Object.freeze({
    thresholdDays: [30, 3650],
    protectMinFollowers: [0, 1000000000],
    smallMaxFollowers: [0, 10000000],
    dailyCap: [1, 500],
    minDelaySec: [10, 600],
    maxDelaySec: [10, 900],
    batchSize: [1, 50],
    batchPauseMinMin: [1, 60],
    batchPauseMaxMin: [1, 120],
  });

  function clampInt(value, [lo, hi], fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  }

  /** Pastikan pengaturan selalu dalam batas aman, apa pun isinya. */
  function sanitizeSettings(input) {
    const src = { ...DEFAULT_SETTINGS, ...(input || {}) };
    const out = {
      lang: src.lang === "id" ? "id" : "en",
      thresholdDays: clampInt(src.thresholdDays, LIMITS.thresholdDays, DEFAULT_SETTINGS.thresholdDays),
      protectMutuals: Boolean(src.protectMutuals),
      protectMinFollowers: clampInt(src.protectMinFollowers, LIMITS.protectMinFollowers, DEFAULT_SETTINGS.protectMinFollowers),
      smallMaxFollowers: clampInt(src.smallMaxFollowers, LIMITS.smallMaxFollowers, DEFAULT_SETTINGS.smallMaxFollowers),
      unfollowNonFollowers: Boolean(src.unfollowNonFollowers),
      detectQuietActivity: src.detectQuietActivity !== false,
      notifications: src.notifications !== false,
      keepRegions: Geo.sanitizeCodes(src.keepRegions),
      focusRegions: Geo.sanitizeCodes(src.focusRegions),
      focusOnly: Boolean(src.focusOnly),
      whitelist: String(src.whitelist ?? "").slice(0, 50000),
      dryRun: Boolean(src.dryRun),
      dailyCap: clampInt(src.dailyCap, LIMITS.dailyCap, DEFAULT_SETTINGS.dailyCap),
      minDelaySec: clampInt(src.minDelaySec, LIMITS.minDelaySec, DEFAULT_SETTINGS.minDelaySec),
      maxDelaySec: clampInt(src.maxDelaySec, LIMITS.maxDelaySec, DEFAULT_SETTINGS.maxDelaySec),
      batchSize: clampInt(src.batchSize, LIMITS.batchSize, DEFAULT_SETTINGS.batchSize),
      batchPauseMinMin: clampInt(src.batchPauseMinMin, LIMITS.batchPauseMinMin, DEFAULT_SETTINGS.batchPauseMinMin),
      batchPauseMaxMin: clampInt(src.batchPauseMaxMin, LIMITS.batchPauseMaxMin, DEFAULT_SETTINGS.batchPauseMaxMin),
    };
    if (out.maxDelaySec < out.minDelaySec) out.maxDelaySec = out.minDelaySec;
    if (out.batchPauseMaxMin < out.batchPauseMinMin) out.batchPauseMaxMin = out.batchPauseMinMin;
    return out;
  }

  /** Format tanggal API v1.1 X: "Wed Oct 10 20:19:24 +0000 2018". */
  function parseXDate(value) {
    if (!value) return null;
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }

  function daysSince(ts, now = Date.now()) {
    if (ts == null) return null;
    return Math.max(0, Math.floor((now - ts) / DAY_MS));
  }

  /** Ambil hanya field yang dibutuhkan dari objek user X. */
  function normalizeUser(raw) {
    const lastTs = parseXDate(raw?.status?.created_at);
    return {
      id: String(raw?.id_str ?? raw?.id ?? ""),
      handle: String(raw?.screen_name ?? ""),
      name: String(raw?.name ?? ""),
      avatar: String(raw?.profile_image_url_https ?? ""),
      followers: Number(raw?.followers_count) || 0,
      following: Number(raw?.friends_count) || 0,
      followedBy: Boolean(raw?.followed_by),
      isProtected: Boolean(raw?.protected),
      location: String(raw?.location ?? "").slice(0, 120), // kolom lokasi di bio (ditulis sendiri oleh pemilik akun)
      lang: String(raw?.status?.lang ?? ""), // bahasa posting terakhir menurut X
      lastTweetAt: lastTs == null ? null : new Date(lastTs).toISOString(),
    };
  }

  /** "@a, b\nhttps://x.com/c" -> Set{"a","b","c"} (huruf kecil). */
  function parseWhitelist(text) {
    const set = new Set();
    for (let token of String(text || "").split(/[\s,;]+/)) {
      token = token.trim();
      if (!token) continue;
      const fromUrl = token.match(/(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})/i);
      if (fromUrl) token = fromUrl[1];
      token = token.replace(/^@/, "");
      if (/^[A-Za-z0-9_]{1,15}$/.test(token)) set.add(token.toLowerCase());
    }
    return set;
  }

  /**
   * status: "inactive" | "small" (followers < batas) | "oneway" (tidak follow balik) | "active" | "unknown" (tidak ada data tweet terakhir)
   * shield: null | "whitelist" | "mutual" | "region" | "followers"  -> akun yang dilindungi tidak pernah di-unfollow
   * geo: perkiraan lokasi (lihat geo.js); focus: lokasinya ada di daftar prioritas unfollow
   */
  function classify(user, opts, now = Date.now()) {
    const days = daysSince(parseXDate(user.lastTweetAt), now);
    let status;
    if (days == null) status = "unknown";
    else if (days >= opts.thresholdDays) status = "inactive";
    else status = "active";

    // Aktif diam-diam: tidak posting, tapi jumlah following-nya berubah sejak scan sebelumnya.
    let quiet = false;
    if ((status === "inactive" || status === "unknown") && opts.detectQuietActivity && user.quietActiveAt) {
      const quietDays = daysSince(Date.parse(user.quietActiveAt), now);
      if (quietDays != null && quietDays < opts.thresholdDays) {
        status = "active";
        quiet = true;
      }
    }
    // Akun kecil: followers di bawah batas, ikut jadi kandidat walau masih aktif / tanpa data.
    if (status !== "inactive" && opts.smallMaxFollowers > 0 && (Number(user.followers) || 0) < opts.smallMaxFollowers) status = "small";
    // Sepihak: tidak follow balik, ikut jadi kandidat walau masih aktif / tanpa data.
    if ((status === "active" || status === "unknown") && opts.unfollowNonFollowers && !user.followedBy) status = "oneway";

    let shield = null;
    if (opts.whitelist && opts.whitelist.has(String(user.handle).toLowerCase())) shield = "whitelist";
    else if (opts.protectMutuals && user.followedBy) shield = "mutual";
    const geo = Geo.detectGeo(user);
    if (!shield && Geo.geoMatches(geo, opts.keepRegions)) shield = "region";
    if (!shield && opts.protectMinFollowers > 0 && (Number(user.followers) || 0) >= opts.protectMinFollowers) shield = "followers";

    // Prioritas unfollow hanya dari lokasi yang tidak ditandai X sebagai "mungkin tidak akurat" (VPN/proxy).
    return { status, shield, days, quiet, geo, focus: Geo.trustedForFocus(geo) && Geo.geoMatches(geo, opts.focusRegions) };
  }

  /**
   * Gabungkan hasil scan baru dengan scan sebelumnya.
   * Akun yang jumlah following-nya berubah sejak scan sebelumnya diberi tanda quietActiveAt = sekarang
   * (orangnya masih membuka X walau tidak posting). Tanda lama dibawa ke scan baru.
   */
  function mergeScan(prevUsers, nextUsers, now = Date.now()) {
    const prev = new Map((prevUsers || []).map((u) => [u.id, u]));
    const stamp = new Date(now).toISOString();
    return (nextUsers || []).map((u) => {
      const old = prev.get(u.id);
      const merged = { ...u };
      if (old?.quietActiveAt) merged.quietActiveAt = old.quietActiveAt;
      if (old && typeof old.following === "number" && old.following > 0 && u.following > 0 && old.following !== u.following) {
        merged.quietActiveAt = stamp;
      }
      return merged;
    });
  }

  /** 1234 -> "1,2 rb", 2500000 -> "2,5 jt" (gaya Indonesia). */
  function formatCount(n) {
    n = Number(n) || 0;
    const fmt = (v) => (Math.floor(v * 10) / 10).toLocaleString("id-ID", { maximumFractionDigits: 1 });
    if (n >= 1e6) return fmt(n / 1e6) + " jt";
    if (n >= 1e3) return fmt(n / 1e3) + " rb";
    return String(n);
  }

  function csvCell(value) {
    let s = value == null ? "" : String(value);
    // Cegah formula injection saat CSV dibuka di Excel/Google Sheets.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(rows, columns) {
    const head = columns.map((c) => csvCell(c.label)).join(",");
    const body = rows.map((r) => columns.map((c) => csvCell(c.get(r))).join(","));
    return [head, ...body].join("\r\n");
  }

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function randInt(min, max) {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }

  /** Perkiraan durasi (detik) untuk unfollow `count` akun dengan pengaturan `s`. */
  function estimateSeconds(count, s) {
    if (count <= 1) return 0;
    const gaps = count - 1;
    const batchPauses = Math.floor(gaps / s.batchSize);
    const normalGaps = gaps - batchPauses;
    const avgDelay = (s.minDelaySec + s.maxDelaySec) / 2;
    const avgPause = ((s.batchPauseMinMin + s.batchPauseMaxMin) / 2) * 60;
    return Math.round(normalGaps * avgDelay + batchPauses * avgPause);
  }

  function formatDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h) return `${h} jam ${m} menit`;
    if (m) return `${m} menit${s ? ` ${s} detik` : ""}`;
    return `${s} detik`;
  }

  function formatClock(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  const SapuCore = {
    DAY_MS,
    DEFAULT_SETTINGS,
    sanitizeSettings,
    parseXDate,
    daysSince,
    normalizeUser,
    parseWhitelist,
    classify,
    mergeScan,
    formatCount,
    csvCell,
    toCsv,
    localDateKey,
    randInt,
    estimateSeconds,
    formatDuration,
    formatClock,
  };

  root.SapuCore = SapuCore;
  if (typeof module !== "undefined" && module.exports) module.exports = SapuCore;
})(globalThis);
