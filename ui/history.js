/*
 * SapuX panel: tab History
 *
 * Riwayat unfollow, follow lagi, dan export.
 * File-file ui/*.js dimuat berurutan sebagai content script dan berbagi scope global
 * (dunia terisolasi ekstensi, tidak terlihat oleh halaman x.com). ui/panel.js memasang panel.
 */
"use strict";

// ---------- tab: History ----------
function renderLog() {
  if (!state.owner) {
    put(ui.body, h("div", { class: "empty" }, logo(), h("div", { class: "empty-title" }, t("empty.login.title"))));
    return;
  }
  const log = state.log;
  if (!log.length) {
    put(ui.body, h("div", { class: "empty" }, logo(), h("div", { class: "empty-title" }, t("history.empty.title")), h("p", null, t("history.empty.body"))));
    return;
  }
  const real = log.filter((e) => e.result === "unfollowed").length;
  const sims = log.filter((e) => e.result === "simulasi").length;
  const header = h(
    "div",
    { class: "toolbar" },
    h("span", { class: "num" }, t("history.summary", { real, sim: sims })),
    h(
      "span",
      { class: "toolbar-actions" },
      sims ? h("button", { class: "textbtn", disabled: Boolean(state.busy), onclick: clearSimulations }, t("history.clearSim")) : null,
      h("button", { class: "textbtn", onclick: exportLogCsv }, icon("download-simple", 14), t("history.csv"))
    )
  );
  const items = log.slice(0, 300).map((e) =>
    h(
      "li",
      { class: "item log" },
      h(
        "div",
        { class: "who" },
        h("div", { class: "name" }, e.name || e.handle),
        h("div", { class: "meta" }, handleLink(e.handle), h("span", null, fmtDateTime(e.at)), h("span", { class: e.result === "refollowed" ? "tag keep" : "tag" }, t("result." + e.result)))
      ),
      e.result === "unfollowed" ? h("button", { class: "btn small", disabled: Boolean(state.busy), onclick: (ev) => refollow(e, ev.currentTarget) }, icon("user-plus", 14), t("btn.refollow")) : null
    )
  );
  put(ui.body, header, h("ul", { class: "list" }, items), log.length > 300 ? h("div", { class: "hint" }, t("history.limit")) : null);
}

async function refollow(entry, button) {
  button.disabled = true;
  try {
    await Api.follow(entry.id);
    state.log = await Store.updateLog(state.owner.key, entry, { result: "refollowed" });
    setStatus(t("status.refollowed", { h: entry.handle }), "ok");
  } catch (e) {
    button.disabled = false;
    return setStatus(t("status.refollowFailed", { e: Api.describeError(e) }), "error");
  }
  renderCurrent();
}

async function clearSimulations() {
  state.log = await Store.clearSimulations(state.owner.key);
  renderCurrent();
}

function exportLogCsv() {
  const csv = C.toCsv(state.log, [
    { label: "time", get: (e) => e.at },
    { label: "handle", get: (e) => e.handle },
    { label: "name", get: (e) => e.name },
    { label: "user_id", get: (e) => e.id },
    { label: "result", get: (e) => ({ simulasi: "simulated", dilewati: "skipped" })[e.result] || e.result },
    { label: "url", get: (e) => `https://x.com/${e.handle}` },
  ]);
  download(`sapux-history-${C.localDateKey()}.csv`, csv);
}
