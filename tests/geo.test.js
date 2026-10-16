// Jalankan: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../lib/geo.js");

const geo = (location, lang = "") => G.detectGeo({ location, lang });
const pick = (g, ...keys) => g && Object.fromEntries(keys.map((k) => [k, g[k]]));

test("bendera di bio langsung jadi negara", () => {
  assert.deepEqual(pick(geo("🇮🇩 web3 builder"), "country", "region", "source", "confidence"), { country: "ID", region: "sea", source: "flag", confidence: "high" });
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
  assert.deepEqual(pick(geo("", "in"), "country", "region", "source", "hint", "confidence"), { country: "ID", region: "sea", source: "lang", hint: "in", confidence: "low" });
  assert.equal(geo("", "hi").country, "IN");
  assert.deepEqual(pick(geo("", "bn"), "country", "region", "source"), { country: null, region: "south-asia", source: "lang" });
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

test("Account based in dari X: nama negara & wilayah", () => {
  assert.deepEqual(G.basedInToGeo("Indonesia"), { country: "ID", region: "sea" });
  assert.deepEqual(G.basedInToGeo("United States"), { country: "US", region: "americas" });
  assert.deepEqual(G.basedInToGeo("South Asia"), { country: null, region: "south-asia" });
  assert.deepEqual(G.basedInToGeo("Southeast Asia"), { country: null, region: "sea" });
  assert.deepEqual(G.basedInToGeo("Europe"), { country: null, region: "europe" });
  assert.equal(G.basedInToGeo("Turkey").country, "TR");
  assert.equal(G.basedInToGeo("Hong Kong").country, "HK");
  assert.equal(G.basedInToGeo(""), null);
});

test("data X menang atas bio & bahasa, dan menandai VPN", () => {
  const g = G.detectGeo({ basedIn: "India", basedAccurate: true, location: "Jakarta", lang: "in" });
  assert.deepEqual(pick(g, "country", "region", "source", "hint", "accurate"), { country: "IN", region: "south-asia", source: "x", hint: "India", accurate: true });
  const vpn = G.detectGeo({ basedIn: "India", basedAccurate: false, location: "Jakarta" });
  assert.equal(vpn.accurate, false);
  assert.equal(G.trustedForFocus(vpn), false);
  assert.equal(G.trustedForFocus(G.detectGeo({ location: "🇮🇳 Mumbai" })), true);
  assert.equal(G.trustedForFocus(G.detectGeo({ location: "Mumbai" })), false); // keyakinan sedang
});

test("parseAbout membaca jawaban AboutAccountQuery", () => {
  const ok = { data: { user_result_by_screen_name: { result: { __typename: "User", about_profile: { account_based_in: "Indonesia", location_accurate: true, source: "Indonesia Android App" } } } } };
  assert.deepEqual(G.parseAbout(ok), { based: "Indonesia", accurate: true });
  assert.deepEqual(G.parseAbout({ data: { user_result_by_screen_name: { result: { __typename: "UserUnavailable" } } } }), { none: true });
  assert.deepEqual(G.parseAbout({ data: {} }), { none: true });
  assert.deepEqual(G.parseAbout(null), { none: true });
});

const guess = (u) => G.guessGeo(u);

test("petunjuk baru: bendera di nama, sebutan penduduk, huruf khas, kata sehari-hari", () => {
  assert.deepEqual(pick(guess({ name: "Budi 🇮🇩" }), "country", "confidence"), { country: "ID", confidence: "high" });
  assert.equal(guess({ bio: "Proud Indian | crypto" }).country, "IN");
  assert.equal(guess({ name: "राज शर्मा" }).country, "IN"); // Devanagari
  assert.equal(guess({ tweetText: "สวัสดีครับ" }).country, "TH");
  assert.equal(guess({ tweetText: "Cảm ơn mọi người" }).country, "VN");
  assert.equal(guess({ bio: "gak ada yang tau wkwk, garapan airdrop aja" }).country, "ID");
  assert.equal(guess({ bio: "salamat po sa lahat, grabe talaga" }).country, "PH");
  assert.equal(guess({ bio: "bhai kya scene hai, sab moon" }).region, "south-asia");
  assert.equal(guess({ bio: "building the future of finance" }), null);
  assert.equal(guess({ bio: "Java and Rust developer" }), null);
});

test("petunjuk yang searah menaikkan keyakinan, yang bertentangan menurunkannya", () => {
  const one = guess({ location: "Jakarta" });
  const two = guess({ location: "Jakarta", name: "Sari 🇮🇩", bio: "gak tau wkwk" });
  assert.equal(one.confidence, "medium");
  assert.equal(two.confidence, "high");
  assert.ok(two.score > one.score);
  const mixed = guess({ location: "Dubai", name: "Rahul 🇮🇳" });
  assert.equal(mixed.country, null); // tidak cukup yakin negara mana
  assert.equal(mixed.region, "south-asia");
  assert.equal(mixed.confidence, "low");
  assert.equal(guess({ lang: "in" }).confidence, "low");
});

test("measureAccuracy membandingkan tebakan dengan data X", () => {
  const users = [
    { location: "Jakarta", basedIn: "Indonesia" }, // cocok
    { location: "New York", basedIn: "India" }, // meleset
    { lang: "hi", basedIn: "South Asia" }, // cocok di level wilayah
    { location: "Mumbai", basedIn: "India", basedAccurate: false }, // data X tidak akurat: tidak dihitung
    { bio: "building", basedIn: "Nigeria" }, // tidak ada tebakan: tidak dihitung
  ];
  const m = G.measureAccuracy(users);
  assert.equal(m.n, 3);
  assert.equal(m.match, 2);
  assert.equal(m.byConfidence.medium.n, 2);
  assert.equal(m.byConfidence.low.match, 1);
});
