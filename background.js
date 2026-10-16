/*
 * SapuX: service worker.
 *
 * Satu-satunya tugas: menangkap header "Authorization" yang dikirim oleh web X
 * sendiri, supaya content script bisa memanggil endpoint X dengan sesi kamu.
 *
 * Header disimpan di chrome.storage.session: hanya di RAM, hilang saat browser
 * ditutup, tidak pernah ditulis ke disk dan tidak pernah dikirim ke server lain.
 * Cookie login (auth_token) TIDAK pernah dibaca oleh ekstensi ini.
 */

const CAPTURE_URLS = ["https://x.com/i/api/*", "https://api.x.com/*"];
let cachedBearer = null;
let lastAboutQuery = null;

// storage.session hanya bisa diakses service worker (bukan oleh halaman/content script).
chrome.storage.session.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Catat ID query "About this account" terbaru yang dipakai web X (bisa berubah saat X deploy).
    const about = details.url.match(/\/graphql\/([A-Za-z0-9_-]{10,40})\/AboutAccountQuery/);
    if (about && about[1] !== lastAboutQuery) {
      lastAboutQuery = about[1];
      chrome.storage.local.set({ "gql:AboutAccountQuery": { id: about[1], at: new Date().toISOString() } }).catch(() => {});
    }
    const header = details.requestHeaders?.find((h) => h.name.toLowerCase() === "authorization");
    const value = header?.value;
    if (value && value.startsWith("Bearer ") && value !== cachedBearer) {
      cachedBearer = value;
      chrome.storage.session.set({ bearer: value }).catch(() => {});
    }
  },
  { urls: CAPTURE_URLS },
  ["requestHeaders", "extraHeaders"]
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "sapux:getBearer") return false;

  // Hanya layani content script SapuX sendiri yang berjalan di tab x.com.
  const fromX = sender.id === chrome.runtime.id && typeof sender.url === "string" && sender.url.startsWith("https://x.com/");
  if (!fromX) {
    sendResponse({ bearer: null });
    return false;
  }

  if (cachedBearer) {
    sendResponse({ bearer: cachedBearer });
    return false;
  }
  chrome.storage.session
    .get("bearer")
    .then((r) => {
      cachedBearer = r.bearer || null;
      sendResponse({ bearer: cachedBearer });
    })
    .catch(() => sendResponse({ bearer: null }));
  return true; // jawaban async
});

// Notifikasi desktop saat proses unfollow selesai/berhenti. Klik notifikasi = kembali ke tab X-nya.
const notificationTabs = new Map();
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "sapux:notify" || sender.id !== chrome.runtime.id || !sender.tab) return false;
  const id = `sapux-${Date.now()}`;
  notificationTabs.set(id, { tabId: sender.tab.id, windowId: sender.tab.windowId });
  chrome.notifications
    .create(id, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: String(message.title || "SapuX").slice(0, 120),
      message: String(message.message || "").slice(0, 300),
      priority: 0,
    })
    .catch(() => {});
  return false;
});

chrome.notifications.onClicked.addListener((id) => {
  const target = notificationTabs.get(id);
  chrome.notifications.clear(id).catch(() => {});
  if (!target) return;
  chrome.tabs.update(target.tabId, { active: true }).catch(() => {});
  chrome.windows.update(target.windowId, { focused: true }).catch(() => {});
  notificationTabs.delete(id);
});

// Klik ikon ekstensi: buka/tutup panel di tab x.com, atau buka x.com kalau belum di sana.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null && typeof tab.url === "string" && tab.url.startsWith("https://x.com/")) {
    chrome.tabs.sendMessage(tab.id, { type: "sapux:toggle" }).catch(() => {});
  } else {
    chrome.tabs.create({ url: "https://x.com/home" });
  }
});
