/*
 * SapuX: klien API X.
 *
 * Memakai endpoint yang sama dengan web x.com, dengan sesi login kamu sendiri.
 * Request HANYA dikirim ke x.com / api.x.com. Tidak ada server lain.
 */
(function () {
  "use strict";

  const t = (key, params) => globalThis.SapuI18n.t(key, params);

  // x.com/i/api = same-origin (tanpa CORS). api.x.com = cadangan kalau yang pertama 404.
  const BASES = ["https://x.com/i/api", "https://api.x.com"];
  let baseIndex = 0;

  // ID query GraphQL "About this account". X bisa menggantinya saat deploy; background.js
  // mencatat ID terbaru setiap kali web X sendiri membuka halaman About.
  const ABOUT_QUERY_DEFAULT = "TzOG2twZEfhr9KmClvVVqA";
  let lastRate = null; // { limit, remaining, resetAt } dari jawaban terakhir

  class XApiError extends Error {
    constructor(message, { status = 0, code = null, resetAt = null } = {}) {
      super(message);
      this.name = "XApiError";
      this.status = status;
      this.code = code;
      this.resetAt = resetAt;
    }
  }

  function getCookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }

  function getOwnHandleFromDom() {
    const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    const m = link?.getAttribute("href")?.match(/^\/([A-Za-z0-9_]{1,15})$/);
    return m ? m[1] : null;
  }

  /** Akun X yang sedang login: { key, userId, handle } atau null. */
  function getOwner() {
    const twid = getCookie("twid");
    const m = twid && twid.match(/u=(\d+)/);
    const handle = getOwnHandleFromDom();
    if (m) return { key: m[1], userId: m[1], handle };
    if (handle) return { key: "h:" + handle.toLowerCase(), userId: null, handle };
    return null;
  }

  async function getBearer() {
    try {
      const r = await chrome.runtime.sendMessage({ type: "sapux:getBearer" });
      return r?.bearer || null;
    } catch {
      return null; // mis. ekstensi baru di-reload: refresh halaman
    }
  }

  async function request(method, path, params = {}) {
    if (!chrome.runtime?.id) {
      throw new XApiError(t("err.contextGone"), { code: "CONTEXT_GONE" });
    }
    const bearer = await getBearer();
    if (!bearer) {
      throw new XApiError(t("err.noAuth"), { code: "NO_AUTH" });
    }
    const csrf = getCookie("ct0");
    if (!csrf) throw new XApiError(t("err.noLogin"), { code: "NO_LOGIN" });

    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") qs.set(k, String(v));
    }
    const query = qs.toString();

    let lastError = null;
    let notFound = null; // 404 dari base pertama lebih informatif daripada error jaringan base cadangan
    for (let i = baseIndex; i < BASES.length; i++) {
      const url = BASES[i] + path + (method === "GET" && query ? "?" + query : "");
      const headers = {
        authorization: bearer,
        "x-csrf-token": csrf,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-client-language": document.documentElement.lang || "en",
      };
      if (method === "POST") headers["content-type"] = "application/x-www-form-urlencoded";

      let res;
      try {
        res = await fetch(url, {
          method,
          credentials: "include",
          headers,
          body: method === "POST" ? query : undefined,
        });
      } catch (e) {
        lastError = new XApiError(t("err.network", { e: e.message }), { code: "NETWORK" });
        continue;
      }

      if (res.status === 404 && i < BASES.length - 1) {
        notFound = new XApiError(t("err.notFound"), { status: 404 });
        continue;
      }
      if (res.status !== 404) baseIndex = i; // 404 (mis. query GraphQL lama) jangan memindahkan base untuk request lain

      const remaining = res.headers.get("x-rate-limit-remaining");
      const resetSec = Number(res.headers.get("x-rate-limit-reset"));
      lastRate = remaining == null ? null : { limit: Number(res.headers.get("x-rate-limit-limit")) || null, remaining: Number(remaining), resetAt: resetSec ? resetSec * 1000 : null };

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const first = json?.errors?.[0];
        const reset = Number(res.headers.get("x-rate-limit-reset"));
        throw new XApiError(first?.message || `HTTP ${res.status}`, {
          status: res.status,
          code: first?.code ?? null,
          resetAt: reset ? reset * 1000 : null,
        });
      }
      return json;
    }
    throw notFound || lastError || new XApiError(t("err.notFound"), { status: 404 });
  }

  function ownerParams(owner) {
    return owner.userId ? { user_id: owner.userId } : { screen_name: owner.handle };
  }

  /** Satu halaman (maks. 200) akun yang kamu follow, termasuk tweet terakhir mereka. */
  function getFollowingPage(owner, cursor = "-1") {
    return request("GET", "/1.1/friends/list.json", {
      ...ownerParams(owner),
      count: 200,
      cursor,
      skip_status: "false",
      include_user_entities: "false",
    });
  }

  function unfollow(userId) {
    return request("POST", "/1.1/friendships/destroy.json", { user_id: userId });
  }

  function follow(userId) {
    return request("POST", "/1.1/friendships/create.json", { user_id: userId });
  }

  async function aboutQueryId() {
    try {
      const r = await chrome.storage.local.get("gql:AboutAccountQuery");
      const id = r["gql:AboutAccountQuery"]?.id;
      return /^[A-Za-z0-9_-]{10,40}$/.test(id || "") ? id : ABOUT_QUERY_DEFAULT;
    } catch {
      return ABOUT_QUERY_DEFAULT;
    }
  }

  /** Data "About this account" (termasuk "Account based in") satu akun. */
  async function getAbout(handle) {
    const id = await aboutQueryId();
    return request("GET", `/graphql/${id}/AboutAccountQuery`, { variables: JSON.stringify({ screenName: handle }) });
  }

  /** Batas request dari jawaban X terakhir (null kalau X tidak mengirimnya). */
  function rate() {
    return lastRate;
  }

  /** Pesan error yang bisa dipahami manusia. */
  function describeError(err) {
    if (!err) return t("err.unknown");
    if (err.name === "AbortError") return t("status.stopped");
    const { status, code } = err;
    if (code === "CONTEXT_GONE" || /context invalidated/i.test(String(err.message))) return t("err.contextGone");
    if (status === 429 || code === 88) return t("err.rate");
    if (code === 326) return t("err.locked");
    if (code === 344) return t("err.daily");
    if (code === 64) return t("err.suspended");
    if (status === 401 || code === 89 || code === 32) return t("err.session");
    if (status === 403) return t("err.forbidden", { code: code ? ", " + code : "" });
    return err.message || String(err);
  }

  globalThis.SapuApi = {
    XApiError,
    getOwner,
    getFollowingPage,
    unfollow,
    follow,
    getAbout,
    rate,
    describeError,
  };
})();
