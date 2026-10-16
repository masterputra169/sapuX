/*
 * SapuX panel: tab Rules
 *
 * Form aturan, lokasi, kecepatan, backup, dan hapus data.
 * File-file ui/*.js dimuat berurutan sebagai content script dan berbagi scope global
 * (dunia terisolasi ekstensi, tidak terlihat oleh halaman x.com). ui/panel.js memasang panel.
 */
"use strict";

// ---------- tab: Rules ----------
function renderSettings() {
  const s = state.settings;
  const f = {};
  let paceSync = null; // diisi paceButtons(); dipanggil saat angka jeda diubah manual
  const num = (key, unit, attrs = {}) => h("label", { class: "unit" }, (f[key] = h("input", { type: "number", inputmode: "numeric", value: String(s[key]), ...attrs })), unit ? h("span", null, unit) : null);
  const field = (label, control, help) => h("div", { class: "field" }, h("span", { class: "lbl" }, label), control, help ? h("span", { class: "help" }, help) : null);
  const sw = (key, label, help) =>
    h("label", { class: "switch" }, (f[key] = h("input", { type: "checkbox", role: "switch", checked: Boolean(s[key]) })), h("span", null, h("span", { class: "lbl" }, label), help ? h("div", { class: "help" }, help) : null));
  const preset = (key, value, label) => h("button", { class: "preset", type: "button", onclick: () => { f[key].value = String(value); } }, label);
  /** Bagian yang bisa dilipat; status buka/tutup diingat (per browser). */
  const fold = (id, title, summary, ...children) => {
    const d = h(
      "details",
      {
        class: "group fold",
        "data-fold": id,
        open: state.rulesOpen.has(id),
        ontoggle: () => {
          if (d.open) state.rulesOpen.add(id);
          else state.rulesOpen.delete(id);
          saveFolds();
        },
      },
      h("summary", { class: "fold-head" }, h("span", { class: "group-title" }, title), summary ? h("span", { class: "fold-sum" }, summary) : h("span", { class: "fold-sum" }), h("i", { class: "chev", "aria-hidden": "true" })),
      h("div", { class: "fold-body" }, children)
    );
    return d;
  };

  f.whitelist = h("textarea", { rows: "5", placeholder: t("rules.whitelist.placeholder"), "aria-label": t("rules.whitelist") });
  f.whitelist.value = s.whitelist;

  const modeCard = h("div", { class: "modecard" + (s.dryRun ? "" : " live") }, sw("dryRun", t("rules.mode.title"), t("rules.mode.help")));
  f.dryRun.addEventListener("change", () => modeCard.classList.toggle("live", !f.dryRun.checked));

  const form = h(
    "form",
    { class: "form", onsubmit: saveSettings },
    modeCard,
    fold(
      "who",
      t("rules.who"),
      null,
      field(
        t("rules.threshold"),
        h("div", { class: "inputrow" }, num("thresholdDays", t("unit.days"), { min: "30", max: "3650" }), h("span", { class: "presets" }, preset("thresholdDays", 180, t("preset.6m")), preset("thresholdDays", 365, t("preset.1y")), preset("thresholdDays", 730, t("preset.2y"))))
      ),
      field(
        t("rules.protectBig"),
        h(
          "div",
          { class: "inputrow" },
          num("protectMinFollowers", t("unit.followers"), { min: "0", step: "1" }),
          h("span", { class: "presets" }, preset("protectMinFollowers", 0, t("preset.off")), preset("protectMinFollowers", 10000, n(10000)), preset("protectMinFollowers", 50000, n(50000)), preset("protectMinFollowers", 100000, n(100000)))
        ),
        t("rules.protectBig.help")
      ),
      field(
        t("rules.small"),
        h(
          "div",
          { class: "inputrow" },
          num("smallMaxFollowers", t("unit.followers"), { min: "0", step: "1" }),
          h("span", { class: "presets" }, preset("smallMaxFollowers", 0, t("preset.off")), preset("smallMaxFollowers", 50, "50"), preset("smallMaxFollowers", 100, "100"), preset("smallMaxFollowers", 500, "500"))
        ),
        t("rules.small.help")
      ),
      sw("unfollowNonFollowers", t("rules.oneway"), t("rules.oneway.help")),
      sw("protectMutuals", t("rules.mutual")),
      sw("detectQuietActivity", t("rules.quiet"), t("rules.quiet.help")),
      field(t("rules.whitelist"), f.whitelist, t("rules.whitelist.help"))
    ),
    geoSection(),
    fold(
      "speed",
      t("rules.speed"),
      t("rules.fold.speed", { cap: s.dailyCap, min: s.minDelaySec, max: s.maxDelaySec, batch: s.batchSize }),
      h("p", { class: "group-note" }, t("rules.speed.note")),
      field(t("rules.pace"), paceButtons(), t("rules.pace.help")),
      field(t("rules.cap"), num("dailyCap", t("unit.accounts"), { min: "1", max: "500" }), t("rules.cap.help")),
      h("div", { class: "grid2" }, field(t("rules.minDelay"), num("minDelaySec", t("unit.seconds"), { min: "10" })), field(t("rules.maxDelay"), num("maxDelaySec", t("unit.seconds"), { min: "10" }))),
      field(t("rules.batch"), num("batchSize", t("unit.accounts"), { min: "1", max: "50" })),
      h("div", { class: "grid2" }, field(t("rules.batchMin"), num("batchPauseMinMin", t("unit.minutes"), { min: "1" })), field(t("rules.batchMax"), num("batchPauseMaxMin", t("unit.minutes"), { min: "1" }))),
      sw("notifications", t("rules.notify"), t("rules.notify.help"))
    ),
    h("div", { class: "formactions" }, h("button", { class: "btn primary", type: "submit", disabled: Boolean(state.busy) }, icon("check-circle", 16), t("rules.save")))
  );

  /** Tiga profil kecepatan: mengisi jeda & istirahat sekaligus. Batas harian tidak diubah. */
  function paceButtons() {
    const row = h("div", { class: "chips", role: "group", "aria-label": t("rules.pace") });
    const current = () => PACES.find((p) => ["minDelaySec", "maxDelaySec", "batchSize", "batchPauseMinMin", "batchPauseMaxMin"].every((k) => Number(f[k]?.value ?? s[k]) === p.values[k]));
    const sync = () => {
      const cur = current();
      row.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pace === cur?.id)));
    };
    for (const p of PACES) {
      const per100 = I18n.duration(C.estimateSeconds(100, p.values));
      row.append(
        h(
          "button",
          {
            type: "button",
            class: "chip" + (p.id === "fast" ? " danger" : ""),
            "data-pace": p.id,
            title: t("rules.pace.per100", { t: per100 }),
            onclick: () => {
              for (const [k, v] of Object.entries(p.values)) f[k].value = String(v);
              sync();
            },
          },
          t("rules.pace." + p.id),
          h("span", { class: "chip-n" }, "≈ " + per100)
        )
      );
    }
    // sinkron setelah input angka dibuat (form dibangun lebih dulu daripada isi bagian Kecepatan)
    queueMicrotask(sync);
    row.addEventListener("input", sync);
    paceSync = sync;
    return row;
  }

  /** Bagian Lokasi: dua set chip (lindungi / unfollow duluan) + sakelar "hanya pilih lokasi prioritas". */
  function geoSection() {
    f.keepRegions = new Set(s.keepRegions);
    f.focusRegions = new Set(s.focusRegions);
    const picker = (set, other, tone, label) => {
      const chip = (code) => {
        const btn = h(
          "button",
          {
            type: "button",
            class: "chip" + (tone ? " " + tone : ""),
            "aria-pressed": String(set.has(code)),
            onclick: () => {
              const on = !set.has(code);
              if (on) {
                set.add(code);
                // satu tempat tidak bisa sekaligus dilindungi dan diprioritaskan
                if (other.delete(code)) form.querySelectorAll(`.chip[data-code="${code}"]`).forEach((b) => b !== btn && b.setAttribute("aria-pressed", "false"));
              } else set.delete(code);
              btn.setAttribute("aria-pressed", String(on));
            },
            "data-code": code,
          },
          Geo.OPTION_COUNTRIES.includes(code) ? Geo.flagEmoji(code) + " " + placeName(code) : placeName(code)
        );
        return btn;
      };
      return h(
        "div",
        { class: "geo-picks", role: "group", "aria-label": label },
        h("div", { class: "geo-row" }, h("span", { class: "geo-row-label" }, t("rules.geo.countries")), h("div", { class: "chips" }, Geo.OPTION_COUNTRIES.map(chip))),
        h("div", { class: "geo-row" }, h("span", { class: "geo-row-label" }, t("rules.geo.regions")), h("div", { class: "chips" }, Geo.OPTION_REGIONS.map(chip)))
      );
    };
    const users = state.scan?.users || [];
    const hasData = users.some((u) => "bio" in u);
    const found = hasData
      ? users.filter((u) => {
          const ab = state.about[u.id];
          return Geo.detectGeo(ab && ab.based ? { ...u, basedIn: ab.based, basedAccurate: ab.accurate } : u);
        }).length
      : 0;
    const names = (codes) => codes.map((c) => (Geo.OPTION_COUNTRIES.includes(c) ? Geo.flagEmoji(c) + " " : "") + placeName(c)).join(", ");
    const summary = s.keepRegions.length || s.focusRegions.length
      ? [s.keepRegions.length ? t("rules.fold.geoKeep", { list: names(s.keepRegions) }) : "", s.focusRegions.length ? t("rules.fold.geoFirst", { list: names(s.focusRegions) }) : ""].filter(Boolean).join(" · ")
      : t("rules.fold.off");
    return fold(
      "geo",
      t("rules.geo"),
      summary,
      h("p", { class: "group-note" }, t("rules.geo.note")),
      users.length
        ? h("p", { class: "geo-note" + (hasData ? "" : " warn") }, hasData ? t("rules.geo.coverage", { n: n(found), total: n(users.length) }) : t("rules.geo.rescan"))
        : null,
      accuracyNote(),
      (ui.geoOfficial = h("div", { class: "field" })) && renderGeoOfficial() && ui.geoOfficial,
      field(t("rules.geo.keep"), picker(f.keepRegions, f.focusRegions, "", t("rules.geo.keep")), t("rules.geo.keep.help")),
      field(t("rules.geo.focus"), picker(f.focusRegions, f.keepRegions, "danger", t("rules.geo.focus")), t("rules.geo.focus.help")),
      sw("focusOfficialOnly", t("rules.geo.officialOnly"), t("rules.geo.officialOnly.help")),
      sw("focusOnly", t("rules.geo.focusOnly"), t("rules.geo.focusOnly.help"))
    );
  }

  /** Seberapa sering tebakan profil cocok dengan data resmi X (hanya akun yang sudah dicek). */
  function accuracyNote() {
    const merged = (state.scan?.users || []).map((u) => {
      const ab = state.about[u.id];
      return ab && ab.based ? { ...u, basedIn: ab.based, basedAccurate: ab.accurate } : null;
    }).filter(Boolean);
    const m = Geo.measureAccuracy(merged);
    if (m.n < 5) return null;
    const pct = (a, b) => Math.round((a / b) * 100);
    const by = ["high", "medium", "low"]
      .filter((c) => m.byConfidence[c].n)
      .map((c) => t("rules.geo.accuracyBy", { label: t("geo.conf." + c), pct: pct(m.byConfidence[c].match, m.byConfidence[c].n) }))
      .join(" · ");
    return h("p", { class: "geo-note accuracy" }, t("rules.geo.accuracy", { pct: pct(m.match, m.n), n: n(m.n), by }));
  }

  form.addEventListener("input", () => paceSync?.());

  async function saveSettings(e) {
    e.preventDefault();
    const next = {
      lang: state.settings.lang,
      keepRegions: [...f.keepRegions],
      focusRegions: [...f.focusRegions],
      focusOnly: f.focusOnly.checked,
      focusOfficialOnly: f.focusOfficialOnly.checked,
      thresholdDays: f.thresholdDays.value,
      protectMutuals: f.protectMutuals.checked,
      protectMinFollowers: f.protectMinFollowers.value,
      smallMaxFollowers: f.smallMaxFollowers.value,
      unfollowNonFollowers: f.unfollowNonFollowers.checked,
      detectQuietActivity: f.detectQuietActivity.checked,
      notifications: f.notifications.checked,
      whitelist: f.whitelist.value,
      dryRun: f.dryRun.checked,
      dailyCap: f.dailyCap.value,
      minDelaySec: f.minDelaySec.value,
      maxDelaySec: f.maxDelaySec.value,
      batchSize: f.batchSize.value,
      batchPauseMinMin: f.batchPauseMinMin.value,
      batchPauseMaxMin: f.batchPauseMaxMin.value,
    };
    try {
      state.settings = await Store.saveSettings(next);
    } catch (err) {
      if (isContextGone(err)) return showStale();
      return setStatus(t("status.error", { e: Api.describeError(err) }), "error");
    }
    resetSelection();
    setStatus(t("status.saved"), "ok");
    renderSettings();
    renderSummary();
  }

  const fileInput = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: (e) => importBackup(e.target) });
  const backup = fold(
    "backup",
    t("rules.backup"),
    null,
    h("p", { class: "group-note" }, t("rules.backup.help")),
    h(
      "div",
      { class: "backup" },
      h("button", { class: "btn small", type: "button", onclick: exportBackup }, icon("download-simple", 14), t("rules.export")),
      h("button", { class: "btn small", type: "button", disabled: Boolean(state.busy), onclick: () => fileInput.click() }, icon("arrow-u-up-left", 14), t("rules.import")),
      fileInput
    )
  );

  const danger = h(
    "div",
    { class: "danger-zone" },
    h("span", { class: "help" }, t("rules.data")),
    h(
      "button",
      {
        class: "btn small",
        type: "button",
        disabled: Boolean(state.busy),
        onclick: async () => {
          const ok = await confirmDialog({
            tone: "danger",
            iconName: "warning",
            title: t("dlg.wipe.title"),
            sub: t("dlg.wipe.sub"),
            confirmLabel: t("rules.wipe"),
            confirmClass: "danger",
            focus: "cancel",
          });
          if (!ok) return;
          const lang = I18n.getLang();
          await Store.clearAll();
          await Store.saveSettings({ lang });
          await loadAll();
          setStatus(t("status.wiped"), "ok");
          switchTab("settings");
        },
      },
      t("rules.wipe")
    )
  );
  const health = fold("health", t("health.title"), state.health ? healthSummary() : null, healthBody());
  put(ui.body, form, health, backup, danger);
}

function healthSummary() {
  const fails = state.health.filter((i) => i.status === "fail").length;
  const warns = state.health.filter((i) => i.status === "warn").length;
  return fails ? t("health.sumFail", { n: fails }) : warns ? t("health.sumWarn", { n: warns }) : t("health.sumOk");
}

// ---------- backup aturan + whitelist ----------
function exportBackup() {
  const data = { app: "SapuX", version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(), settings: state.settings };
  download(`sapux-backup-${C.localDateKey()}.json`, JSON.stringify(data, null, 2), "application/json");
  setStatus(t("status.exported"), "ok");
}

async function importBackup(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  let data;
  try {
    if (file.size > 1_000_000) throw new Error("too big");
    data = JSON.parse(await file.text());
    if (data?.app !== "SapuX" || typeof data.settings !== "object" || data.settings === null || Array.isArray(data.settings)) throw new Error("bad");
  } catch {
    return setStatus(t("status.importFailed"), "error");
  }
  try {
    // sanitizeSettings membuang field asing dan menjaga semua angka tetap dalam batas aman.
    state.settings = await Store.saveSettings(C.sanitizeSettings(data.settings));
  } catch (e) {
    if (isContextGone(e)) return showStale();
    return setStatus(t("status.error", { e: Api.describeError(e) }), "error");
  }
  I18n.setLang(state.settings.lang);
  resetSelection();
  renderChrome();
  switchTab("settings");
  setStatus(t("status.imported"), "ok");
}
