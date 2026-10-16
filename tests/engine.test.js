// Tes logika keamanan mesin unfollow dengan API & storage tiruan (tanpa browser).
const test = require("node:test");
const assert = require("node:assert/strict");
require("../lib/core.js");

function apiError(status, code) {
  const e = new Error(`HTTP ${status}`);
  e.status = status;
  e.code = code;
  return e;
}

// --- tiruan API & Store ---
const calls = [];
let daily = 0;
let failOn = {}; // userId -> error
let pages = [];
globalThis.SapuApi = {
  async unfollow(id) {
    calls.push(id);
    if (failOn[id]) throw failOn[id];
    return { id_str: id };
  },
  async getFollowingPage(owner, cursor) {
    const p = pages.shift();
    if (p instanceof Error) throw p;
    return p;
  },
};
let about = {}; // handle -> json | Error
let rateNow = null;
const aboutCalls = [];
globalThis.SapuApi.getAbout = async (handle) => {
  aboutCalls.push(handle);
  const r = about[handle];
  if (Array.isArray(r)) {
    const next = r.shift();
    if (next instanceof Error) throw next;
    return next;
  }
  if (r instanceof Error) throw r;
  return r;
};
globalThis.SapuApi.rate = () => rateNow;
globalThis.SapuStore = {
  async getDaily() {
    return { date: "x", count: daily };
  },
  async bumpDaily() {
    daily += 1;
  },
};
require("../lib/engine.js");
const E = globalThis.SapuEngine;

const owner = { key: "1", userId: "1" };
const fast = { dryRun: false, dailyCap: 100, minDelaySec: 0, maxDelaySec: 0, batchSize: 3, batchPauseMinMin: 0, batchPauseMaxMin: 0 };
const users = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i + 1), handle: "u" + (i + 1) }));

function reset() {
  calls.length = 0;
  daily = 0;
  failOn = {};
}

test("selesai normal dan mencatat tiap akun", async () => {
  reset();
  const done = [];
  const res = await E.runUnfollow({ owner, queue: users(5), settings: fast, onItemDone: (u, r) => done.push([u.id, r]) });
  assert.equal(res.reason, "finished");
  assert.equal(res.done, 5);
  assert.deepEqual(calls, ["1", "2", "3", "4", "5"]);
  assert.equal(done.length, 5);
});

test("mode simulasi tidak pernah memanggil API unfollow", async () => {
  reset();
  const res = await E.runUnfollow({ owner, queue: users(3), settings: { ...fast, dryRun: true } });
  assert.equal(res.done, 3);
  assert.equal(calls.length, 0);
  assert.equal(daily, 0);
});

test("berhenti saat batas harian tercapai", async () => {
  reset();
  daily = 98;
  const res = await E.runUnfollow({ owner, queue: users(5), settings: fast });
  assert.equal(res.reason, "cap");
  assert.equal(calls.length, 2);
});

test("rate limit (429) menghentikan seluruh proses", async () => {
  reset();
  failOn = { 2: apiError(429, 88) };
  const res = await E.runUnfollow({ owner, queue: users(5), settings: fast });
  assert.equal(res.reason, "error");
  assert.equal(res.error.status, 429);
  assert.deepEqual(calls, ["1", "2"]);
});

test("403 tak dikenal juga menghentikan proses", async () => {
  reset();
  failOn = { 1: apiError(403, 326) };
  const res = await E.runUnfollow({ owner, queue: users(3), settings: fast });
  assert.equal(res.reason, "error");
  assert.equal(calls.length, 1);
});

test("akun yang sudah hilang (kode 34/50/63/108) dilewati, proses lanjut", async () => {
  reset();
  failOn = { 2: apiError(404, 34) };
  const res = await E.runUnfollow({ owner, queue: users(3), settings: fast });
  assert.equal(res.reason, "finished");
  assert.equal(res.done, 2);
  assert.equal(res.skipped, 1);
  assert.equal(daily, 2);
});

test("tombol stop (abort) menghentikan di tengah jeda", async () => {
  reset();
  const ctrl = new AbortController();
  const slow = { ...fast, minDelaySec: 5, maxDelaySec: 5 };
  setTimeout(() => ctrl.abort(), 50);
  await assert.rejects(E.runUnfollow({ owner, queue: users(3), settings: slow, signal: ctrl.signal }), { name: "AbortError" });
  assert.deepEqual(calls, ["1"]);
});

test("scan menggabungkan semua halaman dan berhenti di cursor 0", async () => {
  pages = [
    { users: [{ id_str: "1", screen_name: "a", status: { created_at: "Wed Oct 10 20:19:24 +0000 2018" } }], next_cursor_str: "123" },
    { users: [{ id_str: "2", screen_name: "b" }, { id_str: "1", screen_name: "a" }], next_cursor_str: "0" },
  ];
  const list = await E.scanFollowing({ owner });
  assert.deepEqual(list.map((u) => u.handle).sort(), ["a", "b"]);
});

const aboutJson = (based, accurate = true) => ({ data: { user_result_by_screen_name: { result: { __typename: "User", about_profile: { account_based_in: based, location_accurate: accurate } } } } });

test("checkLocations: membaca Account based in, akun hilang ditandai none", async () => {
  aboutCalls.length = 0;
  rateNow = null;
  about = { a: aboutJson("India"), b: aboutJson("Indonesia", false), c: { data: { user_result_by_screen_name: {} } }, d: apiError(404, 50) };
  about.d.status = 200; // error per-akun dengan kode "user not found"
  const got = [];
  const res = await E.checkLocations({ accounts: ["a", "b", "c", "d"].map((h, i) => ({ id: String(i), handle: h })), delay: [0, 0], onResult: (u, r) => got.push([u.handle, r]) });
  assert.equal(res.reason, "finished");
  assert.deepEqual(got, [["a", { based: "India", accurate: true }], ["b", { based: "Indonesia", accurate: false }], ["c", { none: true }], ["d", { none: true }]]);
});

test("checkLocations: query ID kedaluwarsa (404) berhenti dengan reason query", async () => {
  about = { a: aboutJson("India"), b: apiError(404, null) };
  const res = await E.checkLocations({ accounts: [{ id: "1", handle: "a" }, { id: "2", handle: "b" }, { id: "3", handle: "c" }], delay: [0, 0] });
  assert.equal(res.reason, "query");
  assert.equal(res.done, 1);
});

test("checkLocations: sesi bermasalah (401) berhenti dengan error", async () => {
  about = { a: apiError(401, 32) };
  const res = await E.checkLocations({ accounts: [{ id: "1", handle: "a" }], delay: [0, 0] });
  assert.equal(res.reason, "error");
});

test("checkLocations: menunggu kalau jatah hampir habis, lalu lanjut", async () => {
  aboutCalls.length = 0;
  about = { a: aboutJson("India"), b: aboutJson("Japan") };
  rateNow = { limit: 50, remaining: 0, resetAt: Date.now() - 60000 }; // reset sudah lewat -> tunggu minimum
  const ac = new AbortController();
  const msgs = [];
  const p = E.checkLocations({ accounts: [{ id: "1", handle: "a" }, { id: "2", handle: "b" }], delay: [0, 0], signal: ac.signal, onProgress: (x) => msgs.push(x.message) });
  await new Promise((r) => setTimeout(r, 1200));
  ac.abort(); // tes tidak menunggu 30 detik; cukup pastikan ia memang menunggu
  await assert.rejects(p, { name: "AbortError" });
  assert.deepEqual(aboutCalls, ["a"]);
  assert.ok(msgs.some((m) => /engine\.geoRateWait/.test(m)), msgs.join("|"));
  rateNow = null;
});
