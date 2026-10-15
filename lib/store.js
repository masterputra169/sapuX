/*
 * SapuX: penyimpanan lokal (chrome.storage.local, hanya di komputer kamu).
 * Yang disimpan: pengaturan, hasil scan, riwayat unfollow, hitungan harian.
 * Token/cookie TIDAK pernah disimpan di sini.
 */
(function () {
  "use strict";

  const { sanitizeSettings, localDateKey } = globalThis.SapuCore;
  const LOG_MAX = 5000;

  /** Ekstensi di-reload/di-update saat tab masih terbuka: script lama ini tidak bisa lagi mengakses storage. */
  function contextGone() {
    const e = new Error(globalThis.SapuI18n ? globalThis.SapuI18n.t("err.contextGone") : "Extension context invalidated");
    e.code = "CONTEXT_GONE";
    return e;
  }

  function area() {
    if (!chrome.runtime?.id) throw contextGone();
    return chrome.storage.local;
  }

  async function guard(op) {
    try {
      return await op();
    } catch (e) {
      if (!chrome.runtime?.id || /context invalidated/i.test(String(e?.message))) throw contextGone();
      throw e;
    }
  }

  async function get(key, fallback) {
    const r = await guard(() => area().get(key));
    return r[key] ?? fallback;
  }

  function set(key, value) {
    return guard(() => area().set({ [key]: value }));
  }

  const Store = {
    async getSettings() {
      return sanitizeSettings(await get("settings", {}));
    },

    async saveSettings(next) {
      const clean = sanitizeSettings(next);
      await set("settings", clean);
      return clean;
    },

    getScan(ownerKey) {
      return get(`scan:${ownerKey}`, null);
    },

    saveScan(ownerKey, scan) {
      return set(`scan:${ownerKey}`, scan);
    },

    async getDaily(ownerKey) {
      const today = localDateKey();
      const d = await get(`daily:${ownerKey}`, null);
      return d && d.date === today ? d : { date: today, count: 0 };
    },

    async bumpDaily(ownerKey) {
      const d = await Store.getDaily(ownerKey);
      d.count += 1;
      await set(`daily:${ownerKey}`, d);
      return d;
    },

    getLog(ownerKey) {
      return get(`log:${ownerKey}`, []);
    },

    async addLog(ownerKey, entry) {
      const log = await Store.getLog(ownerKey);
      log.unshift(entry);
      if (log.length > LOG_MAX) log.length = LOG_MAX;
      await set(`log:${ownerKey}`, log);
      return log;
    },

    async updateLog(ownerKey, match, patch) {
      const log = await Store.getLog(ownerKey);
      const entry = log.find((e) => e.id === match.id && e.at === match.at);
      if (entry) Object.assign(entry, patch);
      await set(`log:${ownerKey}`, log);
      return log;
    },

    async clearSimulations(ownerKey) {
      const log = (await Store.getLog(ownerKey)).filter((e) => e.result !== "simulasi");
      await set(`log:${ownerKey}`, log);
      return log;
    },

    /** Antrean unfollow yang tersisa (dilanjutkan nanti). */
    getQueue(ownerKey) {
      return get(`queue:${ownerKey}`, null);
    },

    saveQueue(ownerKey, queue) {
      return set(`queue:${ownerKey}`, queue);
    },

    clearQueue(ownerKey) {
      return guard(() => area().remove(`queue:${ownerKey}`));
    },

    clearAll() {
      return guard(() => area().clear());
    },
  };

  globalThis.SapuStore = Store;
})();
