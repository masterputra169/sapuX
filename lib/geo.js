/*
 * SapuX: perkiraan lokasi akun TANPA request tambahan.
 *
 * Sumber (urutan prioritas):
 *   0. "Account based in" resmi dari X (halaman About akun), kalau sudah dicek.
 *   1. Emoji bendera di kolom lokasi bio ("🇮🇩", "🇮🇳").
 *   2. Nama negara / kota di kolom lokasi bio ("Jakarta", "Mumbai, India").
 *   3. Bahasa posting terakhir ("in" = Indonesia, "hi" = India). Hanya bahasa yang jelas asalnya.
 *
 * Ini perkiraan. Kolom lokasi bisa diisi apa saja dan bahasa tidak selalu = negara,
 * jadi lokasi tidak pernah membuat akun jadi kandidat unfollow dengan sendirinya.
 */
(function (root) {
  "use strict";

  /** Wilayah -> kode negara ISO 3166-1. */
  const REGION_COUNTRIES = {
    sea: ["ID", "MY", "SG", "PH", "TH", "VN", "MM", "KH", "LA", "BN", "TL"],
    "south-asia": ["IN", "PK", "BD", "LK", "NP", "BT", "MV", "AF"],
    "east-asia": ["CN", "JP", "KR", "KP", "TW", "HK", "MO", "MN"],
    "middle-east": ["AE", "SA", "QA", "KW", "BH", "OM", "YE", "IQ", "IR", "IL", "PS", "JO", "LB", "SY", "TR", "CY"],
    africa: ["NG", "GH", "KE", "ZA", "EG", "MA", "DZ", "TN", "ET", "UG", "TZ", "CM", "CI", "SN", "RW", "ZW", "ZM", "AO", "SD", "LY", "BJ", "TG", "ML", "BF", "NE", "MZ", "MW", "BW", "NA", "CD", "CG", "GA", "SL", "LR", "SO"],
    europe: ["GB", "IE", "FR", "DE", "NL", "BE", "LU", "CH", "AT", "IT", "ES", "PT", "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "SE", "NO", "DK", "FI", "IS", "EE", "LV", "LT", "UA", "BY", "RU", "RS", "HR", "SI", "BA", "ME", "MK", "AL", "MT", "MD", "GE", "AM", "AZ"],
    americas: ["US", "CA", "MX", "BR", "AR", "CL", "CO", "PE", "VE", "EC", "BO", "PY", "UY", "CR", "PA", "GT", "HN", "SV", "NI", "CU", "DO", "PR", "JM", "TT", "HT", "BS", "BB"],
    oceania: ["AU", "NZ", "FJ", "PG", "WS", "TO", "VU", "SB"],
  };
  const REGIONS = Object.keys(REGION_COUNTRIES);
  const REGION_OF = {};
  for (const [region, codes] of Object.entries(REGION_COUNTRIES)) for (const code of codes) REGION_OF[code] = region;

  /**
   * Kata kunci kolom lokasi (huruf kecil, tanpa aksen). Dicocokkan per kata utuh,
   * jadi "india" tidak cocok dengan "indiana". Kata yang ambigu sengaja tidak dimasukkan
   * (mis. "java" = bahasa pemrograman, "solo", "georgia", "punjab", "bengal").
   */
  const KEYWORDS = {
    ID: ["indonesia", "indonesian", "indo", "jakarta", "jkt", "bandung", "surabaya", "yogyakarta", "jogja", "jogjakarta", "yogya", "semarang", "medan", "makassar", "bali", "denpasar", "malang", "kediri", "bekasi", "depok", "tangerang", "bogor", "surakarta", "palembang", "pekanbaru", "batam", "balikpapan", "samarinda", "pontianak", "banjarmasin", "manado", "padang", "lampung", "aceh", "jawa", "sumatra", "sumatera", "kalimantan", "sulawesi", "papua", "lombok", "nusantara", "cirebon", "sidoarjo", "gresik", "jember", "purwokerto", "tasikmalaya", "cimahi", "kupang", "jambi", "bengkulu", "ambon", "mataram"],
    MY: ["malaysia", "kuala lumpur", "selangor", "penang", "johor", "sabah", "sarawak", "putrajaya", "ipoh", "melaka", "malacca"],
    SG: ["singapore", "singapura"],
    PH: ["philippines", "pilipinas", "manila", "cebu", "davao", "quezon city", "makati", "pinoy"],
    TH: ["thailand", "bangkok", "chiang mai", "phuket", "pattaya"],
    VN: ["vietnam", "viet nam", "hanoi", "ha noi", "ho chi minh", "saigon", "da nang"],
    MM: ["myanmar", "yangon", "burma"],
    KH: ["cambodia", "phnom penh"],
    LA: ["laos", "vientiane"],
    BN: ["brunei"],
    TL: ["timor leste"],
    IN: ["india", "bharat", "mumbai", "bombay", "delhi", "new delhi", "bangalore", "bengaluru", "hyderabad", "chennai", "kolkata", "calcutta", "pune", "ahmedabad", "jaipur", "lucknow", "kanpur", "nagpur", "indore", "bhopal", "patna", "surat", "noida", "gurgaon", "gurugram", "kerala", "kochi", "goa", "gujarat", "maharashtra", "rajasthan", "tamil nadu", "karnataka", "telangana", "uttar pradesh", "bihar", "odisha", "assam", "chandigarh", "varanasi", "visakhapatnam", "coimbatore", "mysore", "thane", "ranchi", "dehradun"],
    PK: ["pakistan", "karachi", "lahore", "islamabad", "rawalpindi", "peshawar", "faisalabad", "multan"],
    BD: ["bangladesh", "dhaka", "chittagong"],
    LK: ["sri lanka", "colombo"],
    NP: ["nepal", "kathmandu"],
    CN: ["china", "beijing", "shanghai", "shenzhen", "guangzhou"],
    HK: ["hong kong"],
    TW: ["taiwan", "taipei"],
    JP: ["japan", "tokyo", "osaka", "kyoto"],
    KR: ["korea", "south korea", "seoul", "busan"],
    AE: ["uae", "dubai", "abu dhabi", "united arab emirates"],
    SA: ["saudi", "saudi arabia", "riyadh", "jeddah"],
    TR: ["turkey", "turkiye", "istanbul", "ankara"],
    IL: ["israel", "tel aviv"],
    NG: ["nigeria", "lagos", "abuja", "naija"],
    GH: ["ghana", "accra"],
    KE: ["kenya", "nairobi"],
    ZA: ["south africa", "johannesburg", "cape town"],
    EG: ["egypt", "cairo"],
    US: ["usa", "united states", "new york", "nyc", "san francisco", "los angeles", "miami", "chicago", "texas", "california", "austin", "seattle", "boston"],
    CA: ["canada", "toronto", "vancouver", "montreal"],
    BR: ["brazil", "brasil", "sao paulo"],
    MX: ["mexico", "ciudad de mexico"],
    AR: ["argentina", "buenos aires"],
    GB: ["uk", "united kingdom", "london", "england", "manchester", "scotland"],
    DE: ["germany", "deutschland", "berlin", "munich", "munchen"],
    FR: ["france", "paris"],
    NL: ["netherlands", "amsterdam"],
    ES: ["spain", "espana", "madrid", "barcelona"],
    IT: ["italy", "italia", "milan", "rome", "roma"],
    CH: ["switzerland", "zurich", "geneva", "zug"],
    PT: ["portugal", "lisbon", "lisboa"],
    UA: ["ukraine", "kyiv", "kiev"],
    RU: ["russia", "moscow"],
    AU: ["australia", "sydney", "melbourne"],
    NZ: ["new zealand", "auckland"],
  };

  /** Bahasa posting yang cukup jelas asal wilayahnya. Bahasa global (en, es, pt, fr, ar, ru...) sengaja diabaikan. */
  const LANGS = {
    in: { country: "ID" }, // X memakai "in" untuk Bahasa Indonesia
    id: { country: "ID" },
    ms: { region: "sea" }, // Melayu: Malaysia / Brunei / Indonesia
    tl: { country: "PH" },
    th: { country: "TH" },
    vi: { country: "VN" },
    my: { country: "MM" },
    km: { country: "KH" },
    lo: { country: "LA" },
    hi: { country: "IN" },
    mr: { country: "IN" },
    gu: { country: "IN" },
    kn: { country: "IN" },
    ml: { country: "IN" },
    te: { country: "IN" },
    or: { country: "IN" },
    as: { country: "IN" },
    bn: { region: "south-asia" }, // Bangladesh / India
    ta: { region: "south-asia" }, // India / Sri Lanka
    ur: { region: "south-asia" }, // Pakistan / India
    pa: { region: "south-asia" },
    si: { country: "LK" },
    ne: { country: "NP" },
    ja: { country: "JP" },
    ko: { country: "KR" },
    zh: { region: "east-asia" },
    fa: { country: "IR" },
    he: { country: "IL" },
    iw: { country: "IL" },
    tr: { country: "TR" },
  };

  /** Pilihan yang bisa dipakai di Aturan (urutan tampilan). */
  const OPTION_REGIONS = REGIONS;
  const OPTION_COUNTRIES = ["ID", "MY", "SG", "PH", "TH", "VN", "IN", "PK", "BD", "NG", "US"];
  const OPTIONS = new Set([...OPTION_REGIONS, ...OPTION_COUNTRIES]);

  // Indeks kata kunci -> negara, diurutkan dari frasa terpanjang supaya "new delhi" menang atas "delhi".
  const KEYWORD_LIST = Object.entries(KEYWORDS)
    .flatMap(([code, words]) => words.map((w) => [w, code]))
    .sort((a, b) => b[0].length - a[0].length);

  function normalizeText(text) {
    return (
      " " +
      String(text || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim() +
      " "
    );
  }

  function flagCountry(text) {
    const m = String(text || "").match(/([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/u);
    if (!m) return null;
    const code = String.fromCharCode(m[1].codePointAt(0) - 0x1f1e6 + 65, m[2].codePointAt(0) - 0x1f1e6 + 65);
    return /^[A-Z]{2}$/.test(code) ? code : null;
  }

  function keywordCountry(text) {
    const norm = normalizeText(text);
    if (norm.trim() === "") return null;
    let best = null;
    for (const [word, code] of KEYWORD_LIST) {
      const at = norm.indexOf(" " + word + " ");
      if (at !== -1 && (best === null || at < best.at)) best = { at, code, word };
    }
    return best;
  }

  // ---------- "Account based in" dari X ----------
  // X menulis nama negara dalam bahasa Inggris ("Indonesia", "United States"), atau wilayah
  // kalau pemilik akun memilih menampilkan wilayah saja ("South Asia", "Europe").
  const NAME_ALIASES = {
    usa: "US", "united states of america": "US", us: "US", uk: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB",
    turkey: "TR", turkiye: "TR", russia: "RU", "south korea": "KR", korea: "KR", "north korea": "KP", "hong kong": "HK", macau: "MO", macao: "MO",
    taiwan: "TW", vietnam: "VN", "viet nam": "VN", palestine: "PS", "ivory coast": "CI", "cote d ivoire": "CI", "czech republic": "CZ", czechia: "CZ",
    burma: "MM", myanmar: "MM", "east timor": "TL", "timor leste": "TL", uae: "AE", "dr congo": "CD", "democratic republic of the congo": "CD", "republic of the congo": "CG",
    laos: "LA", syria: "SY", iran: "IR", "the netherlands": "NL", holland: "NL", bolivia: "BO", venezuela: "VE", tanzania: "TZ", moldova: "MD",
  };
  const REGION_NAMES = [
    [/south ?east(ern)? asia|south-eastern asia|asean/, "sea"],
    [/south(ern)? asia|indian subcontinent/, "south-asia"],
    [/east(ern)? asia/, "east-asia"],
    [/middle east|west(ern)? asia|gulf|arab/, "middle-east"],
    [/africa/, "africa"],
    [/europe/, "europe"],
    [/america|caribbean/, "americas"],
    [/oceania|australia and new zealand|australasia|melanesia|polynesia|micronesia|pacific/, "oceania"],
  ];
  let countryIndex = null;
  function countryByName(name) {
    if (!countryIndex) {
      countryIndex = new Map();
      let names = null;
      try {
        names = new Intl.DisplayNames(["en"], { type: "region" });
      } catch {
        /* ICU tidak lengkap: alias saja */
      }
      if (names) {
        for (let a = 65; a <= 90; a++) {
          for (let b = 65; b <= 90; b++) {
            const code = String.fromCharCode(a, b);
            let label;
            try {
              label = names.of(code);
            } catch {
              continue;
            }
            if (!label || label === code) continue;
            countryIndex.set(normalizeText(label).trim(), code);
            const short = label.replace(/\s*\(.*\)\s*/g, " ").replace(/\s+SAR China$/, ""); // "Myanmar (Burma)", "Hong Kong SAR China"
            countryIndex.set(normalizeText(short).trim(), code);
          }
        }
      }
      for (const [alias, code] of Object.entries(NAME_ALIASES)) countryIndex.set(alias, code);
    }
    return countryIndex.get(normalizeText(name).trim()) || null;
  }

  /** "Indonesia" -> { country: "ID", region: "sea" }, "South Asia" -> { country: null, region: "south-asia" }. */
  function basedInToGeo(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;
    const country = countryByName(raw);
    if (country) return { country, region: REGION_OF[country] || null };
    const norm = normalizeText(raw);
    for (const [re, region] of REGION_NAMES) if (re.test(norm)) return { country: null, region };
    return { country: null, region: null }; // dikenal X tapi tidak bisa dipetakan: tampilkan apa adanya
  }

  const cache = new Map();

  /**
   * Perkiraan lokasi akun.
   * Hasil: null, atau { country: "ID"|null, region: "sea"|null, source: "flag"|"bio"|"lang", hint }
   */
  function detectGeo(user) {
    const location = String(user?.location || "");
    const lang = String(user?.lang || "").toLowerCase();
    const basedIn = String(user?.basedIn || "");
    const accurate = user?.basedAccurate !== false;
    const key = basedIn + "\u0000" + accurate + "\u0000" + location + "\u0000" + lang;
    if (cache.has(key)) return cache.get(key);

    let result = null;
    if (basedIn) {
      const g = basedInToGeo(basedIn);
      if (g) result = { country: g.country, region: g.region, source: "x", hint: basedIn, accurate };
    }
    const flag = result ? null : flagCountry(location);
    if (flag) result = { country: flag, region: REGION_OF[flag] || null, source: "flag", hint: location };
    if (!result) {
      const kw = keywordCountry(location);
      if (kw) result = { country: kw.code, region: REGION_OF[kw.code] || null, source: "bio", hint: location };
    }
    if (!result && LANGS[lang]) {
      const l = LANGS[lang];
      result = { country: l.country || null, region: l.region || REGION_OF[l.country] || null, source: "lang", hint: lang };
    }

    if (cache.size > 20000) cache.clear();
    cache.set(key, result);
    return result;
  }

  /** Apakah lokasi `geo` cocok dengan salah satu kode (negara "ID" atau wilayah "sea") di `codes`. */
  function geoMatches(geo, codes) {
    if (!geo || !codes || !codes.size) return false;
    return (geo.country != null && codes.has(geo.country)) || (geo.region != null && codes.has(geo.region));
  }

  /** Bersihkan daftar kode dari pengaturan (hanya pilihan yang dikenal, tanpa duplikat). */
  function sanitizeCodes(list) {
    const arr = Array.isArray(list) ? list : [];
    return [...new Set(arr.map(String).filter((c) => OPTIONS.has(c)))].slice(0, 40);
  }

  function flagEmoji(code) {
    if (!/^[A-Z]{2}$/.test(code || "")) return "";
    return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  }

  /** Lokasi cukup meyakinkan untuk menentukan prioritas unfollow (bukan sekadar perlindungan). */
  function trustedForFocus(geo) {
    return Boolean(geo) && geo.accurate !== false;
  }

  /**
   * Ambil data lokasi dari jawaban AboutAccountQuery.
   * Hasil: { based, accurate } | { none: true } (akun tidak ada / tidak punya data About).
   */
  function parseAbout(json) {
    const result = json?.data?.user_result_by_screen_name?.result;
    const about = result?.about_profile;
    if (!result || result.__typename !== "User" || !about) return { none: true };
    const based = String(about.account_based_in || "").slice(0, 80);
    if (!based) return { none: true };
    return { based, accurate: about.location_accurate !== false };
  }

  const SapuGeo = { REGIONS, REGION_OF, OPTION_REGIONS, OPTION_COUNTRIES, detectGeo, geoMatches, sanitizeCodes, flagEmoji, normalizeText, basedInToGeo, parseAbout, trustedForFocus };
  root.SapuGeo = SapuGeo;
  if (typeof module !== "undefined" && module.exports) module.exports = SapuGeo;
})(globalThis);
