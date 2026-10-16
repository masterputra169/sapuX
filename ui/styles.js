/*
 * SapuX panel: gaya visual
 *
 * Logo dan CSS panel (token warna, tema gelap/terang, komponen).
 * File-file ui/*.js dimuat berurutan sebagai content script dan berbagi scope global
 * (dunia terisolasi ekstensi, tidak terlihat oleh halaman x.com). ui/panel.js memasang panel.
 */
"use strict";

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
  .tag.geo.low { opacity: .62; }
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
  .fold { gap: 0; border-top: 1px solid var(--line); padding-top: 14px; }
  .fold > summary { list-style: none; display: flex; align-items: center; gap: 10px; cursor: pointer; border-radius: 8px; }
  .fold > summary::-webkit-details-marker { display: none; }
  .fold > summary:focus-visible { outline: 2px solid var(--amber); outline-offset: 4px; }
  .fold-sum { flex: 1; min-width: 0; text-align: right; font-size: 12.5px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fold[open] .fold-sum { visibility: hidden; }
  .chev { flex: none; width: 8px; height: 8px; border: solid var(--muted); border-width: 0 1.5px 1.5px 0; transform: translateY(-2px) rotate(45deg); transition: transform .18s var(--ease-out); }
  .fold[open] .chev { transform: translateY(1px) rotate(225deg); }
  .health { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .health-item { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: start; font-size: 12.5px; color: var(--text); text-wrap: pretty; }
  .health-item .ico { margin-top: 1px; color: var(--faint); }
  .health-item.ok .ico { color: var(--ok); }
  .health-item.warn .ico { color: var(--accent-text); }
  .health-item.fail .ico { color: var(--danger); }
  .health-item.fail { color: var(--danger); }
  .fold-body { display: flex; flex-direction: column; gap: 16px; padding-top: 16px; }
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
  .geo-note.accuracy { margin-top: -10px; color: var(--muted); }
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
