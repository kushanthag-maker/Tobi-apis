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

const J = async (url, opts = {}) => {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'user-agent': 'Mozilla/5.0 NexusAPI' },
    ...opts,
  });
  if (!r.ok) throw Object.assign(new Error('Upstream error ' + r.status), { code: 502 });
  return r.json();
};
const T = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw Object.assign(new Error('Upstream error ' + r.status), { code: 502 });
  return r.text();
};
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

add('shorten', 'Utility', 'Shorten a URL (TinyURL)', { url: 'https://github.com' }, async (q) => ({
  short: (await T('https://tinyurl.com/api-create.php?url=' + enc(need(q, 'url')))).trim(),
}));

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
  const d = await J('https://api.github.com/users/' + enc(need(q, 'user')));
  return { login: d.login, name: d.name, bio: d.bio, avatar: d.avatar_url, followers: d.followers, following: d.following, repos: d.public_repos, created: d.created_at, url: d.html_url };
});

add('npm', 'Dev', 'npm package info', { package: 'express' }, async (q) => {
  const d = await J('https://registry.npmjs.org/' + enc(need(q, 'package')).replace('%40', '@').replace('%2F', '%2f') + '/latest');
  return { name: d.name, version: d.version, description: d.description, license: d.license, homepage: d.homepage, dependencies: d.dependencies };
});

// ------------------------- FUN -------------------------
add('joke', 'Fun', 'Random joke', {}, async () => J('https://official-joke-api.appspot.com/random_joke'));
add('quote', 'Fun', 'Random quote', {}, async () => {
  const d = await J('https://dummyjson.com/quotes/random');
  return { quote: d.quote, author: d.author };
});
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
add('meme', 'Fun', 'Random meme', {}, async () => {
  const d = await J('https://meme-api.com/gimme');
  return { title: d.title, image: d.url, subreddit: d.subreddit };
});
add('trivia', 'Fun', 'Random trivia question', {}, async () => {
  const d = await J('https://opentdb.com/api.php?amount=1');
  return d.results[0];
});
add('pokemon', 'Fun', 'Pokemon info', { name: 'pikachu' }, async (q) => {
  const d = await J('https://pokeapi.co/api/v2/pokemon/' + enc(need(q, 'name').toLowerCase()));
  return { id: d.id, name: d.name, height: d.height, weight: d.weight, types: d.types.map((t) => t.type.name), abilities: d.abilities.map((a) => a.ability.name), image: d.sprites.other['official-artwork'].front_default };
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
