// Jatah 24 jam bergulir: logika murni (core) dan penyimpanan (store) dengan chrome.storage tiruan.
const test = require("node:test");
const assert = require("node:assert/strict");
require("../lib/core.js");
const C = globalThis.SapuCore;

const H = 60 * 60 * 1000;
const NOW = Date.parse("2026-10-16T21:00:00+07:00");

test("only unfollows from the last 24 hours count, across midnight", () => {
  // 300 unfollow jam 22:00-23:59 kemarin malam tetap dihitung setelah lewat tengah malam
  const lateNight = Array.from({ length: 300 }, (_, i) => NOW - 23 * H + i * 1000);
  const u = C.dailyUsage(lateNight, 300, NOW);
  assert.equal(u.count, 300);
  assert.equal(u.left, 0);
  assert.equal(u.nextFreeAt, lateNight[0] + C.DAY_MS);
  // satu jam kemudian unfollow pertama sudah lewat 24 jam: jatah terbuka sedikit demi sedikit
  const later = C.dailyUsage(lateNight, 300, NOW + H + 5000);
  assert.equal(later.count, 294);
  assert.equal(later.left, 6);
  assert.equal(later.nextFreeAt, null);
});

test("next free slot follows the oldest stamp that keeps the limit full", () => {
  const stamps = [NOW - 20 * H, NOW - 10 * H, NOW - 5 * H, NOW - 1 * H];
  // cap 3 tapi 4 tercatat (cap baru diturunkan): butuh 2 kedaluwarsa, slot terbuka saat stamp ke-2 lewat
  assert.equal(C.dailyUsage(stamps, 3, NOW).nextFreeAt, NOW - 10 * H + C.DAY_MS);
  assert.equal(C.dailyUsage(stamps, 4, NOW).nextFreeAt, NOW - 20 * H + C.DAY_MS);
  assert.equal(C.dailyUsage(stamps, 5, NOW).left, 1);
  assert.equal(C.dailyUsage([], 80, NOW).refillAt, null);
});

test("garbage and far-future stamps are dropped, order does not matter", () => {
  const s = C.rollingStamps([NOW - H, "x", null, NaN, NOW - 2 * H, NOW + 3 * C.DAY_MS, NOW - 25 * H], NOW);
  assert.deepEqual(s, [NOW - 2 * H, NOW - H]);
  assert.deepEqual(C.rollingStamps("nope", NOW), []);
});

test("history rebuilds the counter: real unfollows only, refollowed still count", () => {
  const at = (ms) => new Date(ms).toISOString();
  const log = [
    { result: "unfollowed", at: at(NOW - H) },
    { result: "refollowed", at: at(NOW - 2 * H) },
    { result: "simulasi", at: at(NOW - 3 * H) },
    { result: "dilewati", at: at(NOW - 4 * H) },
    { result: "unfollowed", at: at(NOW - 30 * H) },
  ];
  assert.deepEqual(C.stampsFromLog(log, NOW), [NOW - 2 * H, NOW - H]);
});

// ---------- store ----------
const mem = {};
globalThis.chrome = {
  runtime: { id: "test" },
  storage: {
    local: {
      async get(k) {
        return k in mem ? { [k]: structuredClone(mem[k]) } : {};
      },
      async set(o) {
        Object.assign(mem, structuredClone(o));
      },
    },
  },
};
require("../lib/store.js");
const Store = globalThis.SapuStore;

test("old per-date counter migrates from history, then counts by timestamp", async () => {
  const now = Date.now();
  mem["daily:1"] = { date: "2026-10-16", count: 7 };
  mem["log:1"] = [
    { result: "unfollowed", at: new Date(now - 2 * H).toISOString() },
    { result: "unfollowed", at: new Date(now - 26 * H).toISOString() },
  ];
  assert.equal((await Store.getDaily("1")).count, 1);
  const d = await Store.bumpDaily("1");
  assert.equal(d.count, 2);
  assert.equal(mem["daily:1"].v, 2);
  assert.equal(mem["daily:1"].stamps.length, 2);
  // setelah format baru tersimpan, stamp lama di luar 24 jam dibuang dan riwayat tidak dibaca lagi
  mem["daily:1"].stamps.unshift(now - 25 * H);
  mem["log:1"] = [];
  assert.equal((await Store.getDaily("1")).count, 2);
});

test("missing counter starts from history, empty when there is none", async () => {
  delete mem["daily:2"];
  assert.deepEqual(await Store.getDaily("2"), { count: 0, stamps: [] });
});
