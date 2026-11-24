// ---- Lingo Feeder shared helpers (copied into each Code node that says "@include lib.js") ----
const cut = (s, n) => { s = String(s == null ? '' : s); return Array.from(s).length > n ? Array.from(s).slice(0, n).join('') + '…' : s; };
const clip = (s, n) => Array.from(String(s == null ? '' : s)).slice(0, n).join('');
const has = v => v !== undefined && v !== null && String(v).trim() !== '';
const money = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Lower case, no emojis / punctuation, single spaces: what the quick rules match against. */
const normalize = s => String(s || '').normalize('NFC').toLowerCase()
  .replace(/\p{Extended_Pictographic}/gu, ' ').replace(/[\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{20E3}‍]/gu, '')
  .replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();

/** A Sri Lankan mobile number → 0XXXXXXXXX (else ''). */
const localPhone = v => {
  const d = String(v || '').replace(/\D/g, '');
  if (/^94\d{9}$/.test(d)) return '0' + d.slice(2);
  if (/^0\d{9}$/.test(d)) return d;
  if (/^[1-9]\d{8}$/.test(d)) return '0' + d;
  return '';
};

/** A WhatsApp profile name that looks like a first name ("Nimal", "නිමල්"), else ''. */
const NOT_NAMES = new Set(['shop', 'store', 'stores', 'official', 'online', 'mobile', 'phone', 'user', 'whatsapp', 'business', 'enterprises', 'lk', 'the', 'mr', 'mrs', 'miss', 'dr', 'hi', 'hello']);
const firstName = n => {
  const w = String(n || '').replace(/[^A-Za-z඀-෿ ]+/g, ' ').trim().split(/\s+/)[0] || '';
  if (/^[A-Za-z]{2,20}$/.test(w) && !NOT_NAMES.has(w.toLowerCase())) return w[0].toUpperCase() + w.slice(1).toLowerCase();
  if (/^[඀-෿]{2,20}$/.test(w)) return w;
  return '';
};

/** Which style the customer writes in: si (Sinhala script) · sg (Singlish) · en, else keep prev. */
const SINGLISH = /\b(kiyada|kiyd|kiyda|keyada|puluwan\w*|pluwan\w*|ona|oni|one|onee|mata|matath|eka|ekak|akak|dekak|dr|ganna|gnna|danna|denna|karanna|thiyenawa\w*|thiyanawa\w*|nadda|neda|nedda|nathi|na|naa|ow|owu|hari|mokak\w*|kohom\w*|koheda|kawad\w*|wenawa\w*|gena|ewanna|awanna|evanna|bonna|beheth|gedara\w*|salli|ganan|gana|mila|dawas|kiyak|yanawa\w*|enawa\w*|ammala|lamai\w*|ayata|walata|nam|thama|tama|aiyo|ayyo|aney|ane|ela|harida|denne|ganne|wage|witharada|witharai|puluwanda|onada)\b/;
const ENGLISH = /\b(how|what|when|where|which|is|are|can|could|do|does|please|want|need|send|my|the|your|price|much|deliver|order|thank|thanks|hello|available)\b/;
const guessLang = (text, prev) => {
  const s = String(text || '');
  const si = (s.match(/[඀-෿]/g) || []).length;
  const lat = (s.match(/[A-Za-z]/g) || []).length;
  if (si >= 2 && si >= lat * 0.5) return 'si';
  if (lat < 3) return prev;
  const w = s.toLowerCase();
  if (SINGLISH.test(w)) return 'sg';
  if (ENGLISH.test(w) && w.split(/\s+/).length >= 2) return 'en';
  return prev;
};

/** Good morning / afternoon / evening / night key, Sri Lanka time. */
const greetKey = (d = new Date()) => {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Colombo', hour: 'numeric', hour12: false }).format(d)) % 24;
  return h >= 4 && h < 12 ? 'greet_morning' : h >= 12 && h < 16 ? 'greet_afternoon' : h >= 16 && h < 20 ? 'greet_evening' : 'greet_night';
};

/** One text in the customer's style (Singlish → Sinhala text if no Singlish one), placeholders filled. */
const makeText = (texts, lang) => (key, vals = {}) => {
  const t = texts[key] || {};
  const raw = String(t[lang] || (lang === 'sg' ? t.si : '') || t.si || t.en || '');
  return raw.replace(/\{(\w+)\}/g, (x, k) => (k in vals ? String(vals[k] == null ? '' : vals[k]) : x))
    .replace(/[ \t]{2,}/g, ' ').replace(/ +([!?.,😊🙏👇])/g, ' $1').replace(/^ +| +$/gm, '').replace(/ ([!?.,])/g, '$1')
    .replace(/\n{3,}/g, '\n\n').trim();
};

/** The Click-to-WhatsApp pre-filled text ("Hello! Can I get more info on this?") and other openers. */
const PREFILL = /(can i get more info|more info(rmation)? (on|about) this|i('m| am) interested in this|tell me more about this|send me more info|වැඩි විස්තර ලබා ගත හැකිද|මට මේ ගැන (වැඩි )?විස්තර|මේ ගැන තව විස්තර)/i;
const OPENER = /^(hi+|hello+|hey+|helo+|hai+|ayubowan|ආයුබෝවන්|හායි|හලෝ|good (morning|evening|night|afternoon)|gm|ge|details|details please|more details|more info|info|wisthara|wistara|wisthara denna|විස්තර|විස්තර දෙන්න|විස්තර ඕන|price list)( dr| sir| miss| please| plz)?$|^.{0,60}(ගෙන්න ගන්න|ගෙන්නගන්න|ගෙන්වා ගන්න|genna ganna|gennaganna|genna ganne) ?(පුලුවන්ද|පුළුවන්ද|පුලුවන් ද|පුළුවන් ද|puluwanda|puluwan da|pluwanda)$/;
