/*
 * SapuX panel: dasar
 *
 * Dependensi, konstanta, helper DOM aman, state, dan deteksi tema.
 * File-file ui/*.js dimuat berurutan sebagai content script dan berbagi scope global
 * (dunia terisolasi ekstensi, tidak terlihat oleh halaman x.com). ui/panel.js memasang panel.
 */
"use strict";

// Jalankan panel hanya di frame utama, sekali, dan hanya kalau API ekstensi masih hidup
// (skrip bisa tersuntik tepat saat ekstensi di-reload; jangan memasang apa pun dalam kondisi itu).
const SAPUX_ACTIVE = window.top === window && !globalThis.__sapuxPanel && Boolean(globalThis.chrome?.runtime?.id && chrome.storage?.local);

const C = globalThis.SapuCore;
const Api = globalThis.SapuApi;
const Store = globalThis.SapuStore;
const Engine = globalThis.SapuEngine;
const I18n = globalThis.SapuI18n;
const Geo = globalThis.SapuGeo;
const { icon } = globalThis.SapuIcons;
const t = (key, params) => I18n.t(key, params);
const n = (value) => I18n.count(value);

const PAGE_SIZE = 100;
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const SELECTABLE = new Set(["inactive", "small", "oneway", "unknown"]);
const CANDIDATES = ["inactive", "small", "oneway", "unknown"]; // urutan antrean unfollow
const GROUPS = ["inactive", "small", "oneway", "unknown", "active", "protected"];
const OPTIONAL_GROUPS = { small: "smallMaxFollowers", oneway: "unfollowNonFollowers" };

/** Profil kecepatan di Aturan. "Safe" = nilai default. */
const PACES = [
  { id: "safe", values: { minDelaySec: 20, maxDelaySec: 45, batchSize: 10, batchPauseMinMin: 3, batchPauseMaxMin: 6 } },
  { id: "balanced", values: { minDelaySec: 15, maxDelaySec: 30, batchSize: 15, batchPauseMinMin: 2, batchPauseMaxMin: 4 } },
  { id: "fast", values: { minDelaySec: 10, maxDelaySec: 20, batchSize: 20, batchPauseMinMin: 1, batchPauseMaxMin: 2 } },
];

// ---------- helper DOM aman ----------
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (typeof v === "boolean") el[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(2)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
function put(el, ...kids) {
  el.replaceChildren(...kids.flat(2).filter((k) => k != null && k !== false));
}
function logo(cls = "mark") {
  const wrap = h("span", { class: cls });
  const doc = new DOMParser().parseFromString(LOGO_SVG, "image/svg+xml"); // konstanta milik SapuX sendiri
  wrap.append(document.importNode(doc.documentElement, true));
  return wrap;
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(I18n.locale(), { day: "numeric", month: "short", year: "numeric" });
}
function fmtDateTime(iso) {
  return new Date(iso).toLocaleString(I18n.locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
/** Nama tempat untuk kode negara ("ID") atau wilayah ("sea"), sesuai bahasa antarmuka. */
function placeName(code) {
  if (!code) return "";
  if (Geo.REGIONS.includes(code)) return t("geo." + code);
  try {
    return new Intl.DisplayNames([I18n.locale()], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}
function geoLabel(geo) {
  if (!geo) return "";
  if (geo.country) return `${Geo.flagEmoji(geo.country)} ${placeName(geo.country)}`;
  return geo.region ? placeName(geo.region) : String(geo.hint || "");
}
function geoSourceText(geo) {
  if (!geo) return "";
  if (geo.source === "x") return t(geo.accurate === false ? "geo.fromXVpn" : "geo.fromX", { text: geo.hint });
  const list = (geo.signals || []).map((sig) => t("geo.sig." + sig.kind, { text: sig.kind === "lang" ? langName(sig.text) : sig.text })).join(" · ");
  return t("geo.guess", { conf: t("geo.conf." + (geo.confidence || "low")), list });
}
function langName(code) {
  const c = code === "in" ? "id" : code;
  try {
    return new Intl.DisplayNames([I18n.locale()], { type: "language" }).of(c) || c;
  } catch {
    return c;
  }
}

function handleLink(handle) {
  return HANDLE_RE.test(handle)
    ? h("a", { href: `https://x.com/${handle}`, target: "_blank", rel: "noopener noreferrer", onclick: (e) => e.stopPropagation() }, "@" + handle)
    : h("span", null, "@" + handle);
}

// ---------- state ----------
const state = {
  tab: "clean",
  owner: null,
  settings: C.sanitizeSettings({}),
  scan: null, // { scannedAt, users: [...] }
  daily: { count: 0 },
  log: [],
  queue: null, // { savedAt, ids: [...] } sisa antrean unfollow asli
  about: {}, // hasil cek "Account based in" ke X, per id akun
  filter: "inactive",
  query: "",
  follow: "all", // filter tampilan: "all" | "yes" (follow balik) | "no" (tidak follow balik)
  page: 0,
  selected: new Set(),
  busy: null, // null | "scan" | "unfollow"
  abort: null,
  stale: false,
  progress: null,
  rulesOpen: loadFolds(), // bagian Aturan yang sedang terbuka
  health: null, // hasil cek kesehatan terakhir
};
I18n.setLang(state.settings.lang);

/** Bagian Aturan yang terbuka diingat per browser (kenyamanan saja; aman kalau storage tidak tersedia). */
function loadFolds() {
  try {
    const saved = JSON.parse(localStorage.getItem("sapux:folds") || "null");
    if (Array.isArray(saved)) return new Set(saved.filter((x) => typeof x === "string"));
  } catch {
    /* abaikan */
  }
  return new Set(["who"]);
}
function saveFolds() {
  try {
    localStorage.setItem("sapux:folds", JSON.stringify([...state.rulesOpen]));
  } catch {
    /* abaikan */
  }
}

// Diisi oleh ui/panel.js saat panel dipasang.
let host = null;
let shadow = null;
const ui = {};

function detectTheme() {
  const parse = (c) => (c.match(/\d+(\.\d+)?/g) || []).map(Number);
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const [r, g, b, a = 1] = parse(getComputedStyle(el).backgroundColor);
    if (r != null && a > 0.5) return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5 ? "dark" : "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
