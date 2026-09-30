// ============================================================
//  NEXUS API - single-file router. No login, no key, no DB.
//  New API add karanna: add(...) eka copy karala wenas karanna.
//  add(path, category, description, sampleParams, handler)
// ============================================================
const crypto = require('crypto');

const routes = {};
const add = (path, category, desc, params, fn) => {
  routes[path] = { category, desc, params, fn };
};

const J = async (url, opts = {}, tries = 2) => {
  const host = new URL(url).host;
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(9000), ...opts, headers: { 'user-agent': UA, accept: 'application/json', ...(opts.headers || {}) } });
      if (r.ok) {
        const t = await r.text();
        try { return JSON.parse(t); } catch { err = Object.assign(new Error(`Invalid response (${host})`), { code: 502 }); }
      } else {
        err = Object.assign(new Error(`Upstream error ${r.status} (${host})`), { code: 502 });
        if (r.status < 500 && r.status !== 429) break;
      }
    } catch (e) {
      err = Object.assign(new Error(`${e.name === 'TimeoutError' ? 'Timeout' : 'Network error'} (${host})`), { code: 502 });
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  throw err;
};
const T = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'user-agent': UA } });
  if (!r.ok) throw Object.assign(new Error('Upstream error ' + r.status), { code: 502 });
  return r.text();
};
// try providers one by one until one works
const any = async (...fns) => {
  let last;
  for (const f of fns) { try { return await f(); } catch (e) { last = e; } }
  throw last;
};
const nf = (m) => Object.assign(new Error(m), { code: 404 });
const need = (q, k) => {
  if (!q[k]) throw Object.assign(new Error('Missing parameter: ' + k), { code: 400 });
  return String(q[k]);
};
const num = (v, d, min, max) => Math.min(max, Math.max(min, parseInt(v) || d));
const enc = encodeURIComponent;

// ------------------------- UTILITY -------------------------
add('uuid', 'Utility', 'Random UUID v4', {}, () => ({ uuid: crypto.randomUUID() }));

add('password', 'Utility', 'Random password', { length: 16, symbols: 'true' }, (q) => {
  const len = num(q.length, 16, 4, 128);
  let set = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  if (q.symbols !== 'false') set += '!@#$%^&*()-_=+[]{}?';
  let out = '';
  for (let i = 0; i < len; i++) out += set[crypto.randomInt(set.length)];
  return { password: out, length: len };
});

add('hash', 'Utility', 'Hash text (md5, sha1, sha256, sha512)', { text: 'hello', algo: 'sha256' }, (q) => {
  const algo = (q.algo || 'sha256').toLowerCase();
  if (!['md5', 'sha1', 'sha256', 'sha512'].includes(algo))
    throw Object.assign(new Error('algo must be md5, sha1, sha256 or sha512'), { code: 400 });
  return { algo, hash: crypto.createHash(algo).update(need(q, 'text')).digest('hex') };
});

add('base64/encode', 'Utility', 'Base64 encode', { text: 'hello world' }, (q) => ({
  result: Buffer.from(need(q, 'text')).toString('base64'),
}));
add('base64/decode', 'Utility', 'Base64 decode', { text: 'aGVsbG8gd29ybGQ=' }, (q) => ({
  result: Buffer.from(need(q, 'text'), 'base64').toString('utf8'),
}));

add('random', 'Utility', 'Random number in a range', { min: 1, max: 100 }, (q) => {
  const min = parseInt(q.min) || 1, max = parseInt(q.max) || 100;
  if (min >= max) throw Object.assign(new Error('min must be less than max'), { code: 400 });
  return { min, max, number: crypto.randomInt(min, max + 1) };
});

add('dice', 'Utility', 'Roll dice', { sides: 6, count: 2 }, (q) => {
  const sides = num(q.sides, 6, 2, 1000), count = num(q.count, 1, 1, 50);
  const rolls = Array.from({ length: count }, () => crypto.randomInt(1, sides + 1));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) };
});

add('coinflip', 'Utility', 'Flip a coin', {}, () => ({ result: crypto.randomInt(2) ? 'heads' : 'tails' }));

add('color', 'Utility', 'Random colour (hex, rgb, hsl)', {}, () => {
  const [r, g, b] = [0, 0, 0].map(() => crypto.randomInt(256));
  const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return { hex, rgb: `rgb(${r}, ${g}, ${b})` };
});

add('lorem', 'Utility', 'Lorem ipsum paragraphs', { paragraphs: 2 }, (q) => {
  const base = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';
  return { text: Array(num(q.paragraphs, 2, 1, 20)).fill(base).join('\n\n') };
});

add('slug', 'Utility', 'Text to URL slug', { text: 'Hello World! Mage API' }, (q) => ({
  slug: need(q, 'text').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
}));

add('reverse', 'Utility', 'Reverse text', { text: 'nexus' }, (q) => ({
  result: [...need(q, 'text')].reverse().join(''),
}));

add('wordcount', 'Utility', 'Count words and characters', { text: 'the quick brown fox' }, (q) => {
  const t = need(q, 'text');
  return { characters: t.length, words: t.trim().split(/\s+/).length, lines: t.split('\n').length };
});

add('timestamp', 'Utility', 'Unix timestamp to date, or now', { ts: '' }, (q) => {
  const d = q.ts ? new Date(Number(q.ts) * (String(q.ts).length <= 10 ? 1000 : 1)) : new Date();
  if (isNaN(d)) throw Object.assign(new Error('Invalid ts'), { code: 400 });
  return { unix: Math.floor(d / 1000), iso: d.toISOString(), utc: d.toUTCString() };
});

add('time', 'Utility', 'Current time in a timezone', { tz: 'Asia/Colombo' }, (q) => {
  const tz = q.tz || 'UTC';
  try {
    return { tz, time: new Date().toLocaleString('en-GB', { timeZone: tz, hour12: false }) };
  } catch { throw Object.assign(new Error('Invalid timezone, e.g. Asia/Colombo'), { code: 400 }); }
});

add('jwt', 'Utility', 'Decode a JWT (no verification)', { token: '' }, (q) => {
  const p = need(q, 'token').split('.');
  if (p.length < 2) throw Object.assign(new Error('Invalid JWT'), { code: 400 });
  const d = (s) => JSON.parse(Buffer.from(s, 'base64url').toString());
  return { header: d(p[0]), payload: d(p[1]) };
});

add('ip', 'Utility', 'Your IP address', {}, (q, req) => ({
  ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(),
}));

add('useragent', 'Utility', 'Your user-agent and language', {}, (q, req) => ({
  userAgent: req.headers['user-agent'], language: req.headers['accept-language'],
}));

add('qr', 'Utility', 'QR code image', { text: 'https://vercel.com' }, (q) => ({
  __redirect: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${enc(need(q, 'text'))}`,
}));

add('screenshot', 'Utility', 'Website screenshot image', { url: 'https://github.com' }, (q) => ({
  __redirect: `https://image.thum.io/get/width/1200/${need(q, 'url')}`,
}));

add('shorten', 'Utility', 'Shorten a URL (TinyURL / is.gd)', { url: 'https://github.com' }, async (q) => {
  const u = safeUrl(need(q, 'url'));
  return any(
    async () => ({ short: (await T('https://tinyurl.com/api-create.php?url=' + enc(u))).trim() }),
    async () => ({ short: (await T('https://is.gd/create.php?format=simple&url=' + enc(u))).trim() }),
  );
});
// ------------------------- INFO -------------------------
add('weather', 'Info', 'Current weather for a city', { city: 'Colombo' }, async (q) => {
  const g = await J(`https://geocoding-api.open-meteo.com/v1/search?name=${enc(need(q, 'city'))}&count=1`);
  if (!g.results) throw Object.assign(new Error('City not found'), { code: 404 });
  const { latitude, longitude, name, country } = g.results[0];
  const w = await J(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`);
  return { city: name, country, ...w.current, units: w.current_units };
});

add('country', 'Info', 'Country details', { name: 'Sri Lanka' }, async (q) => {
  const d = await J(`https://restcountries.com/v3.1/name/${enc(need(q, 'name'))}?fields=name,capital,region,subregion,population,area,flags,currencies,languages,idd`);
  return d[0];
});

add('currency', 'Info', 'Currency converter', { from: 'USD', to: 'LKR', amount: 1 }, async (q) => {
  const from = (q.from || 'USD').toUpperCase(), to = (q.to || 'LKR').toUpperCase(), amount = Number(q.amount) || 1;
  const d = await J('https://open.er-api.com/v6/latest/' + from);
  if (!d.rates || !d.rates[to]) throw Object.assign(new Error('Invalid currency code'), { code: 400 });
  return { from, to, amount, rate: d.rates[to], result: +(amount * d.rates[to]).toFixed(4) };
});

add('crypto', 'Info', 'Crypto price (CoinGecko id)', { coin: 'bitcoin', vs: 'usd' }, async (q) => {
  const coin = (q.coin || 'bitcoin').toLowerCase(), vs = (q.vs || 'usd').toLowerCase();
  const d = await J(`https://api.coingecko.com/api/v3/simple/price?ids=${enc(coin)}&vs_currencies=${vs}&include_24hr_change=true&include_market_cap=true`);
  if (!d[coin]) throw Object.assign(new Error('Coin not found, use the CoinGecko id e.g. bitcoin'), { code: 404 });
  return { coin, vs, ...d[coin] };
});

add('dictionary', 'Info', 'English dictionary', { word: 'serendipity' }, async (q) => {
  const d = await J('https://api.dictionaryapi.dev/api/v2/entries/en/' + enc(need(q, 'word')));
  return { word: d[0].word, phonetic: d[0].phonetic, meanings: d[0].meanings };
});

add('wiki', 'Info', 'Wikipedia summary', { q: 'Sri Lanka', lang: 'en' }, async (q) => {
  const d = await J(`https://${q.lang || 'en'}.wikipedia.org/api/rest_v1/page/summary/${enc(need(q, 'q'))}`);
  return { title: d.title, description: d.description, extract: d.extract, image: d.thumbnail?.source, url: d.content_urls?.desktop?.page };
});

add('translate', 'Info', 'Translate text (en, si, ta, hi ...)', { text: 'Good morning', from: 'en', to: 'si' }, async (q) => {
  const d = await J(`https://api.mymemory.translated.net/get?q=${enc(need(q, 'text'))}&langpair=${q.from || 'en'}|${q.to || 'si'}`);
  return { translated: d.responseData.translatedText };
});

add('ipinfo', 'Info', 'IP geolocation', { ip: '8.8.8.8' }, async (q, req) => {
  const ip = q.ip || (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const d = await J('https://ipwho.is/' + enc(ip));
  if (d.success === false) throw Object.assign(new Error(d.message || 'Invalid IP'), { code: 400 });
  return { ip: d.ip, country: d.country, region: d.region, city: d.city, latitude: d.latitude, longitude: d.longitude, timezone: d.timezone?.id, isp: d.connection?.isp };
});

// ------------------------- DEV -------------------------
add('github', 'Dev', 'GitHub user profile', { user: 'torvalds' }, async (q) => {
  const d = await J('https://api.github.com/users/' + enc(need(q, 'user')), { headers: process.env.GITHUB_TOKEN ? { authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {} });
  return { login: d.login, name: d.name, bio: d.bio, avatar: d.avatar_url, followers: d.followers, following: d.following, repos: d.public_repos, created: d.created_at, url: d.html_url };
});

add('npm', 'Dev', 'npm package info', { package: 'express' }, async (q) => {
  const d = await J('https://registry.npmjs.org/' + enc(need(q, 'package')).replace('%40', '@').replace('%2F', '%2f') + '/latest');
  return { name: d.name, version: d.version, description: d.description, license: d.license, homepage: d.homepage, dependencies: d.dependencies };
});

// ------------------------- FUN -------------------------
add('joke', 'Fun', 'Random joke', {}, () => any(
  async () => { const d = await J('https://official-joke-api.appspot.com/random_joke'); return { setup: d.setup, punchline: d.punchline }; },
  async () => { const d = await J('https://v2.jokeapi.dev/joke/Any?safe-mode&type=twopart'); return { setup: d.setup, punchline: d.delivery }; },
));
add('quote', 'Fun', 'Random quote', {}, () => any(
  async () => { const d = await J('https://dummyjson.com/quotes/random'); return { quote: d.quote, author: d.author }; },
  async () => { const d = await J('https://zenquotes.io/api/random'); return { quote: d[0].q, author: d[0].a }; },
));
add('fact', 'Fun', 'Random fact', {}, async () => {
  const d = await J('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
  return { fact: d.text };
});
add('advice', 'Fun', 'Random advice', {}, async () => {
  const d = await J('https://api.adviceslip.com/advice');
  return { advice: JSON.parse(typeof d === 'string' ? d : JSON.stringify(d)).slip.advice };
});
add('catfact', 'Fun', 'Random cat fact', {}, async () => J('https://catfact.ninja/fact'));
add('dog', 'Fun', 'Random dog image', {}, async () => {
  const d = await J('https://dog.ceo/api/breeds/image/random');
  return { image: d.message };
});
add('meme', 'Fun', 'Random meme', {}, () => any(
  async () => { const d = await J('https://meme-api.com/gimme'); if (!d.url) throw nf('none'); return { title: d.title, image: d.url, subreddit: d.subreddit }; },
  async () => { const m = (await J('https://api.imgflip.com/get_memes')).data.memes; const x = m[crypto.randomInt(m.length)]; return { title: x.name, image: x.url, subreddit: 'imgflip' }; },
));
add('trivia', 'Fun', 'Random trivia question', {}, () => any(
  async () => { const d = await J('https://opentdb.com/api.php?amount=1'); if (!d.results?.length) throw nf('none'); return d.results[0]; },
  async () => { const x = (await J('https://the-trivia-api.com/v2/questions?limit=1'))[0]; return { category: x.category, difficulty: x.difficulty, question: x.question.text, correct_answer: x.correctAnswer, incorrect_answers: x.incorrectAnswers }; },
));
add('pokemon', 'Fun', 'Pokemon info', { name: 'pikachu' }, async (q) => {
  const d = await J('https://pokeapi.co/api/v2/pokemon/' + enc(need(q, 'name').toLowerCase()));
  return { id: d.id, name: d.name, height: d.height, weight: d.weight, types: d.types.map((t) => t.type.name), abilities: d.abilities.map((a) => a.ability.name), image: d.sprites.other['official-artwork'].front_default };
});

// ------------------------- HELPERS FOR SCRAPING -------------------------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const H = async (url, headers = {}) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'user-agent': UA, ...headers } });
  if (!r.ok) throw Object.assign(new Error('Upstream error ' + r.status), { code: 502 });
  return r.text();
};
const strip = (s = '') => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const findAll = (o, key, out = []) => {
  if (o && typeof o === 'object') {
    if (o[key]) out.push(o[key]);
    for (const v of Object.values(o)) findAll(v, key, out);
  }
  return out;
};
const ytId = (s) => {
  const m = String(s).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
  if (m) return m[1];
  if (/^[\w-]{11}$/.test(s)) return s;
  throw Object.assign(new Error('Invalid YouTube link'), { code: 400 });
};
const safeUrl = (u) => {
  let x;
  try { x = new URL(u); } catch { throw Object.assign(new Error('Invalid URL'), { code: 400 }); }
  if (!/^https?:$/.test(x.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(x.hostname))
    throw Object.assign(new Error('URL not allowed'), { code: 400 });
  return x.href;
};

// Downloader engine: any cobalt-compatible server (self-host it, free).
// Vercel -> Settings -> Environment Variables:  COBALT_URL = https://your-cobalt.up.railway.app/   (COBALT_KEY optional)
const cobalt = async (url, body) => {
  const base = process.env.COBALT_URL;
  if (!base) throw Object.assign(new Error('Downloader engine not set. Add COBALT_URL in Vercel environment variables (see README).'), { code: 501 });
  const r = await fetch(base, {
    method: 'POST',
    signal: AbortSignal.timeout(25000),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(process.env.COBALT_KEY ? { Authorization: 'Api-Key ' + process.env.COBALT_KEY } : {}) },
    body: JSON.stringify({ url, ...body }),
  });
  const d = await r.json().catch(() => ({}));
  if (d.status === 'error' || !d.url) throw Object.assign(new Error('Download failed: ' + (d.error?.code || r.status)), { code: 502 });
  return d;
};
const oembed = (id) => J(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`).catch(() => ({}));

// ------------------------- YOUTUBE -------------------------
add('ytinfo', 'YouTube', 'Video title, channel and thumbnails', { url: 'https://youtu.be/dQw4w9WgXcQ' }, async (q) => {
  const id = ytId(need(q, 'url')), o = await oembed(id);
  return { id, title: o.title, channel: o.author_name, channel_url: o.author_url, link: 'https://youtu.be/' + id,
    thumbnail: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`, thumbnail_hq: `https://img.youtube.com/vi/${id}/hqdefault.jpg` };
});

add('ytthumb', 'YouTube', 'Thumbnail image (redirect)', { url: 'https://youtu.be/dQw4w9WgXcQ' }, (q) => ({
  __redirect: `https://img.youtube.com/vi/${ytId(need(q, 'url'))}/maxresdefault.jpg`,
}));

add('ytsearch', 'YouTube', 'Search YouTube videos (scraped)', { q: 'lofi music', limit: 8 }, async (q) => {
  const html = await H('https://www.youtube.com/results?hl=en&search_query=' + enc(need(q, 'q')), { cookie: 'CONSENT=YES+1; SOCS=CAI', 'accept-language': 'en-US,en;q=0.9' });
  const m = html.match(/var ytInitialData = (\{.+?\});<\/script>/s);
  if (!m) throw Object.assign(new Error('YouTube blocked the request, try again'), { code: 502 });
  const vids = findAll(JSON.parse(m[1]), 'videoRenderer').slice(0, num(q.limit, 8, 1, 20));
  return vids.map((v) => ({
    id: v.videoId, title: v.title?.runs?.[0]?.text, channel: v.ownerText?.runs?.[0]?.text,
    duration: v.lengthText?.simpleText, views: v.viewCountText?.simpleText, published: v.publishedTimeText?.simpleText,
    thumbnail: v.thumbnail?.thumbnails?.slice(-1)[0]?.url, url: 'https://youtu.be/' + v.videoId,
  }));
});

add('ytmp3', 'Downloader', 'YouTube to MP3 download link', { url: 'https://youtu.be/dQw4w9WgXcQ' }, async (q) => {
  const id = ytId(need(q, 'url')), [d, o] = await Promise.all([cobalt('https://youtu.be/' + id, { downloadMode: 'audio', audioFormat: 'mp3' }), oembed(id)]);
  return { title: o.title, channel: o.author_name, thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, filename: d.filename, download: d.url };
});

add('ytmp4', 'Downloader', 'YouTube to MP4 download link', { url: 'https://youtu.be/dQw4w9WgXcQ', quality: '720' }, async (q) => {
  const id = ytId(need(q, 'url')), qual = ['360', '480', '720', '1080'].includes(q.quality) ? q.quality : '720';
  const [d, o] = await Promise.all([cobalt('https://youtu.be/' + id, { downloadMode: 'auto', videoQuality: qual }), oembed(id)]);
  return { title: o.title, channel: o.author_name, quality: qual, thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, filename: d.filename, download: d.url };
});

add('download', 'Downloader', 'Any supported link (Instagram, X, Facebook, Reddit ...)', { url: 'https://x.com/user/status/1' }, async (q) => {
  const d = await cobalt(safeUrl(need(q, 'url')), { downloadMode: 'auto' });
  return { filename: d.filename, download: d.url };
});

add('tiktok', 'Downloader', 'TikTok video without watermark', { url: 'https://www.tiktok.com/@user/video/123' }, async (q) => {
  const d = await J('https://www.tikwm.com/api/?url=' + enc(need(q, 'url')));
  if (d.code !== 0) throw Object.assign(new Error(d.msg || 'TikTok fetch failed'), { code: 502 });
  const f = (u) => (u && u.startsWith('/') ? 'https://www.tikwm.com' + u : u), x = d.data;
  return { title: x.title, author: x.author?.nickname, duration: x.duration, cover: f(x.cover), video: f(x.play), video_watermark: f(x.wmplay), music: f(x.music) };
});

// ------------------------- SCRAPERS -------------------------
add('search', 'Scrape', 'Web search results (scraped from DuckDuckGo)', { q: 'vercel serverless functions', limit: 8 }, async (q) => {
  const html = await H('https://html.duckduckgo.com/html/?q=' + enc(need(q, 'q')));
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const out = []; let m;
  while ((m = re.exec(html)) && out.length < num(q.limit, 8, 1, 20)) {
    let link = m[1];
    try { link = new URL(link.startsWith('//') ? 'https:' + link : link).searchParams.get('uddg') || link; } catch {}
    out.push({ title: strip(m[2]), url: link, snippet: strip(m[3]) });
  }
  if (!out.length) throw Object.assign(new Error('No results (or search engine blocked the request)'), { code: 404 });
  return out;
});

add('webinfo', 'Scrape', 'Scrape title, description, image and links of any page', { url: 'https://github.com' }, async (q) => {
  const url = safeUrl(need(q, 'url')), html = await H(url);
  const meta = (n) => (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]+content=["']([^"']*)`, 'i')) || [])[1];
  return {
    url, title: strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]),
    description: meta('og:description') || meta('description'), image: meta('og:image'),
    links: (html.match(/<a\s[^>]*href=/gi) || []).length, images: (html.match(/<img\s/gi) || []).length,
  };
});

add('quotes', 'Scrape', 'Quotes scraped from quotes.toscrape.com', { tag: '', page: 1 }, async (q) => {
  const path = q.tag ? `/tag/${enc(q.tag)}/page/${num(q.page, 1, 1, 10)}/` : `/page/${num(q.page, 1, 1, 10)}/`;
  const html = await H('https://quotes.toscrape.com' + path);
  const re = /<span class="text"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<small class="author"[^>]*>([\s\S]*?)<\/small>/g;
  const out = []; let m;
  while ((m = re.exec(html))) out.push({ quote: strip(m[1]), author: strip(m[2]) });
  if (!out.length) throw Object.assign(new Error('No quotes found'), { code: 404 });
  return out;
});

add('hackernews', 'Scrape', 'Top Hacker News stories', { limit: 10 }, async (q) => {
  const ids = (await J('https://hacker-news.firebaseio.com/v0/topstories.json')).slice(0, num(q.limit, 10, 1, 30));
  const items = await Promise.all(ids.map((i) => J(`https://hacker-news.firebaseio.com/v0/item/${i}.json`)));
  return items.map((i) => ({ title: i.title, url: i.url || `https://news.ycombinator.com/item?id=${i.id}`, score: i.score, by: i.by, comments: i.descendants }));
});

// ------------------------- MEDIA -------------------------
add('lyrics', 'Media', 'Song lyrics (LRCLIB)', { q: 'Shape of You Ed Sheeran' }, async (q) => {
  const d = await J('https://lrclib.net/api/search?q=' + enc(need(q, 'q')));
  if (!d.length) throw Object.assign(new Error('Lyrics not found'), { code: 404 });
  const s = d[0];
  return { title: s.trackName, artist: s.artistName, album: s.albumName, duration: s.duration, lyrics: s.plainLyrics, synced: s.syncedLyrics };
});

add('anime', 'Media', 'Anime search (Jikan, AniList, Kitsu fallback)', { q: 'naruto' }, async (q) => {
  const s = need(q, 'q');
  return any(
    async () => {
      const d = (await J('https://api.jikan.moe/v4/anime?limit=5&q=' + enc(s))).data;
      if (!d?.length) throw nf('Anime not found');
      return d.map((a) => ({ title: a.title, type: a.type, episodes: a.episodes, score: a.score, status: a.status, year: a.year, synopsis: a.synopsis, image: a.images?.jpg?.image_url, url: a.url }));
    },
    async () => {
      const d = await J('https://graphql.anilist.co', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        query: 'query($s:String){Page(perPage:5){media(search:$s,type:ANIME){title{romaji english} format episodes averageScore status seasonYear description(asHtml:false) coverImage{large} siteUrl}}}', variables: { s } }) });
      const m = d.data?.Page?.media;
      if (!m?.length) throw nf('Anime not found');
      return m.map((a) => ({ title: a.title.english || a.title.romaji, type: a.format, episodes: a.episodes, score: a.averageScore ? a.averageScore / 10 : null, status: a.status, year: a.seasonYear, synopsis: a.description, image: a.coverImage?.large, url: a.siteUrl }));
    },
    async () => {
      const d = (await J('https://kitsu.io/api/edge/anime?page[limit]=5&filter[text]=' + enc(s), { headers: { accept: 'application/vnd.api+json' } })).data;
      if (!d?.length) throw nf('Anime not found');
      return d.map((x) => ({ title: x.attributes.canonicalTitle, type: x.attributes.subtype, episodes: x.attributes.episodeCount, score: x.attributes.averageRating, status: x.attributes.status, year: (x.attributes.startDate || '').slice(0, 4), synopsis: x.attributes.synopsis, image: x.attributes.posterImage?.small, url: 'https://kitsu.io/anime/' + x.attributes.slug }));
    }
  );
});
// ------------------------- ROUTER -------------------------
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, 'http://x');
  const name = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  const q = Object.fromEntries(url.searchParams);

  // List all endpoints
  if (!name || name === 'index.js') {
    res.setHeader('Cache-Control', 's-maxage=3600');
    return res.status(200).json({
      status: true,
      total: Object.keys(routes).length,
      endpoints: Object.entries(routes).map(([path, r]) => ({
        path: '/api/' + path, category: r.category, description: r.desc, params: r.params,
      })),
    });
  }

  const route = routes[name];
  if (!route) return res.status(404).json({ status: false, error: 'Endpoint not found. See /api for the list.' });

  try {
    const out = await route.fn(q, req);
    if (out && out.__redirect) return res.redirect(302, out.__redirect);
    return res.status(200).json({ status: true, result: out });
  } catch (e) {
    return res.status(e.code || 500).json({ status: false, error: e.message || 'Server error' });
  }
};
