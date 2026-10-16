/*
 * SapuX panel: tab Review
 *
 * Daftar akun, pencarian, filter follow balik, antrean, baris akun, dan bar aksi.
 * File-file ui/*.js dimuat berurutan sebagai content script dan berbagi scope global
 * (dunia terisolasi ekstensi, tidak terlihat oleh halaman x.com). ui/panel.js memasang panel.
 */
"use strict";

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
    (ui.queueBody = h("div", { class: "banner-body" }, queueBody())),
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
    const cls = "tag geo" + (r.shield === "region" ? " keep" : r.focus && !r.shield ? " focus" : "") + (r.geo.confidence === "low" ? " low" : "");
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

/** Teks kartu antrean; kalau jatah 24 jam sedang penuh, sebut kapan bisa dilanjutkan. */
function queueBody() {
  const when = fmtDateTime(state.queue.savedAt);
  const use = capUsage();
  if (!state.settings.dryRun && use.left === 0 && use.nextFreeAt) return t("queue.bodyWait", { when, slot: fmtSlot(use.nextFreeAt) });
  return t("queue.body", { when });
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
  const use = capUsage(s);
  const capLeft = use.left;
  const runnable = s.dryRun ? count : Math.min(count, capLeft);
  const liveText = capLeft === 0 && use.nextFreeAt ? t("mode.liveFull", { time: fmtSlotTime(use.nextFreeAt) }) : t("mode.live", { left: capLeft, cap: s.dailyCap });

  const info = h(
    "div",
    { class: "info" },
    s.dryRun ? h("span", { class: "mode sim" }, t("mode.sim")) : h("span", { class: "mode live num" }, liveText),
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
