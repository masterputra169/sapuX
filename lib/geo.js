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
    ID: ["indonesia", "indo", "jakarta", "jkt", "bandung", "surabaya", "yogyakarta", "jogja", "jogjakarta", "yogya", "semarang", "medan", "makassar", "bali", "denpasar", "malang", "kediri", "bekasi", "depok", "tangerang", "bogor", "surakarta", "palembang", "pekanbaru", "batam", "balikpapan", "samarinda", "pontianak", "banjarmasin", "manado", "padang", "lampung", "aceh", "jawa", "sumatra", "sumatera", "kalimantan", "sulawesi", "papua", "lombok", "nusantara", "cirebon", "sidoarjo", "gresik", "jember", "purwokerto", "tasikmalaya", "cimahi", "kupang", "jambi", "bengkulu", "ambon", "mataram"],
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

  // Di nama tampilan hanya nama negara yang dipercaya; nama kota sering juga nama orang (Paris, Goa, Surat).
  const COUNTRY_WORDS = new Set([...Object.values(KEYWORDS).map((w) => w[0]), "indo", "bharat", "pinoy", "naija", "usa", "uk", "singapura", "brasil", "turkiye"]);
  const COUNTRY_KEYWORD_LIST = KEYWORD_LIST.filter(([w]) => COUNTRY_WORDS.has(w));

  function keywordCountry(text, list = KEYWORD_LIST) {
    const norm = normalizeText(text);
    if (norm.trim() === "") return null;
    let best = null;
    for (const [word, code] of list) {
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

  // ---------- tebakan berbobot (Tahap 1) ----------
  // Setiap petunjuk memberi skor ke sebuah negara atau wilayah. Skor digabung, lalu diberi
  // tingkat keyakinan. Bobot dipilih dari seberapa sering petunjuk itu menipu:
  // bendera di kolom lokasi hampir selalu jujur, label bahasa dari X paling sering meleset.
  const W = {
    flagLocation: 6, flagName: 5.5, flagBio: 4.5,
    kwLocation: 4.5, kwName: 2.5, kwBio: 2, demonym: 3,
    script: 4, scriptRegion: 3,
    words: 3, wordsMany: 4,
    lang: 2,
  };
  const CONF = { high: 5.5, medium: 3.5 }; // ambang skor total untuk tingkat keyakinan

  /** Kata sebutan penduduk / identitas di bio ("Indonesian builder", "proud Indian"). */
  const DEMONYMS = {
    indonesian: "ID", indonesians: "ID", wni: "ID", indian: "IN", indians: "IN", pakistani: "PK", bangladeshi: "BD",
    nigerian: "NG", filipino: "PH", filipina: "PH", pinoy: "PH", pinay: "PH", malaysian: "MY", vietnamese: "VN",
    singaporean: "SG", thai: "TH", ghanaian: "GH", kenyan: "KE", turkish: "TR", korean: "KR", japanese: "JP",
  };
  const REGION_WORDS = { desi: "south-asia" };

  /** Huruf khas suatu wilayah. Arab sengaja tidak dipakai (dipakai dari Maroko sampai Pakistan). */
  const SCRIPTS = [
    { re: /[ऀ-ॿ]/, country: "IN", name: "Devanagari" },
    { re: /[฀-๿]/, country: "TH", name: "Thai" },
    { re: /[가-힯ᄀ-ᇿ]/, country: "KR", name: "Hangul" },
    { re: /[぀-ヿ]/, country: "JP", name: "Kana" },
    { re: /[ঀ-৿]/, region: "south-asia", name: "Bengali" },
    { re: /[஀-௿]/, region: "south-asia", name: "Tamil" },
    { re: /[ఀ-౿ಀ-೿ഀ-ൿ઀-૿]/, country: "IN", name: "Indic" },
    { re: /[က-႟]/, country: "MM", name: "Myanmar" },
    { re: /[ăâđêôơư][̀-̣]|[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i, country: "VN", name: "Vietnamese" },
  ];

  /**
   * Kata sehari-hari yang khas. "strong" = hampir hanya dipakai di negara itu;
   * "shared" = juga dipakai di negara tetangga (mis. bahasa Melayu), jadi hanya menunjuk wilayah.
   */
  const WORDLISTS = [
    { country: "ID", name: "Indonesian", strong: ["gak", "nggak", "ngga", "enggak", "banget", "aja", "udah", "gue", "gw", "lu", "lo", "kalo", "makasih", "mantap", "mantul", "cuan", "garapan", "garap", "wkwk", "wkwkwk", "anjir", "kak", "bang", "sih", "dong", "deh", "kok", "nih", "gimana", "gitu", "bisa", "lagi", "sama", "buat", "bikin", "kerja", "kuliah", "teman", "temen", "semangat", "sukses", "rejeki", "rezeki", "halo", "selamat"], shared: ["yang", "dan", "untuk", "dengan", "saya", "aku", "kamu", "tidak", "juga", "akan", "ini", "itu", "dari", "di", "ke"] },
    { region: "south-asia", name: "Hindi/Urdu (Latin)", strong: ["bhai", "yaar", "kya", "nahi", "nahin", "bhi", "toh", "accha", "acha", "bhaiya", "kaise", "matlab", "bahut", "achha", "haan", "sab", "mera", "tera", "mujhe", "kyun", "zindagi", "bhagwan", "jai", "shri"] },
    { country: "PH", name: "Filipino", strong: ["po", "naman", "talaga", "salamat", "mga", "lang", "kasi", "ako", "ikaw", "sana", "grabe", "ganda", "pinoy", "kayo", "natin"] },
    { country: "NG", name: "Nigerian Pidgin", strong: ["wahala", "abeg", "dey", "oga", "omo", "wetin", "na", "una", "chop", "sabi"] },
  ];

  function wordHits(tokens, list) {
    let n = 0;
    for (const w of list) if (tokens.has(w)) n += 1;
    return n;
  }

  /** Semua bendera dalam teks, sesuai urutan kemunculan. */
  function flagsIn(text) {
    const out = [];
    const re = /([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/gu;
    let m;
    while ((m = re.exec(String(text || "")))) {
      const code = String.fromCharCode(m[1].codePointAt(0) - 0x1f1e6 + 65, m[2].codePointAt(0) - 0x1f1e6 + 65);
      if (/^[A-Z]{2}$/.test(code)) out.push(code);
    }
    return out;
  }

  function demonymCountry(text) {
    const norm = normalizeText(text);
    for (const [word, code] of Object.entries(DEMONYMS)) if (norm.includes(" " + word + " ")) return { code, word };
    for (const [word, region] of Object.entries(REGION_WORDS)) if (norm.includes(" " + word + " ")) return { region, word };
    return null;
  }

  /**
   * Tebakan lokasi dari petunjuk di profil (tanpa data resmi X).
   * Hasil: null, atau { country, region, source, hint, confidence: "high"|"medium"|"low", score, signals: [{ kind, text }] }
   */
  function guessGeo(user) {
    const location = String(user?.location || "");
    const name = String(user?.name || "");
    const bio = String(user?.bio || "");
    const tweet = String(user?.tweetText || "");
    const lang = String(user?.lang || "").toLowerCase();

    const countries = new Map(); // kode -> skor
    const regions = new Map(); // wilayah -> skor (termasuk sumbangan dari negara di wilayah itu)
    const signals = [];
    const add = (target, weight, kind, text) => {
      if (target.country) countries.set(target.country, (countries.get(target.country) || 0) + weight);
      const region = target.region || REGION_OF[target.country];
      if (region) regions.set(region, (regions.get(region) || 0) + weight);
      signals.push({ kind, text, country: target.country || null, region: region || null, weight });
    };

    // 1. bendera
    const fLoc = flagsIn(location)[0];
    if (fLoc) add({ country: fLoc }, W.flagLocation, "flagLocation", Geo_flag(fLoc));
    const fName = flagsIn(name)[0];
    if (fName) add({ country: fName }, W.flagName, "flagName", Geo_flag(fName));
    const fBio = flagsIn(bio)[0];
    if (fBio) add({ country: fBio }, W.flagBio, "flagBio", Geo_flag(fBio));

    // 2. nama kota / negara / sebutan penduduk
    const kLoc = keywordCountry(location);
    if (kLoc) add({ country: kLoc.code }, W.kwLocation, "kwLocation", kLoc.word);
    const kName = keywordCountry(name, COUNTRY_KEYWORD_LIST);
    if (kName) add({ country: kName.code }, W.kwName, "kwName", kName.word);
    const dem = demonymCountry(bio) || demonymCountry(name);
    if (dem) add({ country: dem.code, region: dem.region }, W.demonym, "demonym", dem.word);
    const kBio = keywordCountry(bio);
    if (kBio && kBio.word !== dem?.word) add({ country: kBio.code }, W.kwBio, "kwBio", kBio.word);

    // 3. huruf khas (nama, bio, tweet terakhir)
    const allText = name + " " + bio + " " + tweet;
    for (const sc of SCRIPTS) {
      if (sc.re.test(allText.normalize("NFC")) || (sc.name === "Vietnamese" && sc.re.test(allText.normalize("NFD")))) {
        add({ country: sc.country, region: sc.region }, sc.country ? W.script : W.scriptRegion, "script", sc.name);
        break;
      }
    }

    // 4. kata sehari-hari (bio + tweet terakhir)
    const tokens = new Set(normalizeText(bio + " " + tweet).trim().split(" ").filter(Boolean));
    if (tokens.size) {
      for (const wl of WORDLISTS) {
        const strong = wordHits(tokens, wl.strong);
        const shared = wl.shared ? wordHits(tokens, wl.shared) : 0;
        if (strong >= 2 || (strong >= 1 && shared >= 2)) {
          add({ country: wl.country, region: wl.region }, strong + shared >= 4 ? W.wordsMany : W.words, "words", wl.name);
        } else if (shared >= 3 && wl.shared) {
          add({ region: REGION_OF[wl.country] }, W.words - 1, "words", wl.name); // mis. Melayu/Indonesia: hanya wilayah
        }
      }
    }

    // 5. label bahasa posting terakhir dari X
    if (LANGS[lang]) add({ country: LANGS[lang].country, region: LANGS[lang].region }, W.lang, "lang", lang);

    if (!signals.length) return null;

    const ranked = [...countries.entries()].sort((a, b) => b[1] - a[1]);
    const [bestCountry, bestScore = 0] = ranked[0] || [];
    const second = ranked[1]?.[1] || 0;
    const regionRanked = [...regions.entries()].sort((a, b) => b[1] - a[1]);
    const [bestRegion, regionScore = 0] = regionRanked[0] || [];

    let country = null;
    let region = null;
    let score = 0;
    if (bestCountry && bestScore >= 2 && bestScore - second >= 1.5) {
      country = bestCountry;
      region = REGION_OF[bestCountry] || null;
      score = bestScore - second / 2;
    } else if (bestRegion && regionScore >= 2) {
      region = bestRegion;
      score = regionScore - (regionRanked[1]?.[1] || 0) / 2;
    } else {
      return null;
    }

    let confidence = score >= CONF.high ? "high" : score >= CONF.medium ? "medium" : "low";
    // Ada petunjuk yang menunjuk tempat lain: turunkan satu tingkat.
    const conflicting = signals.some((g) => (country ? g.country && g.country !== country : g.region && g.region !== region));
    if (conflicting) confidence = confidence === "high" ? "medium" : "low";

    const used = signals.filter((g) => (country ? g.country === country || (!g.country && g.region === region) : g.region === region));
    const strongest = used.sort((a, b) => b.weight - a.weight)[0] || signals[0];
    const source = strongest.kind.startsWith("flag") ? "flag" : strongest.kind === "lang" ? "lang" : "bio";
    return { country, region, source, hint: strongest.kind === "lang" ? lang : strongest.text, confidence, score: Math.round(score * 10) / 10, signals: used.map(({ kind, text }) => ({ kind, text })) };
  }

  function Geo_flag(code) {
    return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  }

  const cache = new Map();

  /**
   * Lokasi akun: data resmi X kalau ada, kalau tidak tebakan dari profil.
   * Hasil: null, atau { country, region, source: "x"|"flag"|"bio"|"lang", hint, accurate?, confidence?, signals? }
   */
  function detectGeo(user) {
    const basedIn = String(user?.basedIn || "");
    const accurate = user?.basedAccurate !== false;
    const key = [basedIn, accurate, user?.location, user?.name, user?.bio, user?.tweetText, user?.lang].join("\u0000");
    if (cache.has(key)) return cache.get(key);

    let result = null;
    if (basedIn) {
      const g = basedInToGeo(basedIn);
      if (g) result = { country: g.country, region: g.region, source: "x", hint: basedIn, accurate, confidence: accurate ? "high" : "low" };
    }
    if (!result) result = guessGeo(user);

    if (cache.size > 20000) cache.clear();
    cache.set(key, result);
    return result;
  }

  /**
   * Ukur seberapa sering tebakan profil cocok dengan data resmi X, untuk akun yang sudah dicek.
   * Cocok = negara sama; kalau salah satu hanya tahu wilayah, wilayahnya sama.
   * Hasil: { n, match, byConfidence: { high: {n, match}, medium: {...}, low: {...} } }
   */
  function measureAccuracy(users) {
    const out = { n: 0, match: 0, byConfidence: { high: { n: 0, match: 0 }, medium: { n: 0, match: 0 }, low: { n: 0, match: 0 } } };
    for (const u of users) {
      if (!u?.basedIn || u.basedAccurate === false) continue; // pembanding harus data X yang dianggap akurat
      const truth = basedInToGeo(u.basedIn);
      if (!truth || (!truth.country && !truth.region)) continue;
      const guess = guessGeo(u);
      if (!guess) continue;
      const ok = truth.country && guess.country ? truth.country === guess.country : (truth.region || REGION_OF[truth.country]) === guess.region;
      out.n += 1;
      if (ok) out.match += 1;
      const bucket = out.byConfidence[guess.confidence];
      bucket.n += 1;
      if (ok) bucket.match += 1;
    }
    return out;
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
    if (!geo) return false;
    if (geo.source === "x") return geo.accurate !== false;
    return geo.confidence === "high"; // tebakan profil hanya boleh menentukan prioritas kalau yakin
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

  const SapuGeo = { REGIONS, REGION_OF, OPTION_REGIONS, OPTION_COUNTRIES, detectGeo, guessGeo, measureAccuracy, geoMatches, sanitizeCodes, flagEmoji, normalizeText, basedInToGeo, parseAbout, trustedForFocus };
  root.SapuGeo = SapuGeo;
  if (typeof module !== "undefined" && module.exports) module.exports = SapuGeo;
})(globalThis);
