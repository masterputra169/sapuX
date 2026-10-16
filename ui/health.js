/*
 * SapuX panel: cek kesehatan
 *
 * Uji singkat ke X yang sesungguhnya, HANYA membaca data (tidak ada unfollow/perubahan):
 * login, sesi, daftar following (1 akun), cek lokasi (akun sendiri), jatah harian, umur scan.
 * File-file ui/*.js dimuat berurutan sebagai content script dan berbagi scope global
 * (dunia terisolasi ekstensi, tidak terlihat oleh halaman x.com). ui/panel.js memasang panel.
 */
"use strict";

const HEALTH_ICONS = { ok: "check-circle", warn: "warning", fail: "x", info: "info" };

/** Isi bagian "Cek kesehatan" di Aturan. */
function healthBody() {
  const list = h("ul", { class: "health", "aria-live": "polite" });
  const button = h("button", { class: "btn small", type: "button", disabled: Boolean(state.busy), onclick: () => runHealthCheck(list, button) }, icon("list-checks", 14), t("health.run"));
  if (state.health) renderHealth(list, state.health);
  return [h("p", { class: "group-note" }, t("health.help")), h("div", { class: "backup" }, button), list];
}

function renderHealth(list, items) {
  put(
    list,
    items.map((it) => h("li", { class: "health-item " + it.status }, icon(HEALTH_ICONS[it.status] || "info", 15), h("span", null, it.text)))
  );
}

async function runHealthCheck(list, button) {
  if (state.busy) return;
  button.disabled = true;
  const items = [];
  const show = () => renderHealth(list, [...items, { status: "info", text: t("health.running") }]);
  const add = (status, text) => {
    items.push({ status, text });
    show();
  };
  show();

  // 1. login & sesi
  const owner = Api.getOwner();
  if (owner) add("ok", t("health.login.ok", { h: owner.handle || owner.userId }));
  else add("fail", t("health.login.fail"));
  const session = await Api.hasSession().catch(() => false);
  if (session) add("ok", t("health.session.ok"));
  else add("fail", t("health.session.fail"));

  if (owner && session) {
    // 2. daftar following: 1 akun saja
    try {
      await Api.getFollowingPage(owner, "-1", 1);
      const r = Api.rate();
      add("ok", r && Number.isFinite(r.remaining) && r.resetAt ? t("health.list.ok", { left: r.remaining, time: fmtTime(r.resetAt) }) : t("health.list.okPlain"));
    } catch (e) {
      if (isContextGone(e)) return showStale();
      add(e.status === 429 || e.code === 88 ? "warn" : "fail", t("health.list.fail", { e: Api.describeError(e) }));
    }
    // 3. cek lokasi: akun sendiri
    if (owner.handle) {
      try {
        const about = Geo.parseAbout(await Api.getAbout(owner.handle));
        add("ok", about.based ? t("health.about.ok", { place: about.based }) : t("health.about.okPlain"));
      } catch (e) {
        if (isContextGone(e)) return showStale();
        if (e.status === 400 || e.status === 404) add("warn", t("health.about.stale"));
        else add(e.status === 429 || e.code === 88 ? "warn" : "fail", t("health.about.fail", { e: Api.describeError(e) }));
      }
    }
    // 4. jatah harian & umur scan
    try {
      state.daily = await Store.getDaily(owner.key);
    } catch {
      /* pakai nilai di memori */
    }
    const s = state.settings;
    add(state.daily.count >= s.dailyCap ? "warn" : "info", t("health.daily", { n: state.daily.count, cap: s.dailyCap }));
    if (!state.scan) add("warn", t("health.scan.none"));
    else {
      const days = C.daysSince(Date.parse(state.scan.scannedAt));
      add(days > 30 ? "warn" : "ok", days > 30 ? t("health.scan.old", { days }) : t("health.scan.ok", { when: fmtDateTime(state.scan.scannedAt) }));
    }
  }
  add("info", t("health.version", { v: chrome.runtime.getManifest().version }));

  state.health = items;
  renderHealth(list, items);
  button.disabled = false;
  const fails = items.filter((i) => i.status === "fail").length;
  const warns = items.filter((i) => i.status === "warn").length;
  setStatus(fails ? t("health.sumFail", { n: fails }) : warns ? t("health.sumWarn", { n: warns }) : t("health.sumOk"), fails ? "error" : warns ? "" : "ok");
}

function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString(I18n.locale(), { hour: "2-digit", minute: "2-digit" });
}
