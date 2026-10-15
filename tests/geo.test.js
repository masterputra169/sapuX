// Jalankan: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../lib/geo.js");

const geo = (location, lang = "") => G.detectGeo({ location, lang });

test("bendera di bio langsung jadi negara", () => {
  assert.deepEqual(geo("🇮🇩 web3 builder"), { country: "ID", region: "sea", source: "flag", hint: "🇮🇩 web3 builder" });
  assert.equal(geo("gm 🇮🇳").country, "IN");
  assert.equal(geo("🇮🇳").region, "south-asia");
  assert.equal(geo("🇧🇷 São Paulo").region, "americas");
});

test("nama kota / negara di bio, per kata utuh", () => {
  assert.equal(geo("Jakarta, Indonesia").country, "ID");
  assert.equal(geo("Kediri, Jawa Timur").country, "ID");
  assert.equal(geo("Yogyakarta").source, "bio");
  assert.equal(geo("Mumbai").country, "IN");
  assert.equal(geo("New Delhi, India").country, "IN");
  assert.equal(geo("Indiana, USA").country, "US"); // "indiana" bukan "india"
  assert.equal(geo("Kuala Lumpur").country, "MY");
  assert.equal(geo("Ho Chi Minh City").country, "VN");
  assert.equal(geo("SÃO PAULO").country, "BR"); // aksen & huruf besar
  assert.equal(geo("London | Lagos").country, "GB"); // yang disebut pertama
});

test("kata ambigu tidak ditebak", () => {
  assert.equal(geo("Java developer"), null);
  assert.equal(geo("Solo traveler"), null);
  assert.equal(geo("Web3 🌍"), null);
  assert.equal(geo("metaverse"), null);
  assert.equal(geo(""), null);
});

test("bahasa posting terakhir hanya dipakai kalau bio tidak membantu", () => {
  assert.deepEqual(geo("", "in"), { country: "ID", region: "sea", source: "lang", hint: "in" });
  assert.equal(geo("", "hi").country, "IN");
  assert.deepEqual(geo("", "bn"), { country: null, region: "south-asia", source: "lang", hint: "bn" });
  assert.equal(geo("", "ms").region, "sea");
  assert.equal(geo("", "en"), null);
  assert.equal(geo("", "es"), null);
  assert.equal(geo("", "und"), null);
  assert.equal(geo("Lagos", "in").country, "NG"); // bio menang atas bahasa
});

test("geoMatches cocok lewat negara atau wilayah", () => {
  const keep = new Set(["sea"]);
  assert.equal(G.geoMatches(geo("Manila"), keep), true);
  assert.equal(G.geoMatches(geo("Mumbai"), keep), false);
  assert.equal(G.geoMatches(null, keep), false);
  assert.equal(G.geoMatches(geo("Mumbai"), new Set()), false);
});

test("flagEmoji membalik kode negara", () => {
  assert.equal(G.flagEmoji("ID"), "🇮🇩");
  assert.equal(G.flagEmoji("sea"), "");
});
