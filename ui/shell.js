/*
 * SapuX panel: kerangka
 *
 * Header, status, data, navigasi tab, ringkasan, dan layar "perlu refresh".
 * File-file ui/*.js dimuat berurutan sebagai content script dan berbagi scope global
 * (dunia terisolasi ekstensi, tidak terlihat oleh halaman x.com). ui/panel.js memasang panel.
 */
"use strict";

function renderChrome() {
  ui.root.lang = I18n.getLang();
  ui.fab.title = state.stale ? t("stale.fabTitle") : t("app.open");
  if (!state.busy && !state.stale) ui.fabText.textContent = "SapuX";
  ui.panel.setAttribute("aria-label", "SapuX");
  ui.close.setAttribute("aria-label", t("app.close"));
  ui.refresh.setAttribute("aria-label", t("app.refresh"));
  ui.refresh.title = t("app.refresh");
  ui.close.title = t("app.close");
  ui.lang.setAttribute("aria-label", t("lang.label"));
  put(
    ui.lang,
    I18n.LANGS.map((code) =>
      h("button", { "aria-pressed": String(I18n.getLang() === code), lang: code, title: code === "en" ? "English" : "Bahasa Indonesia", onclick: () => setLanguage(code) }, code.toUpperCase())
    )
  );
  ui.owner.textContent = state.owner ? (state.owner.handle ? `@${state.owner.handle}` : `ID ${state.owner.userId}`) : t("app.notLoggedIn");
  const tabs = [
    ["clean", "list-checks", t("tab.review")],
    ["log", "clock-counter-clockwise", t("tab.history")],
    ["settings", "sliders-horizontal", t("tab.rules")],
  ];
  put(
    ui.tabBar,
    tabs.map(([id, ico, label]) => (ui.tabs[id] = h("button", { class: "tab", role: "tab", "aria-selected": String(state.tab === id), onclick: () => switchTab(id) }, icon(ico, 16), label)))
  );
}

async function setLanguage(code) {
  if (code === I18n.getLang()) return;
  I18n.setLang(code);
  state.settings = { ...state.settings, lang: code };
  try {
    state.settings = await Store.saveSettings(state.settings);
  } catch (e) {
    if (isContextGone(e)) return showStale();
  }
  renderChrome();
  if (!state.stale) switchTab(state.tab);
  setStatus("");
}

function setStatus(text, kind = "", progress = null) {
  if (kind === "error" && !chrome.runtime?.id) return showStale();
  ui.status.textContent = text || "";
  ui.status.className = "status" + (kind ? " " + kind : "");
  const frac = progress && progress.total ? progress.index / progress.total : null;
  ui.progress.hidden = frac == null;
  ui.fill.style.width = frac == null ? "0" : `${Math.round(Math.min(1, Math.max(0, frac)) * 100)}%`;
  ui.counter.textContent = progress && progress.total ? `${progress.index}/${progress.total}` : "";
  if (state.busy === "scan") ui.fabText.textContent = t("fab.scanning");
  else if ((state.busy === "unfollow" || state.busy === "geo") && progress?.total) ui.fabText.textContent = `${progress.index}/${progress.total}`;
  else if (!state.busy && !state.stale) ui.fabText.textContent = "SapuX";
  syncFoot();
}

function syncFoot() {
  ui.foot.hidden = ui.actionbar.hidden && ui.progress.hidden && !ui.status.textContent;
}

// ---------- data ----------
async function loadAll({ keepSelection = false } = {}) {
  const previous = keepSelection && state.scan ? new Set(state.selected) : null;
  const previousIds = previous ? new Set(state.scan.users.map((u) => u.id)) : null;
  state.settings = await Store.getSettings();
  I18n.setLang(state.settings.lang);
  state.owner = Api.getOwner();
  if (!state.owner) {
    state.scan = null;
    state.log = [];
    state.queue = null;
    state.about = {};
    return;
  }
  state.scan = await Store.getScan(state.owner.key);
  state.daily = await Store.getDaily(state.owner.key);
  state.log = await Store.getLog(state.owner.key);
  state.queue = await Store.getQueue(state.owner.key);
  state.about = (await Store.getAbout(state.owner.key)) || {};
  resetSelection();
  if (previous) {
    // Akun yang sudah ada sebelumnya memakai pilihan lama; akun baru memakai pilihan default.
    for (const u of state.scan?.users || []) {
      if (!previousIds.has(u.id)) continue;
      if (previous.has(u.id)) state.selected.add(u.id);
      else state.selected.delete(u.id);
    }
  }
}

/**
 * Gambar ulang tab yang sedang terbuka + ringkasan + bar aksi.
 * Semua perubahan data memanggil fungsi ini, jadi tab mana pun selalu up to date.
 * Form Aturan tidak dibangun ulang supaya isian yang sedang diketik tidak hilang.
 */
function renderCurrent() {
  if (state.stale || ui.panel.hidden) return;
  const scrollTop = ui.body.scrollTop;
  if (state.tab === "clean") {
    if (ui.listWrap && state.scan) renderList();
    else renderClean();
  } else if (state.tab === "log") {
    renderLog();
    ui.body.scrollTop = scrollTop;
  }
  renderSummary();
  renderActions();
}

/** Tombol refresh: baca ulang data dari storage (tanpa request ke X), pilihan manual dipertahankan. */
async function refreshView({ quiet = false } = {}) {
  if (state.stale) return;
  ui.root.dataset.theme = detectTheme();
  ui.refresh.classList.remove("spin");
  void ui.refresh.offsetWidth;
  ui.refresh.classList.add("spin");
  if (!state.busy) {
    try {
      await loadAll({ keepSelection: true });
    } catch (e) {
      if (isContextGone(e)) return showStale();
      return setStatus(t("status.error", { e: Api.describeError(e) }), "error");
    }
  }
  renderChrome();
  if (state.tab === "settings") switchTab("settings");
  else renderCurrent();
  if (!quiet) setStatus(t("status.refreshed"), "ok");
}

function computeRows() {
  if (!state.scan) return null;
  const s = state.settings;
  const opts = {
    thresholdDays: s.thresholdDays,
    whitelist: C.parseWhitelist(s.whitelist),
    protectMutuals: s.protectMutuals,
    protectMinFollowers: s.protectMinFollowers,
    smallMaxFollowers: s.smallMaxFollowers,
    unfollowNonFollowers: s.unfollowNonFollowers,
    detectQuietActivity: s.detectQuietActivity,
    keepRegions: new Set(s.keepRegions),
    focusRegions: new Set(s.focusRegions),
    focusOfficialOnly: s.focusOfficialOnly,
  };
  const now = Date.now();
  const groups = Object.fromEntries(GROUPS.map((g) => [g, []]));
  for (const scanned of state.scan.users) {
    const a = state.about[scanned.id];
    const u = a && a.based ? { ...scanned, basedIn: a.based, basedAccurate: a.accurate } : scanned;
    const c = C.classify(u, opts, now);
    const row = { ...u, ...c };
    if (c.shield) groups.protected.push(row);
    else groups[c.status].push(row);
  }
  groups.inactive.sort((a, b) => b.days - a.days);
  groups.small.sort((a, b) => a.followers - b.followers || a.handle.localeCompare(b.handle));
  groups.oneway.sort((a, b) => a.followers - b.followers || a.handle.localeCompare(b.handle));
  groups.active.sort((a, b) => b.days - a.days);
  groups.unknown.sort((a, b) => a.handle.localeCompare(b.handle));
  groups.protected.sort((a, b) => a.handle.localeCompare(b.handle));
  return groups;
}

/** Default: "tidak aktif" + "kecil" + "sepihak" terpilih; "tanpa data" tidak. */
function resetSelection() {
  const groups = computeRows();
  let rows = groups ? [...groups.inactive, ...groups.small, ...groups.oneway] : [];
  // "Hanya pilih otomatis kandidat dari lokasi prioritas"
  if (state.settings.focusOnly && state.settings.focusRegions.length) rows = rows.filter((r) => r.focus);
  state.selected = new Set(rows.map((r) => r.id));
}

/** Antrean unfollow: kandidat dari lokasi prioritas paling depan, sisanya mengikuti urutan grup. */
function queueFrom(groups) {
  const picked = CANDIDATES.flatMap((g) => groups[g]).filter((r) => state.selected.has(r.id));
  return [...picked.filter((r) => r.focus), ...picked.filter((r) => !r.focus)];
}

/** Grup opsional (kecil, sepihak) hanya tampil kalau aturannya aktif atau masih ada isinya. */
function shownGroups(groups) {
  return GROUPS.filter((g) => !OPTIONAL_GROUPS[g] || state.settings[OPTIONAL_GROUPS[g]] || groups[g].length);
}

/** Akun di antrean tersimpan yang masih layak di-unfollow (urutan antrean dipertahankan). */
function resolveQueue(groups) {
  if (!state.queue?.ids?.length || !groups) return [];
  const byId = new Map(CANDIDATES.flatMap((g) => groups[g]).map((r) => [r.id, r]));
  return state.queue.ids.map((id) => byId.get(id)).filter(Boolean);
}

// ---------- navigasi ----------
async function toggle(open) {
  if (open && state.stale) return showStale();
  if (open) ui.root.dataset.theme = detectTheme();
  if (open && !state.busy) {
    try {
      await loadAll();
    } catch (e) {
      if (isContextGone(e)) return showStale();
      throw e;
    }
  }
  if (!open) activeDialog?.close(false);
  ui.panel.hidden = !open;
  ui.fab.hidden = open;
  if (open) {
    ui.panel.classList.remove("enter");
    void ui.panel.offsetWidth; // restart animasi masuk
    ui.panel.classList.add("enter");
    renderChrome();
    switchTab(state.tab);
  }
}

function switchTab(id) {
  state.tab = id;
  for (const [key, el] of Object.entries(ui.tabs)) el.setAttribute("aria-selected", String(key === id));
  ui.listWrap = null;
  if (id === "clean") renderClean();
  else if (id === "log") renderLog();
  else renderSettings();
  renderSummary();
  renderActions();
  ui.body.scrollTop = 0;
}

// ---------- ringkasan: angka besar + meter tumpukan ----------
function renderSummary() {
  const groups = computeRows();
  if (!state.owner || !groups) {
    put(ui.summary);
    ui.summary.hidden = true;
    return;
  }
  ui.summary.hidden = false;
  const total = state.scan.users.length || 1;
  const visible = shownGroups(groups);
  const selectedCount = queueFrom(groups).length;
  const rescan =
    state.busy === "scan"
      ? h("button", { class: "textbtn", onclick: stop }, icon("stop", 14), t("meter.stopScan"))
      : h("button", { class: "textbtn", disabled: Boolean(state.busy), onclick: startScan }, icon("arrow-clockwise", 14), t("meter.rescan"));

  const top = h(
    "div",
    { class: "summary-top" },
    h("div", null, h("div", { class: "hero-count" }, selectedCount.toLocaleString(I18n.locale())), h("div", { class: "hero-label" }, t("actions.selected", { n: "" }).trim())),
    h("div", { class: "scanline" }, h("span", null, t("meter.scanned", { n: n(state.scan.users.length), when: fmtDateTime(state.scan.scannedAt) })), rescan)
  );

  const bar = h(
    "div",
    { class: "bar", role: "img", "aria-label": `${t("meter.aria")}: ${visible.map((g) => `${t("group." + g)} ${groups[g].length}`).join(", ")}` },
    visible.filter((g) => groups[g].length).map((g) => h("div", { class: `bar-seg ${g}`, style: `flex-grow:${groups[g].length / total}`, title: `${t("group." + g)}: ${groups[g].length}` }))
  );
  const legend = h(
    "div",
    { class: "legend", style: `--cols:${visible.length > 5 ? 3 : visible.length}` },
    visible.map((g) =>
      h(
        "button",
        {
          class: "seg",
          "data-group": g,
          "aria-pressed": String(state.tab === "clean" && state.filter === g),
          onclick: () => {
            state.filter = g;
            state.page = 0;
            if (state.tab !== "clean") switchTab("clean");
            else {
              renderList();
              renderSummary();
            }
          },
        },
        h("span", { class: "seg-count" }, h("i", { class: `dot ${g}` }), h("span", null, n(groups[g].length))),
        h("span", { class: "seg-label", title: t("group." + g) }, t("group." + g))
      )
    )
  );
  put(ui.summary, top, bar, legend);
}

// ---------- ekstensi di-reload saat tab ini masih terbuka ----------
function isContextGone(e) {
  return !chrome.runtime?.id || e?.code === "CONTEXT_GONE" || /context invalidated/i.test(String(e?.message));
}

function showStale() {
  state.stale = true;
  activeDialog?.close(false);
  state.abort?.abort();
  ui.fabText.textContent = t("stale.btn");
  ui.fab.title = t("stale.fabTitle");
  ui.summary.hidden = true;
  ui.tabBar.hidden = true;
  ui.foot.hidden = true;
  put(
    ui.body,
    h(
      "div",
      { class: "empty" },
      logo(),
      h("div", { class: "empty-title" }, t("stale.title")),
      h("p", null, t("stale.body")),
      h("button", { class: "btn primary", onclick: () => location.reload() }, icon("arrow-clockwise", 16), t("stale.btn"))
    )
  );
  ui.panel.hidden = false;
  ui.fab.hidden = true;
}
