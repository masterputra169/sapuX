// Jalankan: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../lib/core.js");

const NOW = Date.parse("2026-10-15T00:00:00Z");
const daysAgo = (d) => new Date(NOW - d * C.DAY_MS).toISOString();

test("parseXDate membaca format tanggal API v1.1", () => {
  assert.equal(C.parseXDate("Wed Oct 10 20:19:24 +0000 2018"), Date.parse("2018-10-10T20:19:24Z"));
  assert.equal(C.parseXDate(""), null);
  assert.equal(C.parseXDate("bukan tanggal"), null);
});

test("normalizeUser mengambil tweet terakhir", () => {
  const u = C.normalizeUser({ id_str: "42", screen_name: "budi", name: "Budi", followed_by: true, status: { created_at: "Wed Oct 10 20:19:24 +0000 2018" } });
  assert.equal(u.id, "42");
  assert.equal(u.handle, "budi");
  assert.equal(u.followedBy, true);
  assert.equal(u.lastTweetAt, "2018-10-10T20:19:24.000Z");
  assert.equal(C.normalizeUser({ id_str: "1", screen_name: "x" }).lastTweetAt, null);
});

test("parseWhitelist menerima @, tanpa @, URL, koma", () => {
  const set = C.parseWhitelist("@Alice, bob\nhttps://x.com/Carol_1 https://twitter.com/@dave  bukan-handle-valid!!");
  assert.deepEqual([...set].sort(), ["alice", "bob", "carol_1", "dave"]);
});

test("classify: inactive / active / unknown + shield", () => {
  const opts = { thresholdDays: 180, whitelist: new Set(["vip"]), protectMutuals: true };
  assert.deepEqual(C.classify({ handle: "a", lastTweetAt: daysAgo(200) }, opts, NOW), { status: "inactive", shield: null, days: 200, quiet: false });
  assert.equal(C.classify({ handle: "a", lastTweetAt: daysAgo(180) }, opts, NOW).status, "inactive");
  assert.equal(C.classify({ handle: "a", lastTweetAt: daysAgo(179) }, opts, NOW).status, "active");
  assert.equal(C.classify({ handle: "a", lastTweetAt: null }, opts, NOW).status, "unknown");
  assert.equal(C.classify({ handle: "VIP", lastTweetAt: daysAgo(999) }, opts, NOW).shield, "whitelist");
  assert.equal(C.classify({ handle: "m", followedBy: true, lastTweetAt: daysAgo(999) }, opts, NOW).shield, "mutual");
  assert.equal(C.classify({ handle: "m", followedBy: true, lastTweetAt: daysAgo(999) }, { ...opts, protectMutuals: false }, NOW).shield, null);
});

test("classify: lindungi akun dengan followers besar", () => {
  const opts = { thresholdDays: 180, whitelist: new Set(), protectMutuals: true, protectMinFollowers: 50000 };
  const old = daysAgo(400);
  assert.equal(C.classify({ handle: "besar", followers: 50000, lastTweetAt: old }, opts, NOW).shield, "followers");
  assert.equal(C.classify({ handle: "kecil", followers: 49999, lastTweetAt: old }, opts, NOW).shield, null);
  // 0 = mati
  assert.equal(C.classify({ handle: "besar", followers: 9e9, lastTweetAt: old }, { ...opts, protectMinFollowers: 0 }, NOW).shield, null);
  // whitelist & mutual tetap diprioritaskan sebagai alasan
  assert.equal(C.classify({ handle: "m", followedBy: true, followers: 9e6, lastTweetAt: old }, opts, NOW).shield, "mutual");
});

test("classify: akun kecil ikut jadi kandidat walau aktif", () => {
  const opts = { thresholdDays: 180, whitelist: new Set(["kecilvip"]), protectMutuals: true, protectMinFollowers: 0, smallMaxFollowers: 100 };
  // aktif tapi followers kecil -> small
  assert.equal(C.classify({ handle: "a", followers: 99, lastTweetAt: daysAgo(3) }, opts, NOW).status, "small");
  // tepat di batas -> bukan kecil
  assert.equal(C.classify({ handle: "a", followers: 100, lastTweetAt: daysAgo(3) }, opts, NOW).status, "active");
  // tanpa data + kecil -> small
  assert.equal(C.classify({ handle: "a", followers: 5, lastTweetAt: null }, opts, NOW).status, "small");
  // tidak aktif tetap tidak aktif
  assert.equal(C.classify({ handle: "a", followers: 5, lastTweetAt: daysAgo(400) }, opts, NOW).status, "inactive");
  // whitelist & mutual tetap melindungi
  assert.equal(C.classify({ handle: "KecilVIP", followers: 5, lastTweetAt: daysAgo(3) }, opts, NOW).shield, "whitelist");
  assert.equal(C.classify({ handle: "m", followedBy: true, followers: 5, lastTweetAt: daysAgo(3) }, opts, NOW).shield, "mutual");
  // 0 = mati
  assert.equal(C.classify({ handle: "a", followers: 5, lastTweetAt: daysAgo(3) }, { ...opts, smallMaxFollowers: 0 }, NOW).status, "active");
});

test("formatCount gaya Indonesia", () => {
  assert.equal(C.formatCount(950), "950");
  assert.equal(C.formatCount(1234), "1,2 rb");
  assert.equal(C.formatCount(50000), "50 rb");
  assert.equal(C.formatCount(2560000), "2,5 jt");
});

test("sanitizeSettings menjaga batas aman", () => {
  const s = C.sanitizeSettings({ dailyCap: 99999, minDelaySec: 1, maxDelaySec: 0, thresholdDays: "abc", batchPauseMinMin: 10, batchPauseMaxMin: 2 });
  assert.equal(s.dailyCap, 500);
  assert.equal(s.minDelaySec, 10);
  assert.equal(s.maxDelaySec, 10);
  assert.equal(s.thresholdDays, 180);
  assert.equal(s.batchPauseMaxMin, 10);
  assert.equal(C.sanitizeSettings({}).dryRun, true);
  assert.equal(C.sanitizeSettings({}).protectMinFollowers, 0);
  assert.equal(C.sanitizeSettings({ protectMinFollowers: -5 }).protectMinFollowers, 0);
  assert.equal(C.sanitizeSettings({ protectMinFollowers: "50000" }).protectMinFollowers, 50000);
});

test("toCsv meng-escape dan mencegah formula injection", () => {
  const csv = C.toCsv([{ a: '=HYPERLINK("x")', b: "koma, dan\nbaris" }], [
    { label: "a", get: (r) => r.a },
    { label: "b", get: (r) => r.b },
  ]);
  assert.equal(csv, 'a,b\r\n"\'=HYPERLINK(""x"")","koma, dan\nbaris"');
});

test("estimateSeconds menghitung jeda + istirahat batch", () => {
  const s = { minDelaySec: 20, maxDelaySec: 40, batchSize: 10, batchPauseMinMin: 2, batchPauseMaxMin: 4 };
  assert.equal(C.estimateSeconds(1, s), 0);
  // 20 akun = 19 jeda: 1 istirahat batch (3 menit) + 18 jeda normal (30 dtk)
  assert.equal(C.estimateSeconds(20, s), 18 * 30 + 180);
});

test("randInt selalu dalam rentang", () => {
  for (let i = 0; i < 1000; i++) {
    const n = C.randInt(5, 7);
    assert.ok(n >= 5 && n <= 7);
  }
});

test("classify: sepihak (tidak follow balik) ikut jadi kandidat walau aktif", () => {
  const opts = { thresholdDays: 180, whitelist: new Set(["vip"]), protectMutuals: true, protectMinFollowers: 0, smallMaxFollowers: 0, unfollowNonFollowers: true };
  assert.equal(C.classify({ handle: "a", followedBy: false, followers: 900, lastTweetAt: daysAgo(3) }, opts, NOW).status, "oneway");
  assert.equal(C.classify({ handle: "a", followedBy: false, followers: 900, lastTweetAt: null }, opts, NOW).status, "oneway");
  // follow balik -> tetap aktif (dan dilindungi mutual)
  const m = C.classify({ handle: "m", followedBy: true, followers: 900, lastTweetAt: daysAgo(3) }, opts, NOW);
  assert.equal(m.status, "active");
  assert.equal(m.shield, "mutual");
  // tidak aktif tetap tidak aktif; whitelist tetap melindungi
  assert.equal(C.classify({ handle: "a", followedBy: false, lastTweetAt: daysAgo(400) }, opts, NOW).status, "inactive");
  assert.equal(C.classify({ handle: "VIP", followedBy: false, lastTweetAt: daysAgo(3) }, opts, NOW).shield, "whitelist");
  // mati -> aktif biasa
  assert.equal(C.classify({ handle: "a", followedBy: false, lastTweetAt: daysAgo(3) }, { ...opts, unfollowNonFollowers: false }, NOW).status, "active");
});

test("classify: aktif diam-diam menyelamatkan akun tanpa posting", () => {
  const opts = { thresholdDays: 180, whitelist: new Set(), protectMutuals: false, protectMinFollowers: 0, smallMaxFollowers: 0, detectQuietActivity: true };
  const quietRecent = { handle: "q", lastTweetAt: daysAgo(400), quietActiveAt: daysAgo(20) };
  const r = C.classify(quietRecent, opts, NOW);
  assert.equal(r.status, "active");
  assert.equal(r.quiet, true);
  // tanda sudah terlalu lama -> tetap tidak aktif
  assert.equal(C.classify({ ...quietRecent, quietActiveAt: daysAgo(200) }, opts, NOW).status, "inactive");
  // fitur dimatikan -> tetap tidak aktif
  assert.equal(C.classify(quietRecent, { ...opts, detectQuietActivity: false }, NOW).status, "inactive");
  // tanpa data posting juga bisa terselamatkan
  assert.equal(C.classify({ handle: "q", lastTweetAt: null, quietActiveAt: daysAgo(5) }, opts, NOW).status, "active");
});

test("mergeScan menandai akun yang following-nya berubah", () => {
  const prev = [
    { id: "1", following: 40 },
    { id: "2", following: 80 },
    { id: "3", following: 10, quietActiveAt: "2026-09-01T00:00:00.000Z" },
    { id: "4" }, // scan versi lama tanpa data following
  ];
  const next = [
    { id: "1", following: 41 },
    { id: "2", following: 80 },
    { id: "3", following: 10 },
    { id: "4", following: 5 },
    { id: "5", following: 9 },
  ];
  const out = C.mergeScan(prev, next, NOW);
  const by = Object.fromEntries(out.map((u) => [u.id, u]));
  assert.equal(by["1"].quietActiveAt, new Date(NOW).toISOString());
  assert.equal(by["2"].quietActiveAt, undefined);
  assert.equal(by["3"].quietActiveAt, "2026-09-01T00:00:00.000Z");
  assert.equal(by["4"].quietActiveAt, undefined);
  assert.equal(by["5"].quietActiveAt, undefined);
});
