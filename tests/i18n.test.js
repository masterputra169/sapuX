const test = require("node:test");
const assert = require("node:assert/strict");
const I18n = require("../lib/i18n.js");
const C = require("../lib/core.js");

test("English dan Indonesia punya kunci yang sama persis", () => {
  const en = Object.keys(I18n.STRINGS.en).sort();
  const id = Object.keys(I18n.STRINGS.id).sort();
  assert.deepEqual(id.filter((k) => !en.includes(k)), [], "kunci hanya ada di id");
  assert.deepEqual(en.filter((k) => !id.includes(k)), [], "kunci hanya ada di en");
});

test("tidak ada em-dash/en-dash di teks antarmuka", () => {
  for (const lang of I18n.LANGS) {
    for (const [k, v] of Object.entries(I18n.STRINGS[lang])) assert.ok(!/[–—]/.test(v), `${lang}.${k}`);
  }
});

test("parameter di setiap terjemahan cocok dengan versi English", () => {
  const params = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
  for (const [k, v] of Object.entries(I18n.STRINGS.en)) assert.equal(params(I18n.STRINGS.id[k]), params(v), k);
});

test("English default, bisa pindah ke Indonesia, bahasa lain jatuh ke English", () => {
  I18n.setLang("xx");
  assert.equal(I18n.getLang(), "en");
  assert.equal(I18n.t("tab.review"), "Review");
  I18n.setLang("id");
  assert.equal(I18n.t("tab.review"), "Daftar");
  assert.equal(I18n.t("btn.unfollow", { n: 4 }), "Unfollow 4");
  I18n.setLang("en");
});

test("format angka & durasi per bahasa", () => {
  assert.equal(I18n.count(1234, "en"), "1.2K");
  assert.equal(I18n.count(2560000, "en"), "2.5M");
  assert.equal(I18n.count(1234, "id"), "1,2 rb");
  I18n.setLang("en");
  assert.equal(I18n.duration(5400), "1 h 30 min");
  I18n.setLang("id");
  assert.equal(I18n.duration(90), "1 menit 30 detik");
  I18n.setLang("en");
});

test("pengaturan bahasa: default en, hanya en/id yang diterima", () => {
  assert.equal(C.sanitizeSettings({}).lang, "en");
  assert.equal(C.sanitizeSettings({ lang: "id" }).lang, "id");
  assert.equal(C.sanitizeSettings({ lang: "fr" }).lang, "en");
});
