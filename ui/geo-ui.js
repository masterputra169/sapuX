/*
 * SapuX panel: lokasi resmi
 *
 * Cek "Account based in" ke X untuk kandidat.
 * File-file ui/*.js dimuat berurutan sebagai content script dan berbagi scope global
 * (dunia terisolasi ekstensi, tidak terlihat oleh halaman x.com). ui/panel.js memasang panel.
 */
"use strict";

// ---------- lokasi resmi dari X ("Account based in") ----------
const GEO_RECHECK_MS = 90 * C.DAY_MS; // data lokasi jarang berubah: cek ulang paling cepat 90 hari

/** Kandidat unfollow (termasuk yang dilindungi hanya karena tebakan lokasi) yang perlu/pernah dicek. */
function geoTargets() {
  const groups = computeRows();
  if (!groups) return { all: [], pending: [] };
  const all = [...CANDIDATES.flatMap((g) => groups[g]), ...groups.protected.filter((r) => r.shield === "region")].filter((r) => HANDLE_RE.test(r.handle));
  const now = Date.now();
  const pending = all.filter((r) => {
    const a = state.about[r.id];
    return !a || !a.at || now - Date.parse(a.at) > GEO_RECHECK_MS;
  });
  // kandidat dari lokasi prioritas dan yang tebakannya lemah (bahasa) dicek duluan
  const focusSet = new Set(state.settings.focusRegions);
  const likely = (r) => Number(Geo.geoMatches(r.geo, focusSet));
  pending.sort((a, b) => likely(b) - likely(a) || Number(!a.geo) - Number(!b.geo));
  return { all, pending };
}

/** Isi blok "Lokasi resmi dari X" di Aturan; digambar ulang di tempat saat proses berjalan. */
function renderGeoOfficial() {
  if (!ui.geoOfficial) return false;
  const { all, pending } = geoTargets();
  const checked = all.length - pending.length;
  const busy = state.busy === "geo";
  const est = pending.length > 1 ? t("rules.geo.eta", { t: I18n.duration(pending.length * 2.6) }) : "";
  const button = busy
    ? h("button", { class: "btn small", type: "button", onclick: stop }, icon("stop", 14), t("rules.geo.stop"))
    : h("button", { class: "btn small", type: "button", disabled: Boolean(state.busy) || !pending.length, onclick: startGeoCheck }, icon("globe-simple", 14), t("rules.geo.check", { n: n(pending.length) }));
  put(
    ui.geoOfficial,
    h("span", { class: "lbl" }, t("rules.geo.official")),
    h("span", { class: "help" }, t("rules.geo.official.help")),
    state.settings.focusOfficialOnly && state.settings.focusRegions.length && pending.length && !busy
      ? h("span", { class: "geo-note warn" }, t("rules.geo.officialFirst"))
      : null,
    all.length ? h("span", { class: "geo-note" }, pending.length ? t("rules.geo.checked", { n: n(checked), total: n(all.length) }) + (est ? " " + est : "") : t("rules.geo.allChecked", { total: n(all.length) })) : null,
    state.scan ? h("div", { class: "backup" }, button) : null
  );
  return true;
}

async function startGeoCheck() {
  if (state.busy || !state.scan) return;
  const owner = state.owner;
  const { pending } = geoTargets();
  if (!pending.length) return;
  state.busy = "geo";
  state.abort = new AbortController();
  renderGeoOfficial();
  renderActions();
  let unsaved = 0;
  const flush = async () => {
    if (!unsaved) return;
    unsaved = 0;
    await Store.saveAbout(owner.key, state.about);
  };
  try {
    const res = await Engine.checkLocations({
      accounts: pending,
      signal: state.abort.signal,
      onProgress: (p) => setStatus(p.message, "", p),
      onResult: async (user, result) => {
        state.about[user.id] = { ...result, at: new Date().toISOString() };
        unsaved += 1;
        if (unsaved >= 10) await flush();
        renderGeoOfficial();
      },
    });
    await flush();
    state.busy = null;
    if (res.reason === "finished") setStatus(t("status.geoDone", { n: res.done }), "ok");
    else if (res.reason === "query") setStatus(t("status.geoQuery"), "error");
    else setStatus(t("status.geoFailed", { e: Api.describeError(res.error) }), "error");
  } catch (e) {
    await flush().catch(() => {});
    state.busy = null;
    if (isContextGone(e)) return showStale();
    setStatus(e.name === "AbortError" ? t("status.geoStopped") : t("status.geoFailed", { e: Api.describeError(e) }), e.name === "AbortError" ? "" : "error");
  } finally {
    state.busy = null;
    state.abort = null;
    if (!state.stale) {
      renderGeoOfficial();
      renderSummary();
      renderActions();
    }
  }
}
