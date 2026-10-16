/*
 * SapuX panel: aksi
 *
 * Scan, unfollow, antrean, notifikasi, dan export CSV.
 * File-file ui/*.js dimuat berurutan sebagai content script dan berbagi scope global
 * (dunia terisolasi ekstensi, tidak terlihat oleh halaman x.com). ui/panel.js memasang panel.
 */
"use strict";

// ---------- aksi ----------
function stop() {
  state.abort?.abort();
}

function rerenderAll() {
  if (state.tab === "clean") renderClean();
  else renderCurrent();
  renderSummary();
  renderActions();
}

async function startScan() {
  if (state.busy) return;
  state.owner = Api.getOwner();
  if (!state.owner) return setStatus(t("status.notLoggedIn"), "error");
  state.busy = "scan";
  state.abort = new AbortController();
  rerenderAll();
  setStatus(t("status.scanStart"));
  try {
    const fresh = await Engine.scanFollowing({ owner: state.owner, signal: state.abort.signal, onProgress: (p) => setStatus(p.message) });
    // Bandingkan dengan scan sebelumnya: following yang berubah = masih aktif diam-diam.
    const previous = (await Store.getScan(state.owner.key))?.users || [];
    const users = C.mergeScan(previous, fresh, Date.now());
    state.scan = { scannedAt: new Date().toISOString(), users };
    await Store.saveScan(state.owner.key, state.scan);
    state.filter = "inactive";
    state.page = 0;
    state.query = "";
    state.follow = "all";
    resetSelection();
    state.busy = null;
    setStatus(t("status.scanDone", { n: users.length }), "ok");
  } catch (e) {
    state.busy = null;
    if (isContextGone(e)) return showStale();
    setStatus(e.name === "AbortError" ? t("status.scanStopped") : t("status.scanFailed", { e: Api.describeError(e) }), e.name === "AbortError" ? "" : "error");
  } finally {
    state.busy = null;
    state.abort = null;
    if (!state.stale) rerenderAll();
  }
}

/** `explicitQueue`: dipakai saat melanjutkan antrean tersimpan; selain itu memakai pilihan di daftar. */
async function startUnfollow(explicitQueue) {
  if (state.busy || !state.scan) return;
  const queue = Array.isArray(explicitQueue) ? explicitQueue : queueFrom(computeRows());
  if (!queue.length) return setStatus(t("status.noneSelected"));

  const s = { ...state.settings };
  const owner = state.owner;
  state.daily = await Store.getDaily(owner.key);
  const remaining = s.dryRun ? queue.length : Math.max(0, s.dailyCap - state.daily.count);
  if (remaining === 0) return setStatus(t("status.capReached", { cap: s.dailyCap }), "error");
  const count = Math.min(queue.length, remaining);
  const resuming = Array.isArray(explicitQueue);
  const live = !s.dryRun;
  const ok = await confirmDialog({
    tone: live ? "danger" : "amber",
    iconName: live ? "user-minus" : "play",
    eyebrow: t(live ? (resuming ? "dlg.eyebrow.resume" : "dlg.eyebrow.live") : "dlg.eyebrow.sim"),
    title: t(live ? "dlg.live.title" : "dlg.sim.title", { n: count.toLocaleString(I18n.locale()) }),
    sub: t(live ? "dlg.live.sub" : "dlg.sim.sub"),
    body: runDialogBody({ batch: queue.slice(0, count), rest: queue.length - count, s, live }),
    confirmLabel: t(live ? "btn.unfollow" : "btn.simulate", { n: count }),
    confirmIcon: live ? "user-minus" : "play",
    confirmClass: live ? "danger" : "primary",
    // Mode asli: fokus awal di Batal, jadi Enter yang tidak sengaja tidak langsung memulai unfollow.
    focus: live ? "cancel" : "confirm",
  });
  if (!ok || state.busy || state.stale) return;

  state.busy = "unfollow";
  state.abort = new AbortController();
  // Mode asli: seluruh antrean disimpan dulu, lalu dikurangi per akun. Kalau berhenti (jatah habis,
  // error, tombol Stop, tab ditutup), sisanya bisa dilanjutkan nanti dari kartu antrean.
  if (!s.dryRun) {
    state.queue = { savedAt: new Date().toISOString(), ids: queue.map((r) => r.id) };
    await Store.saveQueue(owner.key, state.queue);
  }
  refreshList();
  let outcome = null;
  try {
    const res = await Engine.runUnfollow({
      owner,
      queue: queue.slice(0, count),
      settings: s,
      signal: state.abort.signal,
      onProgress: (p) => setStatus(p.message, "", p),
      onItemDone: async (user, result) => {
        state.log = await Store.addLog(owner.key, {
          id: user.id,
          handle: user.handle,
          name: user.name,
          at: new Date().toISOString(),
          result: s.dryRun ? "simulasi" : result === "ok" ? "unfollowed" : "dilewati",
        });
        if (!s.dryRun) {
          state.scan.users = state.scan.users.filter((u) => u.id !== user.id);
          state.selected.delete(user.id);
          await Store.saveScan(owner.key, state.scan);
          if (state.queue) {
            state.queue = { ...state.queue, ids: state.queue.ids.filter((id) => id !== user.id) };
            await Store.saveQueue(owner.key, state.queue);
          }
          state.daily = await Store.getDaily(owner.key);
        }
        renderCurrent();
      },
    });
    state.busy = null;
    const verb = t(s.dryRun ? "done.simVerb" : "done.liveVerb");
    const skipped = res.skipped ? t("done.skipped", { n: res.skipped }) : "";
    const left = s.dryRun ? 0 : await settleQueue(owner);
    const saved = left ? t("queue.saved", { n: left }) : "";
    // Selesai tapi sebagian antrean tidak dijalankan karena jatah harian = sama dengan "jatah habis".
    const reason = res.reason === "finished" && count < queue.length ? "cap" : res.reason;
    if (reason === "finished") outcome = { kind: "done", text: t("done.finished", { n: res.done, verb, skipped }) + saved, status: "ok", progress: { index: count, total: count } };
    else if (reason === "cap") outcome = { kind: "cap", text: t("done.cap", { cap: s.dailyCap, n: res.done, verb, skipped }) + saved, status: "ok" };
    else outcome = { kind: "error", text: t("done.error", { n: res.done, verb, e: Api.describeError(res.error) }) + saved, status: "error" };
    setStatus(outcome.text, outcome.status, outcome.progress);
  } catch (e) {
    state.busy = null;
    if (isContextGone(e)) return showStale();
    const left = s.dryRun ? 0 : await settleQueue(owner).catch(() => 0);
    const saved = left ? t("queue.saved", { n: left }) : "";
    if (e.name === "AbortError") setStatus(t("status.stopped") + saved);
    else {
      outcome = { kind: "error", text: t("status.error", { e: Api.describeError(e) }) + saved, status: "error" };
      setStatus(outcome.text, "error");
    }
  } finally {
    state.busy = null;
    state.abort = null;
    if (!state.stale) rerenderAll();
  }
  if (outcome && !s.dryRun) notify(outcome.kind, outcome.text);
}

/** Setelah proses asli: buang antrean kalau sudah habis, kembalikan jumlah sisanya. */
async function settleQueue(owner) {
  const left = state.queue?.ids?.length || 0;
  if (!left) {
    state.queue = null;
    await Store.clearQueue(owner.key);
  }
  return left;
}

/** Notifikasi desktop lewat service worker (hanya mode asli, hanya kalau diaktifkan di Aturan). */
function notify(kind, message) {
  if (!state.settings.notifications) return;
  try {
    chrome.runtime.sendMessage({ type: "sapux:notify", title: t("notify." + kind), message: message.trim() }).catch(() => {});
  } catch {
    /* konteks ekstensi hilang: abaikan */
  }
}

function download(filename, text, type = "text/csv;charset=utf-8") {
  const bom = type.startsWith("text/csv") ? "﻿" : "";
  const url = URL.createObjectURL(new Blob([bom + text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function exportScanCsv() {
  const groups = computeRows();
  if (!groups) return;
  const all = GROUPS.flatMap((g) => groups[g]);
  const category = (r) => (r.shield ? `kept:${r.shield}` : r.status === "unknown" ? "no_data" : r.status);
  const csv = C.toCsv(all, [
    { label: "handle", get: (r) => r.handle },
    { label: "name", get: (r) => r.name },
    { label: "user_id", get: (r) => r.id },
    { label: "category", get: category },
    { label: "last_post", get: (r) => r.lastTweetAt ?? "" },
    { label: "days_inactive", get: (r) => r.days ?? "" },
    { label: "followers", get: (r) => r.followers },
    { label: "follows_you", get: (r) => (r.followedBy ? "yes" : "no") },
    { label: "active_quietly", get: (r) => (r.quiet ? "yes" : "no") },
    { label: "bio_location", get: (r) => r.location || "" },
    { label: "guessed_country", get: (r) => r.geo?.country || "" },
    { label: "guessed_region", get: (r) => r.geo?.region || "" },
    { label: "location_source", get: (r) => r.geo?.source || "" },
    { label: "location_confidence", get: (r) => r.geo?.confidence || "" },
    { label: "x_account_based_in", get: (r) => r.basedIn || "" },
    { label: "x_location_accurate", get: (r) => (r.basedIn ? (r.basedAccurate === false ? "no" : "yes") : "") },
    { label: "priority_place", get: (r) => (r.focus ? "yes" : "no") },
    { label: "selected", get: (r) => (state.selected.has(r.id) ? "yes" : "no") },
    { label: "url", get: (r) => `https://x.com/${r.handle}` },
  ]);
  download(`sapux-following-${C.localDateKey()}.csv`, csv);
  setStatus(t("status.csvDone", { n: all.length }), "ok");
}
