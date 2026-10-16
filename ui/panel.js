/*
 * SapuX: panel di dalam halaman x.com.
 *
 * - Semua elemen dibuat lewat DOM API (tanpa innerHTML untuk data) dan diisolasi di Shadow DOM,
 *   jadi nama/bio akun lain tidak bisa menyuntikkan HTML/skrip ke panel.
 * - Teks lewat SapuI18n (English default, Bahasa Indonesia opsional).
 * - Tema mengikuti tema X (gelap/terang). Font Geist & ikon Phosphor dibundel di ekstensi.
 *
 * Kode panel dibagi per tanggung jawab (ui/base.js, styles.js, dialog.js, shell.js, review.js,
 * actions.js, history.js, rules.js, geo-ui.js). File ini dimuat paling akhir dan memasang panel.
 */
"use strict";

function mountSapuX() {
  // ---------- font Geist (dibundel, dimuat sebagai ArrayBuffer: tidak terkena CSP halaman) ----------
  (async function loadFont() {
    try {
      const res = await fetch(chrome.runtime.getURL("fonts/Geist-Variable.woff2"));
      const face = new FontFace("SapuX Geist", await res.arrayBuffer(), { weight: "100 900", style: "normal" });
      await face.load();
      document.fonts.add(face);
    } catch {
      /* fallback ke font sistem */
    }
  })();

  // ---------- mount ----------
  host = document.createElement("div");
  host.id = "sapux-host";
  shadow = host.attachShadow({ mode: "closed" });
  ui.root = h("div", { class: "root", "data-theme": detectTheme() });
  shadow.append(h("style", null, CSS), ui.root);
  document.documentElement.append(host);

  // Kerangka panel dibuat sekali; teks diisi ulang lewat renderChrome() saat bahasa berganti.
  ui.fabText = h("span");
  ui.fab = h("button", { class: "fab", onclick: () => toggle(true).catch(() => {}) }, logo(), ui.fabText);
  ui.owner = h("div", { class: "brand-owner" });
  ui.lang = h("div", { class: "lang", role: "group" });
  ui.close = h("button", { class: "iconbtn", onclick: () => toggle(false) }, icon("x", 18));
  ui.refresh = h("button", { class: "iconbtn refresh", onclick: () => refreshView() }, icon("arrow-clockwise", 17));
  ui.summary = h("section", { class: "summary" });
  ui.tabs = {};
  ui.tabBar = h("nav", { class: "tabs", role: "tablist" });
  ui.body = h("div", { class: "body" });
  ui.actionbar = h("div", { class: "actionbar" });
  ui.fill = h("div", { class: "progress-fill" });
  ui.progress = h("div", { class: "progress", hidden: true }, ui.fill);
  ui.counter = h("span", { class: "counter" });
  ui.status = h("span", { class: "status", role: "status", "aria-live": "polite" });
  ui.foot = h("footer", { class: "foot" }, ui.actionbar, ui.progress, h("div", { class: "statusrow" }, ui.counter, ui.status));
  ui.panel = h(
    "section",
    { class: "panel", hidden: true, role: "dialog" },
    h("header", { class: "head" }, logo(), h("div", { class: "brand" }, h("div", { class: "brand-name" }, "SapuX"), ui.owner), ui.lang, ui.refresh, ui.close),
    ui.summary,
    ui.tabBar,
    ui.body,
    ui.foot
  );
  ui.root.append(ui.fab, ui.panel);

  // ---------- event global ----------
  renderChrome();

  // Bahasa tersimpan dimuat sejak awal supaya tombol melayang langsung memakai bahasa yang benar.
  restoreFolds();
  Store.getSettings()
    .then((s) => {
      state.settings = s;
      I18n.setLang(s.lang);
      renderChrome();
    })
    .catch(() => {});

  let storageTimer = null;
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local" || !state.owner || ui.panel.hidden || state.stale) return;
    const k = state.owner.key;
    const relevant = ["settings", `scan:${k}`, `log:${k}`, `daily:${k}`, `queue:${k}`, `about:${k}`].some((key) => key in changes);
    // Saat proses berjalan di tab ini, state di memori sudah yang terbaru dan onItemDone sudah menggambar ulang.
    if (!relevant || state.busy) return;
    clearTimeout(storageTimer);
    storageTimer = setTimeout(async () => {
      try {
        await loadAll({ keepSelection: true });
        renderChrome();
        renderCurrent();
      } catch (e) {
        if (isContextGone(e)) showStale();
      }
    }, 150);
  });

  // Jatah 24 jam bergulir: slot terbuka sendiri seiring waktu. Tiap 30 detik perbarui sisa jatah
  // dan teks "slot berikutnya" di bar bawah dan kartu antrean (tanpa request ke X, tanpa membangun ulang daftar).
  setInterval(() => {
    if (state.stale || ui.panel.hidden || !state.owner || state.settings.dryRun || !state.daily.stamps.length) return;
    renderActions();
    if (state.queue && ui.queueBody?.isConnected) ui.queueBody.textContent = queueBody();
  }, 30000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !ui.panel.hidden && !state.busy && !state.stale) refreshView({ quiet: true }).catch(() => {});
  });

  chrome.runtime?.onMessage?.addListener((msg) => {
    if (msg?.type === "sapux:toggle") toggle(ui.panel.hidden).catch(() => {});
  });

  window.addEventListener("unhandledrejection", (e) => {
    if (isContextGone(e.reason)) {
      e.preventDefault();
      showStale();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || ui.panel.hidden || !e.composedPath().includes(host)) return;
    if (activeDialog) activeDialog.close(false);
    else toggle(false);
  });

  window.addEventListener("beforeunload", (e) => {
    if (state.busy === "unfollow") {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

if (SAPUX_ACTIVE) {
  globalThis.__sapuxPanel = true;
  mountSapuX();
}
