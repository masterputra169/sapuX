/*
 * SapuX: panel di dalam halaman x.com.
 *
 * - Semua elemen dibuat lewat DOM API (tanpa innerHTML untuk data) dan diisolasi di Shadow DOM,
 *   jadi nama/bio akun lain tidak bisa menyuntikkan HTML/skrip ke panel.
 * - Teks lewat SapuI18n (English default, Bahasa Indonesia opsional).
 * - Tema mengikuti tema X (gelap/terang). Font Geist & ikon Phosphor dibundel di ekstensi.
 */
(function () {
  "use strict";
  if (window.top !== window || globalThis.__sapuxPanel) return;
  globalThis.__sapuxPanel = true;

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

  const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" aria-hidden="true"><rect width="128" height="128" rx="30" fill="#F3B740"/><rect x="1.5" y="1.5" width="125" height="125" rx="28.5" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="3"/><line x1="91" y1="37" x2="37" y2="91" stroke="#1C1F3A" stroke-width="13" stroke-linecap="round"/><g transform="rotate(-45 64 64)"><line x1="64" y1="16" x2="64" y2="60" stroke="#1C1F3A" stroke-width="12" stroke-linecap="round"/><rect x="52" y="60" width="24" height="9" rx="3" fill="#1C1F3A"/><path d="M53 72 H75 L92 106 Q94 112 88 112 H40 Q34 112 36 106 Z" fill="#1C1F3A"/><g stroke="#F2B544" stroke-width="3.4" stroke-linecap="round"><line x1="54" y1="88" x2="49" y2="113"/><line x1="61" y1="88" x2="59.5" y2="113"/><line x1="67" y1="88" x2="68.5" y2="113"/><line x1="74" y1="88" x2="79" y2="113"/></g></g></svg>`;

  /*
   * Design tokens.
   * Radius: panel 18 > section 12 (panel padding 6) > control 10 > tag pill.
   * Satu aksen (amber dari logo). Merah hanya untuk mode asli & error.
   */
  const CSS = `
    :host { all: initial; }
    .root {
      --font: "SapuX Geist", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
      --ease-out: cubic-bezier(.2, .8, .2, 1);
      --amber: #f2b544; --amber-ink: #241a04;
      --c-inactive: #f2b544; --c-small: #e8895a; --c-unknown: #c9962a; --c-active: #7d8cf0; --c-protected: #5fcf9b; --c-oneway: #d77fb3;
    }
    .root[data-theme="dark"] {
      --bg: #16171e; --raised: #1d1f28; --sunken: #111218; --hover: #23252f;
      --line: #2a2d39; --line-strong: #3b3f50;
      --text: #ecedf3; --muted: #a4a8ba; --faint: #7a8096;
      --accent-text: #f2b544; --danger: #ff6a5c; --danger-ink: #2c0703; --ok: #5fcf9b;
      --shadow: 0 0 0 1px rgba(255,255,255,.06), 0 18px 48px rgba(5,6,14,.55), 0 4px 12px rgba(5,6,14,.4);
      --tag-bg: #262935;
    }
    .root[data-theme="light"] {
      --bg: #fbfbfc; --raised: #ffffff; --sunken: #f1f2f5; --hover: #f2f3f6;
      --line: #e4e6ec; --line-strong: #cdd1dc;
      --text: #171923; --muted: #4f566a; --faint: #757c91;
      --accent-text: #925e05; --danger: #d6392a; --danger-ink: #ffffff; --ok: #1f8a5a;
      --shadow: 0 0 0 1px rgba(23,25,35,.07), 0 18px 48px rgba(23,25,35,.16), 0 4px 12px rgba(23,25,35,.08);
      --tag-bg: #eef0f4;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .root { font: 14px/1.45 var(--font); color: var(--text); -webkit-font-smoothing: antialiased; font-feature-settings: "ss01"; }
    button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: .4; }
    :focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
    a { color: var(--muted); text-decoration: none; }
    a:hover { color: var(--accent-text); }
    .ico { flex: none; display: block; }
    .num { font-variant-numeric: tabular-nums; }

    /* ---------- tombol melayang ---------- */
    .fab {
      position: fixed; left: 18px; bottom: 18px; z-index: 2147483000;
      display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px 0 6px;
      background: var(--raised); color: var(--text); border-radius: 999px; box-shadow: var(--shadow);
      font-weight: 600; letter-spacing: -.005em;
      transition: transform .16s var(--ease-out), box-shadow .16s ease;
    }
    .fab:active { transform: scale(.97); }
    .fab .mark { width: 28px; height: 28px; }
    .mark svg { width: 100%; height: 100%; display: block; }

    /* ---------- panel ---------- */
    .panel {
      position: fixed; top: 12px; right: 12px; bottom: 12px; z-index: 2147483000;
      width: min(452px, calc(100vw - 24px));
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--bg); border-radius: 18px; box-shadow: var(--shadow);
      transform-origin: top right;
    }
    @media (prefers-reduced-motion: no-preference) {
      .panel.enter { animation: panel-in .22s var(--ease-out) both; }
      @keyframes panel-in { from { opacity: 0; transform: translateY(6px) scale(.985); } }
    }

    .head { display: flex; align-items: center; gap: 10px; padding: 14px 12px 12px 16px; }
    .head .mark { width: 32px; height: 32px; }
    .brand { flex: 1; min-width: 0; line-height: 1.2; }
    .brand-name { font-size: 16px; font-weight: 650; letter-spacing: -.015em; }
    .brand-owner { font-size: 12.5px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lang { display: flex; padding: 2px; border-radius: 10px; background: var(--sunken); box-shadow: inset 0 0 0 1px var(--line); }
    .lang button { min-width: 34px; height: 28px; padding: 0 8px; border-radius: 8px; font-size: 12px; font-weight: 600; color: var(--faint);
      transition: background-color .15s ease, color .15s ease; }
    .lang button[aria-pressed="true"] { background: var(--raised); color: var(--text); box-shadow: 0 0 0 1px var(--line), 0 1px 2px rgba(0,0,0,.12); }
    .iconbtn { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; color: var(--muted);
      transition: background-color .15s ease, color .15s ease, transform .12s ease; }
    .iconbtn:hover { background: var(--hover); color: var(--text); }
    .iconbtn:active { transform: scale(.94); }
    @media (prefers-reduced-motion: no-preference) {
      .iconbtn.spin .ico { animation: spin .5s var(--ease-out); }
      @keyframes spin { to { transform: rotate(360deg); } }
    }

    /* ---------- ringkasan: angka besar + meter ---------- */
    .summary { margin: 0 6px; padding: 14px 10px 12px; border-radius: 12px; background: var(--raised); box-shadow: 0 0 0 1px var(--line); }
    .summary-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 0 4px; }
    .hero-count { font-size: 34px; font-weight: 650; letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums; }
    .hero-label { font-size: 13px; color: var(--muted); margin-top: 4px; }
    .scanline { font-size: 12px; color: var(--faint); text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .textbtn { display: inline-flex; align-items: center; gap: 5px; color: var(--accent-text); font-weight: 600; font-size: 12.5px; border-radius: 6px; padding: 2px 0; }
    .textbtn:hover:not(:disabled) { text-decoration: underline; text-underline-offset: 3px; }
    .bar { display: flex; height: 8px; margin: 14px 4px 10px; border-radius: 4px; overflow: hidden; gap: 2px; background: var(--sunken); }
    .bar-seg { height: 100%; min-width: 3px; }
    .bar-seg.inactive { background: var(--c-inactive); }
    .bar-seg.small { background: var(--c-small); }
    .bar-seg.unknown { background: repeating-linear-gradient(135deg, var(--c-unknown) 0 3px, transparent 3px 6px); }
    .bar-seg.oneway { background: var(--c-oneway); }
    .bar-seg.active { background: var(--c-active); }
    .bar-seg.protected { background: var(--c-protected); }
    .legend { display: grid; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); gap: 2px; }
    .seg { min-width: 0; text-align: left; padding: 6px 8px; border-radius: 8px; transition: background-color .15s ease; }
    .seg:hover { background: var(--hover); }
    .seg[aria-pressed="true"] { background: var(--sunken); box-shadow: inset 0 0 0 1px var(--line); }
    .seg-count { display: flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.25; }
    .seg-label { display: block; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dot { width: 7px; height: 7px; border-radius: 2px; flex: none; }
    .dot.inactive { background: var(--c-inactive); } .dot.small { background: var(--c-small); }
    .dot.unknown { background: repeating-linear-gradient(135deg, var(--c-unknown) 0 2px, transparent 2px 4px); box-shadow: inset 0 0 0 1px var(--c-unknown); }
    .dot.active { background: var(--c-active); } .dot.protected { background: var(--c-protected); } .dot.oneway { background: var(--c-oneway); }

    /* ---------- tab ---------- */
    .tabs { display: flex; gap: 4px; padding: 10px 12px 0; border-bottom: 1px solid var(--line); }
    .tab { display: flex; align-items: center; gap: 6px; height: 38px; padding: 0 10px; color: var(--faint); font-weight: 600;
      border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .15s ease; }
    .tab:hover { color: var(--text); }
    .tab[aria-selected="true"] { color: var(--text); border-bottom-color: var(--amber); }

    .body { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
    .body > *, .listwrap > * { flex-shrink: 0; }
    .listwrap { display: flex; flex-direction: column; gap: 10px; }

    .search { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-radius: 10px; background: var(--sunken); box-shadow: inset 0 0 0 1px var(--line); color: var(--faint);
      transition: box-shadow .15s ease; }
    .search:focus-within { box-shadow: inset 0 0 0 1px var(--amber); }
    .search input { flex: 1; min-width: 0; height: 100%; background: none; border: 0; color: var(--text); font: inherit; font-size: 14px; }
    .search input::placeholder { color: var(--faint); }
    .search input:focus { outline: none; }

    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border-radius: 999px; font-size: 12.5px; font-weight: 500; color: var(--muted);
      box-shadow: inset 0 0 0 1px var(--line); transition: background-color .12s ease, color .12s ease, box-shadow .12s ease; }
    .chip:hover { background: var(--hover); color: var(--text); }
    .chip[aria-pressed="true"] { background: color-mix(in srgb, var(--amber) 16%, transparent); color: var(--text); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--amber) 60%, transparent); }
    .chip-n { color: var(--faint); font-variant-numeric: tabular-nums; }
    .chip[aria-pressed="true"] .chip-n { color: var(--accent-text); }
    .hint { font-size: 12.5px; color: var(--faint); text-wrap: pretty; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--muted); min-height: 24px; }
    .toolbar-actions { display: flex; gap: 14px; }

    /* ---------- baris akun ---------- */
    .list { list-style: none; margin: 0 -8px; padding: 0; }
    .item { position: relative; display: grid; grid-template-columns: 22px 34px minmax(0, 1fr) auto; align-items: center; gap: 10px;
      padding: 8px; border-radius: 10px; transition: background-color .12s ease; }
    .item.selectable { cursor: pointer; }
    @media (hover: hover) { .item:hover { background: var(--hover); } }
    .item.log { grid-template-columns: minmax(0, 1fr) auto; }
    .check { appearance: none; width: 18px; height: 18px; margin: 0; border-radius: 5px; box-shadow: inset 0 0 0 1.5px var(--line-strong); display: grid; place-items: center; cursor: pointer;
      transition: background-color .12s ease, box-shadow .12s ease; }
    .check:checked { background: var(--amber); box-shadow: none; }
    .check:checked::after { content: ""; width: 5px; height: 9px; border: solid var(--amber-ink); border-width: 0 2px 2px 0; transform: translateY(-1px) rotate(45deg); }
    .av { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; background: var(--sunken); outline: 1px solid rgba(127,127,127,.18); outline-offset: -1px; }
    .who { min-width: 0; }
    .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -.005em; }
    .meta { display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--faint); }
    .tag { font-size: 11px; font-weight: 500; padding: 1px 7px; border-radius: 999px; background: var(--tag-bg); color: var(--muted); }
    .tag.keep { background: color-mix(in srgb, var(--c-protected) 16%, transparent); color: var(--ok); }
    .tag.geo { display: inline-flex; align-items: center; gap: 4px; }
    .tag.geo.official .ico { opacity: .8; }
    .tag.geo.focus { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--text); }
    .tag.quiet { background: color-mix(in srgb, var(--c-active) 18%, transparent); color: var(--text); }
    .side { display: flex; align-items: center; gap: 4px; }
    .age { text-align: right; min-width: 64px; }
    .age-num { font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.15; }
    .age-unit { font-size: 11.5px; color: var(--faint); }
    .rowbtn { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 9px; border-radius: 8px; font-size: 12.5px; font-weight: 600; color: var(--muted);
      transition: background-color .12s ease, color .12s ease, opacity .12s ease; }
    .rowbtn:hover:not(:disabled) { background: var(--raised); color: var(--ok); box-shadow: 0 0 0 1px var(--line); }
    .rowbtn.release:hover:not(:disabled) { color: var(--accent-text); }
    @media (hover: hover) {
      .item .rowbtn { opacity: 0; }
      .item:hover .rowbtn, .item:focus-within .rowbtn { opacity: 1; }
    }
    .banner { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 10px; padding: 12px; border-radius: 12px; background: var(--raised);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--amber) 45%, var(--line)); }
    .banner > .ico { color: var(--accent-text); margin-top: 1px; }
    .banner-title { font-weight: 650; font-variant-numeric: tabular-nums; }
    .banner-body { grid-column: 2; font-size: 12.5px; color: var(--muted); text-wrap: pretty; }
    .banner-actions { grid-column: 2; display: flex; align-items: center; gap: 14px; margin-top: 6px; }
    .pager { display: flex; justify-content: center; align-items: center; gap: 16px; font-size: 12.5px; color: var(--faint); padding-top: 4px; }

    .empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 36px 16px; color: var(--muted); }
    .empty .mark { width: 56px; height: 56px; margin-bottom: 6px; }
    .empty-title { font-size: 16px; font-weight: 650; color: var(--text); letter-spacing: -.01em; text-wrap: balance; }
    .empty p { margin: 0 0 6px; max-width: 36ch; text-wrap: pretty; }

    /* ---------- tombol ---------- */
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 40px; padding: 0 16px; border-radius: 10px;
      font-weight: 600; white-space: nowrap; background: var(--raised); box-shadow: 0 0 0 1px var(--line-strong);
      transition: background-color .15s ease, box-shadow .15s ease, transform .12s ease; }
    .btn:hover:not(:disabled) { background: var(--hover); }
    .btn:active:not(:disabled) { transform: scale(.97); }
    .btn.primary { background: var(--amber); color: var(--amber-ink); box-shadow: none; }
    .btn.primary:hover:not(:disabled) { background: #f6c868; }
    .btn.danger { background: var(--danger); color: var(--danger-ink); box-shadow: none; }
    .btn.danger:hover:not(:disabled) { filter: brightness(1.06); }
    .btn.small { height: 32px; padding: 0 11px; font-size: 12.5px; border-radius: 8px; }

    /* ---------- footer ---------- */
    .foot { padding: 10px 16px 12px; border-top: 1px solid var(--line); background: var(--raised); display: flex; flex-direction: column; gap: 8px; }
    .actionbar { display: flex; align-items: center; gap: 8px; }
    .actionbar .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .mode { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; }
    .mode::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .mode.sim { color: var(--accent-text); } .mode.live { color: var(--danger); }
    .eta { font-size: 12px; color: var(--faint); }
    .progress { height: 3px; border-radius: 2px; background: var(--sunken); overflow: hidden; }
    .progress-fill { height: 100%; width: 0; background: var(--amber); transition: width .3s var(--ease-out); }
    .statusrow { display: flex; gap: 8px; align-items: baseline; font-size: 12.5px; min-height: 18px; }
    .counter:empty { display: none; }
    .counter { font-weight: 650; font-variant-numeric: tabular-nums; }
    .status { color: var(--muted); text-wrap: pretty; }
    .status.ok { color: var(--ok); } .status.error { color: var(--danger); }

    /* ---------- aturan ---------- */
    .form { display: flex; flex-direction: column; gap: 22px; }
    .group { display: flex; flex-direction: column; gap: 16px; }
    .group-title { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -.01em; }
    .group-note { margin: -10px 0 0; font-size: 12.5px; color: var(--faint); }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .lbl { font-weight: 600; font-size: 13.5px; }
    .help { font-size: 12.5px; color: var(--faint); text-wrap: pretty; }
    .inputrow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .unit { width: fit-content; display: flex; align-items: center; height: 40px; border-radius: 10px; background: var(--sunken); box-shadow: inset 0 0 0 1px var(--line); padding-right: 12px;
      transition: box-shadow .15s ease; }
    .unit:focus-within { box-shadow: inset 0 0 0 1px var(--amber); }
    .unit input { width: 92px; height: 100%; padding: 0 12px; background: none; border: 0; color: var(--text); font: inherit; font-size: 14px; font-variant-numeric: tabular-nums; }
    .unit input:focus { outline: none; }
    .unit span { font-size: 12.5px; color: var(--faint); }
    .presets { display: flex; gap: 4px; }
    .preset { height: 32px; padding: 0 10px; border-radius: 8px; font-size: 12.5px; font-weight: 500; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line);
      transition: background-color .12s ease, color .12s ease; }
    .preset:hover { background: var(--hover); color: var(--text); }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    textarea { width: 100%; min-height: 96px; resize: vertical; padding: 10px 12px; border: 0; border-radius: 10px; background: var(--sunken); box-shadow: inset 0 0 0 1px var(--line);
      color: var(--text); font: 13.5px/1.5 var(--font); }
    textarea:focus { outline: none; box-shadow: inset 0 0 0 1px var(--amber); }
    textarea::placeholder { color: var(--faint); }
    .switch { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; cursor: pointer; }
    .switch input { appearance: none; position: relative; width: 38px; height: 22px; margin: 1px 0 0; border-radius: 999px; background: var(--line-strong); cursor: pointer;
      transition: background-color .18s ease; }
    .switch input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25);
      transition: transform .18s var(--ease-out); }
    .switch input:checked { background: var(--amber); }
    .switch input:checked::after { transform: translateX(16px); }
    .modecard { padding: 14px; border-radius: 12px; background: var(--raised); box-shadow: 0 0 0 1px var(--line); transition: box-shadow .18s ease; }
    .modecard.live { box-shadow: 0 0 0 1px color-mix(in srgb, var(--danger) 55%, transparent); }
    .formactions { display: flex; justify-content: flex-end; }
    .backup { display: flex; flex-wrap: wrap; gap: 8px; }
    .geo-picks { display: flex; flex-direction: column; gap: 8px; }
    .geo-row { display: flex; flex-direction: column; gap: 6px; }
    .geo-row-label { font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--faint); }
    .chip.danger[aria-pressed="true"] { background: color-mix(in srgb, var(--danger) 14%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--danger) 60%, transparent); }
    .geo-note { margin: -8px 0 0; font-size: 12.5px; color: var(--faint); }
    .geo-note.warn { color: var(--accent-text); }
    .field .geo-note { margin: 0; }
    .danger-zone { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-top: 18px; border-top: 1px solid var(--line); }

    /* ---------- dialog konfirmasi (pengganti window.confirm) ---------- */
    .scrim { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; padding: 12px;
      background: rgba(6, 7, 12, .58); backdrop-filter: blur(3px); }
    .root[data-theme="light"] .scrim { background: rgba(23, 25, 35, .3); }
    .dialog { width: 100%; max-height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 18px;
      background: var(--bg); border-radius: 14px; box-shadow: var(--shadow); outline: none; scrollbar-width: thin; }
    @media (prefers-reduced-motion: no-preference) {
      .scrim { animation: scrim-in .16s ease both; }
      .dialog { animation: dialog-in .22s var(--ease-out) both; }
      @keyframes scrim-in { from { opacity: 0; } }
      @keyframes dialog-in { from { opacity: 0; transform: translateY(10px) scale(.98); } }
    }
    .dlg-head { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: start; }
    .dlg-icon { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; }
    .dlg-icon.danger { background: color-mix(in srgb, var(--danger) 16%, transparent); color: var(--danger); }
    .dlg-icon.amber { background: color-mix(in srgb, var(--amber) 18%, transparent); color: var(--accent-text); }
    .dlg-eyebrow { font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); }
    .dlg-title { margin: 2px 0 4px; font-size: 18px; font-weight: 650; letter-spacing: -.015em; line-height: 1.25; text-wrap: balance; }
    .dlg-sub { margin: 0; font-size: 13px; color: var(--muted); text-wrap: pretty; }
    .dlg-stats { display: grid; gap: 8px; }
    .stat { min-width: 0; padding: 10px 12px; border-radius: 10px; background: var(--raised); box-shadow: 0 0 0 1px var(--line); }
    .stat-label { font-size: 11.5px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stat-value { font-size: 19px; font-weight: 650; letter-spacing: -.02em; font-variant-numeric: tabular-nums; line-height: 1.3; }
    .stat-note { font-size: 11.5px; color: var(--faint); text-wrap: pretty; }
    .stat.danger .stat-value { color: var(--danger); }
    .dlg-section { display: flex; flex-direction: column; gap: 6px; }
    .dlg-label { font-size: 12px; font-weight: 600; color: var(--muted); }
    .dlg-mix { display: flex; flex-wrap: wrap; gap: 6px; }
    .mix { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 999px; font-size: 12.5px; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); }
    .mix b { color: var(--text); font-weight: 650; font-variant-numeric: tabular-nums; }
    .dlg-warn { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .dlg-warn li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: start; padding: 9px 11px; border-radius: 10px; font-size: 12.5px;
      background: color-mix(in srgb, var(--amber) 10%, transparent); color: var(--text); text-wrap: pretty; }
    .dlg-warn .ico { color: var(--accent-text); margin-top: 1px; }
    .dlg-foot { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; font-size: 12px; color: var(--faint); text-wrap: pretty; }
    .dlg-actions { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap: 8px; padding-top: 2px; }
    .dlg-actions .btn { width: 100%; }

    @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
  `;

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
    if (geo.source === "lang") {
      let lang = geo.hint === "in" ? "id" : geo.hint;
      try {
        lang = new Intl.DisplayNames([I18n.locale()], { type: "language" }).of(lang) || lang;
      } catch {
        /* biarkan kode bahasa */
      }
      return t("geo.fromLang", { lang });
    }
    return t(geo.source === "flag" ? "geo.fromFlag" : "geo.fromBio", { text: geo.hint });
  }

  function handleLink(handle) {
    return HANDLE_RE.test(handle)
      ? h("a", { href: `https://x.com/${handle}`, target: "_blank", rel: "noopener noreferrer", onclick: (e) => e.stopPropagation() }, "@" + handle)
      : h("span", null, "@" + handle);
  }

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
  };
  I18n.setLang(state.settings.lang);

  // ---------- mount ----------
  const host = document.createElement("div");
  host.id = "sapux-host";
  const shadow = host.attachShadow({ mode: "closed" });
  const ui = {};
  ui.root = h("div", { class: "root", "data-theme": detectTheme() });
  shadow.append(h("style", null, CSS), ui.root);
  document.documentElement.append(host);

  function detectTheme() {
    const parse = (c) => (c.match(/\d+(\.\d+)?/g) || []).map(Number);
    for (const el of [document.body, document.documentElement]) {
      if (!el) continue;
      const [r, g, b, a = 1] = parse(getComputedStyle(el).backgroundColor);
      if (r != null && a > 0.5) return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5 ? "dark" : "light";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

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

  // ---------- tab: Review ----------
  function renderClean() {
    if (!state.owner) {
      put(ui.body, h("div", { class: "empty" }, logo(), h("div", { class: "empty-title" }, t("empty.login.title")), h("p", null, t("empty.login.body"))));
      return;
    }
    if (!state.scan) {
      const scanning = state.busy === "scan";
      put(
        ui.body,
        h(
          "div",
          { class: "empty" },
          logo(),
          h("div", { class: "empty-title" }, t("empty.scan.title")),
          h("p", null, t("empty.scan.body")),
          scanning
            ? h("button", { class: "btn", onclick: stop }, icon("stop", 16), t("meter.stopScan"))
            : h("button", { class: "btn primary", onclick: startScan }, icon("magnifying-glass", 16), t("btn.scan"))
        )
      );
      return;
    }
    ui.listWrap = h("div", { class: "listwrap" });
    const input = h("input", {
      type: "search",
      placeholder: t("search.placeholder"),
      "aria-label": t("search.label"),
      value: state.query,
      oninput: (e) => {
        state.query = e.target.value;
        state.page = 0;
        renderList();
      },
      onkeydown: (e) => {
        if (e.key === "Escape" && e.target.value) {
          e.stopPropagation();
          e.target.value = "";
          state.query = "";
          state.page = 0;
          renderList();
        }
      },
    });
    put(ui.body, h("label", { class: "search" }, icon("magnifying-glass", 16), input), ui.listWrap);
    renderList();
  }

  function matchesFollow(r) {
    return state.follow === "all" || (state.follow === "yes") === Boolean(r.followedBy);
  }

  /** Chip filter follow balik: hanya menyaring tampilan grup yang sedang dibuka (seperti kolom cari). */
  function followChips(base) {
    const opts = [
      ["all", base.length],
      ["yes", base.filter((r) => r.followedBy).length],
      ["no", base.filter((r) => !r.followedBy).length],
    ];
    return h(
      "div",
      { class: "chips", role: "group", "aria-label": t("follow.label") },
      opts.map(([key, count]) =>
        h(
          "button",
          {
            class: "chip",
            "aria-pressed": String(state.follow === key),
            onclick: () => {
              state.follow = key;
              state.page = 0;
              renderList();
            },
          },
          t("follow." + key),
          h("span", { class: "chip-n" }, n(count))
        )
      )
    );
  }

  function matchesQuery(r) {
    const q = state.query.trim().toLowerCase().replace(/^@/, "");
    if (!q) return true;
    return (
      r.handle.toLowerCase().includes(q) ||
      String(r.name).toLowerCase().includes(q) ||
      String(r.location || "").toLowerCase().includes(q) ||
      (r.geo != null && geoLabel(r.geo).toLowerCase().includes(q))
    );
  }

  function renderList() {
    if (!ui.listWrap) return;
    const scrollTop = ui.body.scrollTop;
    const groups = computeRows();
    if (!shownGroups(groups).includes(state.filter)) state.filter = "inactive";
    const allRows = groups[state.filter];
    const matched = allRows.filter(matchesQuery);
    const rows = matched.filter(matchesFollow);
    const searching = state.query.trim() !== "";
    const filtering = searching || state.follow !== "all";
    const selectable = SELECTABLE.has(state.filter);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages - 1);
    const slice = rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
    const s = state.settings;

    const hints = {
      inactive: t("hint.inactive", { days: s.thresholdDays }),
      small: t("hint.small", { n: n(s.smallMaxFollowers) }),
      oneway: t("hint.oneway"),
      unknown: t("hint.unknown"),
      active: t("hint.active"),
      protected: (s.protectMinFollowers ? t("hint.protectedBig", { n: n(s.protectMinFollowers) }) : t("hint.protected")) + (s.keepRegions.length ? t("hint.protectedRegion") : ""),
    };

    let toolbar = null;
    if (selectable && rows.length) {
      const sel = rows.filter((r) => state.selected.has(r.id)).length;
      toolbar = h(
        "div",
        { class: "toolbar" },
        h("span", { class: "num" }, filtering ? t("toolbar.matches", { n: rows.length, sel }) : t("toolbar.selected", { sel, total: rows.length })),
        h(
          "span",
          { class: "toolbar-actions" },
          h("button", { class: "textbtn", disabled: Boolean(state.busy), onclick: () => { rows.forEach((r) => state.selected.add(r.id)); refreshList(); } }, t("toolbar.all")),
          h("button", { class: "textbtn", disabled: Boolean(state.busy), onclick: () => { rows.forEach((r) => state.selected.delete(r.id)); refreshList(); } }, t("toolbar.none"))
        )
      );
    }

    const list = slice.length
      ? h("ul", { class: "list" }, slice.map((r) => renderRow(r, selectable)))
      : h("div", { class: "empty" }, h("p", null, searching ? t("list.emptySearch", { q: state.query.trim() }) : state.follow !== "all" ? t("list.emptyFilter") : t("list.emptyGroup")));

    const pager =
      pages > 1
        ? h(
            "div",
            { class: "pager" },
            h("button", { class: "textbtn", disabled: state.page === 0, onclick: () => { state.page -= 1; renderList(); ui.body.scrollTop = 0; } }, t("pager.prev")),
            h("span", { class: "num" }, t("pager.page", { p: state.page + 1, n: pages })),
            h("button", { class: "textbtn", disabled: state.page >= pages - 1, onclick: () => { state.page += 1; renderList(); ui.body.scrollTop = 0; } }, t("pager.next"))
          )
        : null;

    put(ui.listWrap, queueBanner(groups), allRows.length ? followChips(matched) : null, h("div", { class: "hint" }, hints[state.filter]), toolbar, list, pager);
    ui.body.scrollTop = scrollTop;
  }

  /** Kartu "lanjutkan antrean" di atas daftar, kalau ada sisa dari proses sebelumnya. */
  function queueBanner(groups) {
    if (!state.queue?.ids?.length || state.busy) return null;
    const pending = resolveQueue(groups);
    return h(
      "div",
      { class: "banner", role: "region", "aria-label": t("queue.title", { n: pending.length }) },
      icon("clock-counter-clockwise", 18),
      h("div", { class: "banner-title" }, t("queue.title", { n: pending.length })),
      h("div", { class: "banner-body" }, t("queue.body", { when: fmtDateTime(state.queue.savedAt) })),
      h(
        "div",
        { class: "banner-actions" },
        h("button", { class: "btn small primary", onclick: resumeQueue }, icon("play", 14), t("queue.resume")),
        h("button", { class: "textbtn", onclick: discardQueue }, t("queue.discard"))
      )
    );
  }

  async function resumeQueue() {
    const pending = resolveQueue(computeRows());
    if (!pending.length) {
      await discardQueue({ silent: true });
      return setStatus(t("queue.empty"));
    }
    return startUnfollow(pending);
  }

  async function discardQueue({ silent = false } = {}) {
    state.queue = null;
    try {
      await Store.clearQueue(state.owner.key);
    } catch (e) {
      if (isContextGone(e)) return showStale();
    }
    if (!silent) setStatus(t("queue.discarded"), "ok");
    renderCurrent();
  }

  function refreshList() {
    renderList();
    renderSummary();
    renderActions();
  }

  function toggleSelected(r, on) {
    if (on) state.selected.add(r.id);
    else state.selected.delete(r.id);
    refreshList();
  }

  function renderRow(r, selectable) {
    const checkbox = selectable
      ? h("input", {
          type: "checkbox",
          class: "check",
          checked: state.selected.has(r.id),
          disabled: Boolean(state.busy),
          "aria-label": t("row.select", { h: r.handle }),
          onclick: (e) => e.stopPropagation(),
          onchange: (e) => toggleSelected(r, e.target.checked),
        })
      : h("span");
    const avatar = /^https:\/\/pbs\.twimg\.com\//.test(r.avatar)
      ? h("img", { class: "av", src: r.avatar, alt: "", loading: "lazy", referrerpolicy: "no-referrer" })
      : h("span", { class: "av" });

    const tags = [];
    if (r.shield === "whitelist") tags.push(h("span", { class: "tag keep" }, t("tag.whitelist")));
    if (r.shield === "followers") tags.push(h("span", { class: "tag keep" }, t("tag.bigFollowers")));
    if (r.followedBy) tags.push(h("span", { class: r.shield === "mutual" ? "tag keep" : "tag" }, t("tag.mutual")));
    if (r.geo) {
      const cls = "tag geo" + (r.shield === "region" ? " keep" : r.focus && !r.shield ? " focus" : "");
      const mark = r.geo.source === "x" ? icon(r.geo.accurate === false ? "warning" : "check-circle", 11) : null;
      tags.push(h("span", { class: cls + (r.geo.source === "x" ? " official" : ""), title: geoSourceText(r.geo) }, mark, geoLabel(r.geo)));
    }
    if (r.isProtected) tags.push(h("span", { class: "tag" }, t("tag.private")));
    if (r.quiet) tags.push(h("span", { class: "tag quiet", title: fmtDate(r.quietActiveAt) }, t("tag.quiet")));

    const age =
      r.days == null
        ? h("div", { class: "age" }, h("div", { class: "age-num" }, "-"), h("div", { class: "age-unit" }, t("row.noPosts")))
        : h("div", { class: "age", title: t("row.lastPost", { date: fmtDate(r.lastTweetAt) }) }, h("div", { class: "age-num" }, n(r.days)), h("div", { class: "age-unit" }, t("row.daysAgo")));

    const canToggle = selectable && !state.busy;
    return h(
      "li",
      {
        class: "item" + (selectable ? " selectable" : ""),
        onclick: canToggle ? () => toggleSelected(r, !state.selected.has(r.id)) : null,
      },
      checkbox,
      avatar,
      h("div", { class: "who" }, h("div", { class: "name" }, r.name || r.handle), h("div", { class: "meta" }, handleLink(r.handle), h("span", { class: "num" }, t("row.followers", { n: n(r.followers) })), tags)),
      h("div", { class: "side" }, rowAction(r), age)
    );
  }

  function rowAction(r) {
    if (!HANDLE_RE.test(r.handle)) return null;
    const click = (protect) => (e) => {
      e.stopPropagation();
      setWhitelisted(r, protect);
    };
    if (r.shield === "whitelist") {
      return h("button", { class: "rowbtn release", disabled: Boolean(state.busy), title: t("row.releaseTitle", { h: r.handle }), onclick: click(false) }, icon("arrow-u-up-left", 14), t("row.release"));
    }
    if (r.shield) return null;
    return h("button", { class: "rowbtn", disabled: Boolean(state.busy), title: t("row.keepTitle", { h: r.handle }), onclick: click(true) }, icon("shield-check", 14), t("row.keep"));
  }

  /** Tambah/hapus akun dari whitelist langsung dari daftar. */
  async function setWhitelisted(r, protect) {
    const target = r.handle.toLowerCase();
    const tokens = String(state.settings.whitelist).split(/[\s,;]+/).filter(Boolean);
    const rest = tokens.filter((tok) => !C.parseWhitelist(tok).has(target));
    const next = protect ? [...rest, "@" + r.handle] : rest;
    try {
      state.settings = await Store.saveSettings({ ...state.settings, whitelist: next.join("\n") });
    } catch (e) {
      return setStatus(t("status.keepFailed", { e: Api.describeError(e) }), "error");
    }
    if (protect) state.selected.delete(r.id);
    else {
      const back = computeRows();
      if (["inactive", "small", "oneway"].some((g) => back[g].some((x) => x.id === r.id))) state.selected.add(r.id);
    }
    setStatus(t(protect ? "status.kept" : "status.released", { h: r.handle }), "ok");
    refreshList();
  }

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
      const left = Math.max(0, s.dailyCap - state.daily.count);
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

  // ---------- bar aksi (footer) ----------
  function renderActions() {
    const groups = state.tab === "clean" ? computeRows() : null;
    if (!groups) {
      put(ui.actionbar);
      ui.actionbar.hidden = true;
      syncFoot();
      return;
    }
    ui.actionbar.hidden = false;
    const s = state.settings;
    const count = queueFrom(groups).length;
    const capLeft = Math.max(0, s.dailyCap - state.daily.count);
    const runnable = s.dryRun ? count : Math.min(count, capLeft);

    const info = h(
      "div",
      { class: "info" },
      s.dryRun ? h("span", { class: "mode sim" }, t("mode.sim")) : h("span", { class: "mode live num" }, t("mode.live", { left: capLeft, cap: s.dailyCap })),
      !s.dryRun && runnable > 1 ? h("span", { class: "eta" }, t("actions.eta", { t: I18n.duration(C.estimateSeconds(runnable, s)) })) : null
    );
    const main =
      state.busy === "unfollow"
        ? h("button", { class: "btn", onclick: stop }, icon("stop", 16), t("btn.stop"))
        : h(
            "button",
            { class: "btn " + (s.dryRun ? "primary" : "danger"), disabled: Boolean(state.busy) || count === 0 || runnable === 0, onclick: startUnfollow },
            icon(s.dryRun ? "play" : "user-minus", 16),
            s.dryRun ? t("btn.simulate", { n: count }) : t("btn.unfollow", { n: runnable })
          );
    put(ui.actionbar, info, h("button", { class: "btn", disabled: Boolean(state.busy), onclick: exportScanCsv, title: t("btn.csvTitle") }, icon("download-simple", 16), t("btn.csv")), main);
    syncFoot();
  }

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
      { label: "x_account_based_in", get: (r) => r.basedIn || "" },
      { label: "x_location_accurate", get: (r) => (r.basedIn ? (r.basedAccurate === false ? "no" : "yes") : "") },
      { label: "priority_place", get: (r) => (r.focus ? "yes" : "no") },
      { label: "selected", get: (r) => (state.selected.has(r.id) ? "yes" : "no") },
      { label: "url", get: (r) => `https://x.com/${r.handle}` },
    ]);
    download(`sapux-following-${C.localDateKey()}.csv`, csv);
    setStatus(t("status.csvDone", { n: all.length }), "ok");
  }

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

  // ---------- tab: Rules ----------
  function renderSettings() {
    const s = state.settings;
    const f = {};
    const num = (key, unit, attrs = {}) => h("label", { class: "unit" }, (f[key] = h("input", { type: "number", inputmode: "numeric", value: String(s[key]), ...attrs })), unit ? h("span", null, unit) : null);
    const field = (label, control, help) => h("div", { class: "field" }, h("span", { class: "lbl" }, label), control, help ? h("span", { class: "help" }, help) : null);
    const sw = (key, label, help) =>
      h("label", { class: "switch" }, (f[key] = h("input", { type: "checkbox", role: "switch", checked: Boolean(s[key]) })), h("span", null, h("span", { class: "lbl" }, label), help ? h("div", { class: "help" }, help) : null));
    const preset = (key, value, label) => h("button", { class: "preset", type: "button", onclick: () => { f[key].value = String(value); } }, label);

    f.whitelist = h("textarea", { rows: "5", placeholder: t("rules.whitelist.placeholder"), "aria-label": t("rules.whitelist") });
    f.whitelist.value = s.whitelist;

    const modeCard = h("div", { class: "modecard" + (s.dryRun ? "" : " live") }, sw("dryRun", t("rules.mode.title"), t("rules.mode.help")));
    f.dryRun.addEventListener("change", () => modeCard.classList.toggle("live", !f.dryRun.checked));

    const form = h(
      "form",
      { class: "form", onsubmit: saveSettings },
      modeCard,
      h(
        "section",
        { class: "group" },
        h("h3", { class: "group-title" }, t("rules.who")),
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
      h(
        "section",
        { class: "group" },
        h("h3", { class: "group-title" }, t("rules.speed")),
        h("p", { class: "group-note" }, t("rules.speed.note")),
        field(t("rules.cap"), num("dailyCap", t("unit.accounts"), { min: "1", max: "500" }), t("rules.cap.help")),
        h("div", { class: "grid2" }, field(t("rules.minDelay"), num("minDelaySec", t("unit.seconds"), { min: "10" })), field(t("rules.maxDelay"), num("maxDelaySec", t("unit.seconds"), { min: "10" }))),
        field(t("rules.batch"), num("batchSize", t("unit.accounts"), { min: "1", max: "50" })),
        h("div", { class: "grid2" }, field(t("rules.batchMin"), num("batchPauseMinMin", t("unit.minutes"), { min: "1" })), field(t("rules.batchMax"), num("batchPauseMaxMin", t("unit.minutes"), { min: "1" }))),
        sw("notifications", t("rules.notify"), t("rules.notify.help"))
      ),
      h("div", { class: "formactions" }, h("button", { class: "btn primary", type: "submit", disabled: Boolean(state.busy) }, icon("check-circle", 16), t("rules.save")))
    );

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
      const hasData = users.some((u) => "location" in u);
      const found = hasData
        ? users.filter((u) => {
            const ab = state.about[u.id];
            return Geo.detectGeo(ab && ab.based ? { ...u, basedIn: ab.based, basedAccurate: ab.accurate } : u);
          }).length
        : 0;
      return h(
        "section",
        { class: "group" },
        h("h3", { class: "group-title" }, t("rules.geo")),
        h("p", { class: "group-note" }, t("rules.geo.note")),
        users.length
          ? h("p", { class: "geo-note" + (hasData ? "" : " warn") }, hasData ? t("rules.geo.coverage", { n: n(found), total: n(users.length) }) : t("rules.geo.rescan"))
          : null,
        (ui.geoOfficial = h("div", { class: "field" })) && renderGeoOfficial() && ui.geoOfficial,
        field(t("rules.geo.keep"), picker(f.keepRegions, f.focusRegions, "", t("rules.geo.keep")), t("rules.geo.keep.help")),
        field(t("rules.geo.focus"), picker(f.focusRegions, f.keepRegions, "danger", t("rules.geo.focus")), t("rules.geo.focus.help")),
        sw("focusOfficialOnly", t("rules.geo.officialOnly"), t("rules.geo.officialOnly.help")),
        sw("focusOnly", t("rules.geo.focusOnly"), t("rules.geo.focusOnly.help"))
      );
    }

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
    const backup = h(
      "section",
      { class: "group" },
      h("h3", { class: "group-title" }, t("rules.backup")),
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
    put(ui.body, form, backup, danger);
  }

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

  // ---------- event global ----------
  renderChrome();

  // Bahasa tersimpan dimuat sejak awal supaya tombol melayang langsung memakai bahasa yang benar.
  Store.getSettings()
    .then((s) => {
      state.settings = s;
      I18n.setLang(s.lang);
      renderChrome();
    })
    .catch(() => {});

  let storageTimer = null;
  chrome.storage.onChanged.addListener((changes, area) => {
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

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !ui.panel.hidden && !state.busy && !state.stale) refreshView({ quiet: true }).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((msg) => {
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
})();
