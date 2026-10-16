/*
 * SapuX: mesin scan & unfollow.
 *
 * Prinsip keamanan:
 *  - jeda acak antar unfollow + istirahat panjang tiap batch
 *  - batas harian yang dicek sebelum SETIAP unfollow
 *  - berhenti total begitu X membalas rate limit / penguncian / error tak dikenal
 */
(function () {
  "use strict";

  const { normalizeUser, randInt, formatClock } = globalThis.SapuCore;
  const Api = globalThis.SapuApi;
  const Store = globalThis.SapuStore;
  const t = (key, params) => (globalThis.SapuI18n ? globalThis.SapuI18n.t(key, params) : key);

  // Akun target sudah hilang/ditangguhkan: lewati dan lanjut.
  const SKIP_CODES = new Set([34, 50, 63, 108]);

  function abortError() {
    const e = new Error("Dihentikan.");
    e.name = "AbortError";
    return e;
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const timer = setTimeout(done, Math.max(0, ms));
      function done() {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }
      function onAbort() {
        clearTimeout(timer);
        reject(abortError());
      }
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  async function countdown(ms, label, onTick, signal) {
    const end = Date.now() + ms;
    for (;;) {
      const left = end - Date.now();
      if (left <= 0) return;
      onTick?.(`${label} ${formatClock(left / 1000)}`);
      await sleep(Math.min(1000, left), signal);
    }
  }

  /** Ambil seluruh daftar following (200 per halaman). */
  async function scanFollowing({ owner, signal, onProgress }) {
    const users = new Map();
    let cursor = "-1";
    let page = 0;
    let rateWaits = 0;

    while (cursor && cursor !== "0") {
      if (signal?.aborted) throw abortError();
      try {
        const res = await Api.getFollowingPage(owner, cursor);
        page += 1;
        for (const raw of res?.users ?? []) {
          const user = normalizeUser(raw);
          if (user.id) users.set(user.id, user);
        }
        cursor = res?.next_cursor_str ?? String(res?.next_cursor ?? "0");
        onProgress?.({ count: users.size, message: t("engine.page", { p: page, n: users.size }) });
        if (cursor !== "0") await sleep(randInt(1500, 3500), signal);
      } catch (err) {
        if (err.name === "AbortError") throw err;
        // Scan hanya membaca data, jadi aman menunggu rate limit reda lalu lanjut.
        if ((err.status === 429 || err.code === 88) && rateWaits < 4) {
          rateWaits += 1;
          const resetAt = err.resetAt ?? Date.now() + 15 * 60 * 1000;
          const wait = Math.min(16 * 60 * 1000, Math.max(60 * 1000, resetAt - Date.now() + 5000));
          await countdown(wait, t("engine.rateWait", { n: users.size }), (m) => onProgress?.({ count: users.size, message: m }), signal);
          continue;
        }
        throw err;
      }
    }
    return [...users.values()];
  }

  /**
   * Unfollow akun di `queue` satu per satu.
   * Hasil: { reason: "finished" | "cap" | "error", done, skipped, error? }
   * Melempar AbortError kalau dihentikan lewat `signal`.
   */
  async function runUnfollow({ owner, queue, settings, signal, onProgress, onItemDone }) {
    const s = settings;
    const total = queue.length;
    let done = 0;
    let skipped = 0;

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw abortError();
      const user = queue[i];

      if (!s.dryRun) {
        const daily = await Store.getDaily(owner.key);
        if (daily.count >= s.dailyCap) return { reason: "cap", done, skipped };
      }

      onProgress?.({ index: i, total, message: t(s.dryRun ? "engine.simUnfollow" : "engine.unfollow", { h: user.handle }) });

      let result = "ok";
      if (!s.dryRun) {
        try {
          await Api.unfollow(user.id);
          await Store.bumpDaily(owner.key);
        } catch (err) {
          if (SKIP_CODES.has(err.code)) result = "skip";
          else return { reason: "error", error: err, done, skipped };
        }
      }
      if (result === "ok") done += 1;
      else skipped += 1;
      await onItemDone?.(user, result);

      if (i < total - 1) {
        const batchEnd = (i + 1) % s.batchSize === 0;
        let ms;
        let label;
        if (s.dryRun) {
          ms = 120;
          label = t("engine.simRunning");
        } else if (batchEnd) {
          ms = randInt(s.batchPauseMinMin * 60000, s.batchPauseMaxMin * 60000);
          label = t("engine.batchBreak");
        } else {
          ms = randInt(s.minDelaySec * 1000, s.maxDelaySec * 1000);
          label = t("engine.next");
        }
        await countdown(ms, label, (m) => onProgress?.({ index: i + 1, total, message: m }), signal);
      }
    }
    return { reason: "finished", done, skipped };
  }

  /**
   * Cek "Account based in" untuk `accounts` satu per satu (hanya membaca data).
   * Jeda acak antar request, dan menunggu sampai jatah X pulih kalau hampir habis.
   * Hasil: { reason: "finished" | "query" | "error", done, error? }. Melempar AbortError kalau dihentikan.
   */
  async function checkLocations({ accounts, signal, onProgress, onResult, delay = [1500, 3500] }) {
    const Geo = globalThis.SapuGeo;
    const total = accounts.length;
    let done = 0;
    let rateWaits = 0;
    const waitUntil = async (resetAt, index) => {
      const wait = Math.min(16 * 60 * 1000, Math.max(30 * 1000, (resetAt ?? Date.now() + 15 * 60 * 1000) - Date.now() + 3000));
      await countdown(wait, t("engine.geoRateWait"), (m) => onProgress?.({ index, total, message: m }), signal);
    };

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw abortError();
      const user = accounts[i];
      onProgress?.({ index: i, total, message: t("engine.geoCheck", { h: user.handle }) });

      let result;
      try {
        result = Geo.parseAbout(await Api.getAbout(user.handle));
        rateWaits = 0;
      } catch (err) {
        if (err.name === "AbortError") throw err;
        if ((err.status === 429 || err.code === 88) && rateWaits < 4) {
          rateWaits += 1;
          await waitUntil(err.resetAt, i);
          i -= 1; // ulangi akun yang sama
          continue;
        }
        if (err.status === 400 || err.status === 404) return { reason: "query", done, error: err };
        if (SKIP_CODES.has(err.code)) result = { none: true };
        else return { reason: "error", done, error: err };
      }
      done += 1;
      await onResult?.(user, result);

      if (i < total - 1) {
        const r = Api.rate?.();
        if (r && Number.isFinite(r.remaining) && r.remaining <= 1) await waitUntil(r.resetAt, i + 1);
        else await sleep(randInt(delay[0], delay[1]), signal);
      }
    }
    return { reason: "finished", done };
  }

  globalThis.SapuEngine = { scanFollowing, runUnfollow, checkLocations, sleep };
})();
