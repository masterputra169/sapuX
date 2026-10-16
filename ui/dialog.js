/*
 * SapuX panel: dialog
 *
 * Dialog konfirmasi buatan sendiri (pengganti window.confirm).
 * File-file ui/*.js dimuat berurutan sebagai content script dan berbagi scope global
 * (dunia terisolasi ekstensi, tidak terlihat oleh halaman x.com). ui/panel.js memasang panel.
 */
"use strict";

// ---------- dialog konfirmasi ----------
// Pengganti window.confirm: dirender di dalam panel (Shadow DOM), mengikuti tema & bahasa SapuX.
let activeDialog = null;

/**
 * Buka dialog konfirmasi. Hasil: Promise<boolean> (true = dikonfirmasi).
 * Esc / klik di luar / Batal = false. Fokus dikunci di dalam dialog dan dikembalikan saat ditutup.
 */
function confirmDialog({ tone = "amber", iconName = "info", eyebrow = "", title, sub = "", body = [], confirmLabel, confirmIcon = null, confirmClass = "primary", focus = "confirm" }) {
  activeDialog?.close(false);
  return new Promise((resolve) => {
    const previousFocus = shadow.activeElement;
    const cancelBtn = h("button", { class: "btn", type: "button", onclick: () => close(false) }, t("dlg.cancel"));
    const okBtn = h("button", { class: "btn " + confirmClass, type: "button", onclick: () => close(true) }, confirmIcon ? icon(confirmIcon, 16) : null, confirmLabel);
    const box = h(
      "div",
      { class: "dialog", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "sapux-dlg-title", "aria-describedby": "sapux-dlg-sub", tabindex: "-1" },
      h(
        "div",
        { class: "dlg-head" },
        h("span", { class: `dlg-icon ${tone}` }, icon(iconName, 20)),
        h("div", null, eyebrow ? h("div", { class: "dlg-eyebrow" }, eyebrow) : null, h("h2", { class: "dlg-title", id: "sapux-dlg-title" }, title), sub ? h("p", { class: "dlg-sub", id: "sapux-dlg-sub" }, sub) : null)
      ),
      body,
      h("div", { class: "dlg-actions" }, cancelBtn, okBtn)
    );
    const layer = h("div", { class: "scrim", onmousedown: (e) => { if (e.target === layer) close(false); } }, box);
    layer.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      } else if (e.key === "Tab") {
        const items = [...box.querySelectorAll("button:not(:disabled), a[href]")];
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && shadow.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && shadow.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    ui.panel.append(layer);
    (focus === "cancel" ? cancelBtn : okBtn).focus();

    function close(result) {
      if (!layer.isConnected) return;
      layer.remove();
      activeDialog = null;
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(result);
    }
    activeDialog = { close };
  });
}

function statTile(label, value, note, cls = "") {
  return h("div", { class: "stat" + (cls ? " " + cls : "") }, h("div", { class: "stat-label" }, label), h("div", { class: "stat-value" }, value), note ? h("div", { class: "stat-note" }, note) : null);
}

/** Isi dialog sebelum unfollow/simulasi: angka utama, komposisi antrean, peringatan. */
function runDialogBody({ batch, rest, s, live }) {
  const loc = I18n.locale();
  const byStatus = (status) => batch.filter((r) => r.status === status).length;
  const parts = CANDIDATES.map((g) => [g, byStatus(g)]).filter(([, c]) => c > 0);
  const body = [];

  if (live) {
    const left = capUsage(s).left;
    const tiles = [statTile(t("dlg.stat.now"), batch.length.toLocaleString(loc), t("dlg.stat.nowNote", { left, cap: s.dailyCap }), "danger")];
    if (rest > 0) tiles.push(statTile(t("dlg.stat.queue"), rest.toLocaleString(loc), t("dlg.stat.queueNote")));
    // Perkiraan dibulatkan ke menit supaya muat di kartu ("≈ 1 h 38 min", bukan "1 h 37 min 52 s").
    const secs = C.estimateSeconds(batch.length, s);
    const eta = secs >= 60 ? "≈ " + I18n.duration(Math.round(secs / 60) * 60) : I18n.duration(secs);
    tiles.push(statTile(t("dlg.stat.time"), eta, t("dlg.stat.timeNote")));
    body.push(h("div", { class: "dlg-stats", style: `grid-template-columns: repeat(${tiles.length - 1}, minmax(0, 1fr)) minmax(0, 1.5fr)` }, tiles));
  }

  if (parts.length) {
    body.push(
      h(
        "div",
        { class: "dlg-section" },
        h("div", { class: "dlg-label" }, t("dlg.includes")),
        h("div", { class: "dlg-mix" }, parts.map(([g, c]) => h("span", { class: "mix" }, h("i", { class: `dot ${g}` }), t("group." + g), h("b", null, c.toLocaleString(loc)))))
      )
    );
  }

  if (live) {
    const warnings = [
      byStatus("small") ? t("confirm.small", { n: byStatus("small"), f: n(s.smallMaxFollowers) }) : "",
      byStatus("oneway") ? t("confirm.oneway", { n: byStatus("oneway") }) : "",
      byStatus("unknown") ? t("confirm.unknown", { n: byStatus("unknown") }) : "",
    ].filter(Boolean);
    if (warnings.length) body.push(h("ul", { class: "dlg-warn" }, warnings.map((w) => h("li", null, icon("warning", 15), h("span", null, w)))));
    const focusCount = batch.filter((r) => r.focus).length;
    if (focusCount) body.push(h("div", { class: "dlg-foot" }, icon("globe-simple", 14), h("span", null, t("dlg.focus", { n: focusCount }))));
    body.push(h("div", { class: "dlg-foot" }, icon("arrow-u-up-left", 14), h("span", null, t("confirm.undo"))));
  }
  return body;
}
