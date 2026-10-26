const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

const app = express();
const DEFAULT_PORT = process.env.PORT || 3000;
const PROD_DOMAIN = process.env.APP_DOMAIN || 'https://asiott.xo.je';

// Global crash guards to prevent server restarts on socket drops or stream interruptions
process.on('uncaughtException', (err) => {
  console.warn('[Server] Uncaught exception safely handled:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Server] Unhandled rejection safely handled:', reason?.message || reason);
});

// Trust proxy for secure cookies, client IP, and HTTPS reverse proxy (Vercel / Cloudflare / Nginx)
app.enable('trust proxy');

// Production CORS Configuration
const allowedOrigins = [
  'https://asiott.xo.je',
  'http://asiott.xo.je',
  'https://www.asiott.xo.je',
  'http://www.asiott.xo.je',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.includes('asiott.xo.je') || origin.endsWith('.vercel.app') || origin.includes('onrender.com')) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive fallback for multi-source client aggregation
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Explicit routes for /watch and /movies
app.get(['/watch', '/watch.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

app.get(['/movies', '/movies.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'movies.html'));
});

// Production Health Check endpoints (for Render, Vercel & uptime monitoring)
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: process.env.VERCEL ? 'vercel' : (process.env.RENDER ? 'render' : 'standalone'),
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Path to independent IP view counter database
// On Vercel (read-only filesystem except /tmp), use /tmp if in Vercel environment
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'asi_data') : path.join(__dirname, 'data');
const VIEWS_FILE = path.join(DATA_DIR, 'views.json');

// Dynamic real-time scraping with fallback seed & post cache for cloud resilience (Render / Vercel Cloudflare bypass)
let MICROTV_SEED_CATALOG = [];
let MICROTV_PAGES_CATALOG = {};
let MICROTV_POSTS_CACHE = {};
let ANIME_SEED_CATALOG = [];
try {
  const seedPath = path.join(__dirname, 'data', 'microtv_seed.json');
  if (fs.existsSync(seedPath)) {
    MICROTV_SEED_CATALOG = JSON.parse(fs.readFileSync(seedPath, 'utf8') || '[]');
    console.log(`[MicroTV Seed] Loaded ${MICROTV_SEED_CATALOG.length} seed catalog items`);
  }
  const pagesPath = path.join(__dirname, 'data', 'microtv_pages.json');
  if (fs.existsSync(pagesPath)) {
    MICROTV_PAGES_CATALOG = JSON.parse(fs.readFileSync(pagesPath, 'utf8') || '{}');
    console.log(`[MicroTV Pages] Loaded ${Object.keys(MICROTV_PAGES_CATALOG).length} pages of catalog items`);
  }
  const cachePath = path.join(__dirname, 'data', 'microtv_posts_cache.json');
  if (fs.existsSync(cachePath)) {
    MICROTV_POSTS_CACHE = JSON.parse(fs.readFileSync(cachePath, 'utf8') || '{}');
    console.log(`[MicroTV Cache] Loaded ${Object.keys(MICROTV_POSTS_CACHE).length} pre-resolved posts`);
  }
  const animeSeedPath = path.join(__dirname, 'data', 'anime_seed.json');
  if (fs.existsSync(animeSeedPath)) {
    ANIME_SEED_CATALOG = JSON.parse(fs.readFileSync(animeSeedPath, 'utf8') || '[]');
    console.log(`[Anime Seed] Loaded ${ANIME_SEED_CATALOG.length} anime catalog items`);
  }
} catch (e) {
  console.warn('[MicroTV Cache / Anime Seed] Failed to load static seed/cache:', e.message);
}

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create data dir:', e.message);
  }
}

function getViewsDb() {
  try {
    if (!fs.existsSync(VIEWS_FILE)) {
      fs.writeFileSync(VIEWS_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    const raw = fs.readFileSync(VIEWS_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.error('Error reading views DB:', err.message);
    return {};
  }
}

function saveViewsDb(data) {
  try {
    fs.writeFileSync(VIEWS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving views DB:', err.message);
  }
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.ip || '127.0.0.1';
}

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
  'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};

// Authoritative upstream source base domains
let dynamicMovies4uBase = 'https://movies4u.nf';
let lastMovies4uResolvedAt = 0;
const MOVIES4U_RESOLVE_TTL = 15 * 60 * 1000; // 15 minutes cache

const MOVIES4U_BASE = 'https://movies4u.nf';
const FILMYZILLA_BASE = 'https://www.filmyzilla76.com';
const HDFILMYZILLA_BASE = 'https://hdfilmyzilla.in';
const MICROTV_BASE = 'https://m.microtv.st';

let dynamicMicrotvBase = 'https://m.microtv.st';
let lastMicrotvResolvedAt = 0;
const MICROTV_RESOLVE_TTL = 15 * 60 * 1000;

// Dynamic HDHub4u Gateway Mirror Resolver (Powered by https://hdhub4u.fast/ and Pingora/SunCDN gateways)
let dynamicHdhubBase = 'https://new9.hdhub4u.cl';
let lastHdhubResolvedAt = 0;
const HDHUB_RESOLVE_TTL = 15 * 60 * 1000; // 15 minutes cache

async function getActiveHdhubBase() {
  const now = Date.now();
  if (dynamicHdhubBase && (now - lastHdhubResolvedAt < HDHUB_RESOLVE_TTL)) {
    return dynamicHdhubBase;
  }

  const gatewayApis = [
    'https://h4.suncdn.org/host/',
    'https://points.topapii.com/host/',
    'https://ml.theapii.org/host/',
    'https://dns.pingora.fyi/v2/host',
    'https://cdn.hub4u.cloud/host/'
  ];

  const t = new Date();
  const e = 1e6 * t.getFullYear() + 1e4 * (t.getMonth() + 1) + 100 * t.getDate() + t.getHours() + 1;

  for (const api of gatewayApis) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${api}?v=${e}`, {
        headers: { 'User-Agent': COMMON_HEADERS['User-Agent'] },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.c) {
        const decoded = Buffer.from(data.c, 'base64').toString('utf8').trim();
        const u = new URL(decoded);
        dynamicHdhubBase = `${u.protocol}//${u.host}`;
        lastHdhubResolvedAt = now;
        console.log(`[HDHub Gateway] Successfully resolved active mirror domain from gateway API: ${dynamicHdhubBase}`);
        return dynamicHdhubBase;
      }
    } catch (err) {
      // try next gateway host
    }
  }

  // Fallback 1: inspect landing gateway https://hdhub4u.fast/ directly
  try {
    const res = await fetch('https://hdhub4u.fast/', {
      headers: { 'User-Agent': COMMON_HEADERS['User-Agent'] },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/aHR0cHM6Ly9[a-zA-Z0-9+/=]+/g);
      if (m) {
        for (const b64 of m) {
          try {
            const dec = Buffer.from(b64, 'base64').toString('utf8');
            if (dec.includes('hdhub4u') && dec.startsWith('http')) {
              const u = new URL(dec);
              dynamicHdhubBase = `${u.protocol}//${u.host}`;
              lastHdhubResolvedAt = now;
              console.log(`[HDHub Gateway] Resolved mirror from fast landing: ${dynamicHdhubBase}`);
              return dynamicHdhubBase;
            }
          } catch (e) { }
        }
      }
    }
  } catch (err) { }

  // Fallback 2: inspect landing gateway https://hdhub4u.kg/ directly
  try {
    const res = await fetch('https://hdhub4u.kg/', {
      headers: { 'User-Agent': COMMON_HEADERS['User-Agent'] },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/aHR0cHM6Ly9[a-zA-Z0-9+/=]+/g);
      if (m) {
        for (const b64 of m) {
          try {
            const dec = Buffer.from(b64, 'base64').toString('utf8');
            if (dec.includes('hdhub4u') && dec.startsWith('http')) {
              const u = new URL(dec);
              dynamicHdhubBase = `${u.protocol}//${u.host}`;
              lastHdhubResolvedAt = now;
              return dynamicHdhubBase;
            }
          } catch (e) { }
        }
      }
    }
  } catch (err) { }

  lastHdhubResolvedAt = now;
  return dynamicHdhubBase || 'https://new9.hdhub4u.cl';
}

// Dynamic Movies4u Domain Resolver (Monitors https://movies4u.bot/ and auto-resolves updated domains)
async function getActiveMovies4uBase() {
  const now = Date.now();
  if (dynamicMovies4uBase && (now - lastMovies4uResolvedAt < MOVIES4U_RESOLVE_TTL)) {
    return dynamicMovies4uBase;
  }

  try {
    const res = await fetch('https://movies4u.bot/', {
      headers: { 'User-Agent': COMMON_HEADERS['User-Agent'] },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const html = await res.text();
      let targetUrl = null;
      const b64Matches = html.match(/atob\(['"]([a-zA-Z0-9+/=]+)['"]\)/g);
      if (b64Matches) {
        for (const m of b64Matches) {
          try {
            const encoded = m.match(/atob\(['"]([a-zA-Z0-9+/=]+)['"]\)/)[1];
            const dec = Buffer.from(encoded, 'base64').toString('utf8');
            const hrefMatch = dec.match(/href=["'](https?:\/\/[^"']+)["']/i);
            if (hrefMatch) {
              targetUrl = hrefMatch[1];
              break;
            }
          } catch (e) {}
        }
      }
      if (!targetUrl) {
        const tiny = html.match(/https?:\/\/tinyurl\.com\/[a-zA-Z0-9_-]+/i);
        if (tiny) targetUrl = tiny[0];
      }

      if (targetUrl) {
        const rRes = await fetch(targetUrl, {
          headers: { 'User-Agent': COMMON_HEADERS['User-Agent'] },
          redirect: 'follow',
          signal: AbortSignal.timeout(5000)
        });
        if (rRes.ok) {
          const u = new URL(rRes.url);
          dynamicMovies4uBase = `${u.protocol}//${u.host}`;
          lastMovies4uResolvedAt = now;
          console.log(`[Movies4u Gateway] Successfully resolved active mirror domain from movies4u.bot: ${dynamicMovies4uBase}`);
          return dynamicMovies4uBase;
        }
      }
    }
  } catch (err) {
    console.warn('[Movies4u Gateway] Resolver warning:', err.message);
  }

  lastMovies4uResolvedAt = now;
  return dynamicMovies4uBase || 'https://movies4u.nf';
}

// Dynamic MiniTV / MicroTV Domain Resolver (Auto-follows redirect from https://microtv.st/)
async function getActiveMicroTvBase() {
  const now = Date.now();
  if (dynamicMicrotvBase && (now - lastMicrotvResolvedAt < MICROTV_RESOLVE_TTL)) {
    return dynamicMicrotvBase;
  }

  try {
    const res = await fetch('https://microtv.st/', {
      headers: { 'User-Agent': COMMON_HEADERS['User-Agent'] },
      redirect: 'manual',
      signal: AbortSignal.timeout(4000)
    });
    if ([301, 302, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (loc) {
        const u = new URL(loc, 'https://microtv.st/');
        dynamicMicrotvBase = `${u.protocol}//${u.host}`;
        lastMicrotvResolvedAt = now;
        console.log(`[MicroTV Gateway] Successfully resolved active domain from microtv.st: ${dynamicMicrotvBase}`);
        return dynamicMicrotvBase;
      }
    }
  } catch (err) {
    console.warn('[MicroTV Gateway] Resolver warning:', err.message);
  }

  lastMicrotvResolvedAt = now;
  return dynamicMicrotvBase || 'https://m.microtv.st';
}

// ---------------------------------------------------------------------------
// SOURCE: https://www.filmyzilla74.com/ (High-Speed In-Memory Sitemap Index)
// ---------------------------------------------------------------------------
let filmyzillaIndex = null;
let filmyzillaIndexedAt = 0;
const FILMYZILLA_INDEX_TTL = 60 * 60 * 1000; // 1 hour in-memory cache

async function getFilmyzillaIndex() {
  const now = Date.now();
  if (filmyzillaIndex && (now - filmyzillaIndexedAt < FILMYZILLA_INDEX_TTL)) {
    return filmyzillaIndex;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${FILMYZILLA_BASE}/sitemap.xml`, {
      headers: { ...COMMON_HEADERS, 'Referer': `${FILMYZILLA_BASE}/` },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return filmyzillaIndex || [];
    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/gi)].map(m => m[1]);
    const index = [];

    for (const u of urls) {
      const match = u.match(/\/movie\/(\d+)\/([^/]+)\.html/i);
      if (!match) continue;
      const movieId = match[1];
      const slug = match[2];

      const cleanTitle = slug
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());

      const thumbnail = `${FILMYZILLA_BASE}/files/images/${slug}.jpg`;
      const isSeries = cleanTitle.toLowerCase().includes('series') || cleanTitle.toLowerCase().includes('season') || cleanTitle.toLowerCase().includes('s0');

      index.push({
        id: `filmyzilla_${movieId}`,
        movieId,
        slug: `${movieId}/${slug}.html`,
        rawSlug: slug,
        permalink: u,
        title: cleanTitle,
        thumbnail,
        views: `${(Math.floor(Math.random() * 25) + 12) / 10}k views`,
        source: 'Filmyzilla',
        category: isSeries ? 'Web Series' : 'Movies',
        quality: '1080p | 720p | 480p'
      });
    }

    filmyzillaIndex = index;
    filmyzillaIndexedAt = now;
    console.log(`[Filmyzilla] Successfully indexed ${index.length} movies from sitemap`);
    return index;
  } catch (err) {
    console.warn('[Filmyzilla] Failed to load sitemap index:', err.message);
    return filmyzillaIndex || [];
  }
}

async function fetchFilmyzillaSearch(query) {
  if (!query) return [];
  const index = await getFilmyzillaIndex();
  if (!index || index.length === 0) return [];

  const qRaw = query.trim().toLowerCase();
  const qAlnum = qRaw.replace(/[^a-z0-9]/g, '');
  const qWords = qRaw.split(/[^a-z0-9]+/).filter(w => w.length > 1);

  if (qAlnum.length === 0) return [];

  const scored = [];

  for (const item of index) {
    const tRaw = item.title.toLowerCase();
    const tAlnum = tRaw.replace(/[^a-z0-9]/g, '');
    const sRaw = (item.rawSlug || item.slug || '').toLowerCase();
    const sAlnum = sRaw.replace(/[^a-z0-9]/g, '');

    let score = 0;

    // 1. Exact raw substring match
    if (tRaw.includes(qRaw) || sRaw.includes(qRaw)) {
      score += 150;
    }
    // 2. Collapsed alphanumeric match (e.g. "spiderman" <-> "spider man", "avatar2" <-> "avatar 2")
    else if (tAlnum.includes(qAlnum) || sAlnum.includes(qAlnum)) {
      score += 120;
    }

    // 3. Token-based matching & overlap
    if (qWords.length > 0) {
      let matchedWords = 0;
      for (const w of qWords) {
        if (tRaw.includes(w) || sRaw.includes(w)) {
          matchedWords++;
        } else if (w.length >= 4 && (tAlnum.includes(w) || sAlnum.includes(w))) {
          matchedWords++;
        }
      }

      if (matchedWords === qWords.length) {
        score += 80;
      } else if (matchedWords > 0) {
        const ratio = matchedWords / qWords.length;
        if (ratio >= 0.5) {
          score += Math.round(50 * ratio);
        }
      }
    }

    // 4. Substring prefix match on words (e.g. "aveng" matches "avengers")
    for (const w of qWords) {
      if (w.length >= 3) {
        const itemWords = tRaw.split(/[^a-z0-9]+/).filter(Boolean);
        for (const iw of itemWords) {
          if (iw.startsWith(w) || (w.length >= 4 && iw.includes(w))) {
            score += 15;
            break;
          }
        }
      }
    }

    if (score > 20) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 30).map(s => s.item);
}

/**
 * Map file, video, and stream URLs to their authoritative referer domain to satisfy CDN hotlinking checks
 */
function getRefererForUrl(targetUrl) {
  const currentHdwall = dynamicHdhubBase || 'https://new9.hdhub4u.cl';
  const currentMovies4u = dynamicMovies4uBase || 'https://movies4u.nf';
  const currentMicroTv = dynamicMicrotvBase || 'https://m.microtv.st';
  if (!targetUrl) return `${currentHdwall}/`;
  try {
    const u = new URL(targetUrl);
    const host = u.hostname.toLowerCase();
    if (host.includes('hdfilmyzilla') || host.includes('filmy-zilla')) {
      return 'https://hdfilmyzilla.in/';
    }
    if (host.includes('filmyzilla')) {
      return `${FILMYZILLA_BASE}/`;
    }
    if (host.includes('acek-cdn') || host.includes('m4uplay') || host.includes('morenci') || host.includes('morencl')) {
      return 'https://m4uplay.quest/';
    }
    if (host.includes('movies4u') || host.includes('m4ulinks') || host.includes('mdrive') || host.includes('1movies4u')) {
      return `${currentMovies4u}/`;
    }
    if (host.includes('filesdl') || host.includes('awssspp') || host.includes('a4udia')) {
      return 'https://new6.filesdl.top/';
    }
    if (host.includes('hdmobi')) {
      return 'https://hdmobi.in/';
    }
    if (host.includes('ghdhub')) {
      return 'https://ghdhub.org/';
    }
    if (host.includes('hubcdn.io') || host.includes('hdwall.xyz') || host.includes('hdtvb.net') || host.includes('hdhubs.xyz') || host.includes('hdhub4u')) {
      return `${currentHdwall}/`;
    }
    if (host.includes('gamerxyt')) {
      return 'https://hubcloud.ist/';
    }
    if (host.includes('hubcloud') || host.includes('gpdl') || host.includes('rohitkiskk') || host.includes('hbplay')) {
      return 'https://gamerxyt.com/';
    }
    if (host.includes('r2.cloudflarestorage') || host.includes('pixeldrain') || host.includes('fuckingfast')) {
      return 'https://hubcloud.ist/';
    }
    if (host.includes('microtv') || host.includes('xdl.my.id') || host.includes('playmate') || host.includes('r2.dev')) {
      return `${currentMicroTv}/`;
    }
    if (host.includes('toonworld') || host.includes('toonworld4all')) {
      return 'https://toonworld4all.me/';
    }
    if (host.includes('archive.toonworld4all')) {
      return 'https://archive.toonworld4all.me/';
    }
    if (host.includes('filepress')) {
      return 'https://new2.filepress.lat/';
    }
    if (host.includes('gdflix')) {
      return 'https://gdflix.dev/';
    }
    return `${u.protocol}//${u.host}/`;
  } catch (e) {
    return `${currentHdwall}/`;
  }
}

/**
 * Fetch a URL navigating through redirects (301, 302, 307, 308) while setting the correct authoritative Referer at each hop
 */
async function fetchWithRefererRedirect(url, baseHeaders = {}, maxRedirects = 5) {
  let curUrl = url;
  let hops = 0;
  while (hops < maxRedirects) {
    const referer = getRefererForUrl(curUrl);
    let origin;
    try {
      origin = new URL(referer).origin;
    } catch (e) {
      origin = dynamicHdhubBase || 'https://new9.hdhub4u.cl';
    }

    const headers = {
      ...baseHeaders,
      'User-Agent': COMMON_HEADERS['User-Agent'],
      'Referer': referer,
      'Origin': origin
    };

    const res = await fetch(curUrl, {
      headers,
      redirect: 'manual'
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (loc) {
        curUrl = loc.startsWith('http') ? loc : new URL(loc, curUrl).href;
        hops++;
        continue;
      }
    }
    return { response: res, finalUrl: curUrl };
  }
  const referer = getRefererForUrl(curUrl);
  let origin;
  try {
    origin = new URL(referer).origin;
  } catch (e) {
    origin = dynamicHdhubBase || 'https://new9.hdhub4u.cl';
  }
  return {
    response: await fetch(curUrl, {
      headers: {
        ...baseHeaders,
        'User-Agent': COMMON_HEADERS['User-Agent'],
        'Referer': referer,
        'Origin': origin
      }
    }),
    finalUrl: curUrl
  };
}

// ---------------------------------------------------------------------------
// Link Resolver Helpers & In-Memory Cache (HubCloud & HubCDN Multi-Cloud Resolution)
// ---------------------------------------------------------------------------
const RESOLVER_CACHE = new Map();
const RESOLVER_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Resolves an Mdrive link (e.g. from movies4u.nf -> https://mdrive.cloud/mdisk/...)
 * Extracts HubCloud / Direct media and returns { cloudDirect, directDownload, hdCloud, streamUrl, embedUrl }
 */
async function resolveMdriveLink(mdriveUrl) {
  if (!mdriveUrl) return null;
  const cached = RESOLVER_CACHE.get(mdriveUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const activeM4u = await getActiveMovies4uBase();
    const res = await fetch(mdriveUrl, {
      headers: { ...COMMON_HEADERS, 'Referer': `${activeM4u}/` },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const hubMatch = html.match(/href=["'](https?:\/\/[^"']*hubcloud\.[a-z0-9-]+\/(?:drive|video)\/[^"']+)["']/i);
    if (hubMatch) {
      const resolved = await resolveHubCloudLink(hubMatch[1]);
      if (resolved) {
        RESOLVER_CACHE.set(mdriveUrl, { data: resolved, expiresAt: Date.now() + RESOLVER_TTL_MS });
        return resolved;
      }
    }
  } catch (e) {
    console.warn('Mdrive resolve warning:', e.message);
  }
  return null;
}

/**
 * Resolves a HubCloud link (e.g., https://hubcloud.ist/drive/... or https://hubcloud.ist/video/...)
 * Returns { cloudDirect, directDownload, hdCloud, streamUrl, embedUrl }
 */
async function resolveHubCloudLink(hubCloudUrl) {
  if (!hubCloudUrl) return null;
  const cached = RESOLVER_CACHE.get(hubCloudUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const activeBase = await getActiveHdhubBase();
  try {
    const res = await fetch(hubCloudUrl, {
      headers: { ...COMMON_HEADERS, 'Referer': `${activeBase}/` }
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Support gamerxyt.com, sportverse.cc, or any hubcloud.php generator link
    const genMatch = html.match(/<a[^>]+href=["'](https?:\/\/[^"'\s<>]+\/hubcloud\.php[^"']+)["']/i);
    if (!genMatch) return null;

    const gamerUrl = genMatch[1];
    const gRes = await fetch(gamerUrl, {
      headers: { ...COMMON_HEADERS, 'Referer': hubCloudUrl }
    });
    if (!gRes.ok) return null;
    const gHtml = await gRes.text();

    const r2Match = gHtml.match(/href=["'](https?:\/\/[^"'\s<>]*\.r2\.cloudflarestorage\.com\/[^"']+)["']/i) ||
      gHtml.match(/href=["'](https?:\/\/[^"'\s<>]*\.r2\.dev\/[^"']+)["']/i);
    const server10GbpsMatch = gHtml.match(/href=["'](https?:\/\/[^"'\s<>]*gpdl[^"'\s<>]*\/\?[^"']+)["']/i) ||
      gHtml.match(/href=["'](https?:\/\/[^"'\s<>]*hubcloud\.[a-z0-9-]+\/\?[^"']+)["']/i) ||
      gHtml.match(/href=["'](https?:\/\/pixeldrain\.dev\/u\/[^"']+)["']/i);
    const watchMatch = gHtml.match(/href=["'](https?:\/\/hbplay\.pages\.dev\/\?u=([^"'\s&]+)[^"']*)["']/i);

    let streamUrl = null;
    if (watchMatch && watchMatch[2]) {
      try {
        streamUrl = Buffer.from(watchMatch[2], 'base64').toString('utf8');
      } catch (e) { }
    }

    const cloudDirect = r2Match ? r2Match[1].replace(/&amp;/g, '&') : null;
    const directDownload = server10GbpsMatch ? server10GbpsMatch[1] : cloudDirect;

    const stream = streamUrl || cloudDirect || directDownload;
    let embedUrl = watchMatch ? watchMatch[1].replace(/&amp;/g, '&') : null;
    if (!embedUrl && stream) {
      embedUrl = `https://hbplay.pages.dev/?u=${Buffer.from(stream).toString('base64')}`;
    }

    const result = {
      cloudDirect: cloudDirect || directDownload || hubCloudUrl,
      directDownload: directDownload || cloudDirect || hubCloudUrl,
      hdCloud: hubCloudUrl,
      streamUrl: stream,
      embedUrl
    };

    RESOLVER_CACHE.set(hubCloudUrl, { data: result, expiresAt: Date.now() + RESOLVER_TTL_MS });
    return result;
  } catch (e) {
    console.warn('Error in resolveHubCloudLink:', e.message);
    return null;
  }
}

/**
 * Resolves a HubCDN link (e.g. from HDWall https://hubcdn.io/cloud/...)
 * Returns { filesDlUrl, cloudDirect, directDownload, hdCloud, streamUrl, embedUrl }
 */
async function resolveHubCdnTier(hubCdnUrl) {
  if (!hubCdnUrl) return null;
  const cached = RESOLVER_CACHE.get(hubCdnUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const activeBase = await getActiveHdhubBase();
  try {
    const r1 = await fetch(hubCdnUrl, {
      headers: { ...COMMON_HEADERS, 'Referer': `${activeBase}/` }
    });
    if (!r1.ok) return null;
    const h1 = await r1.text();

    // Parse modern HubCDN route buttons: /l.php?...
    const links = [...h1.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({
      href: m[1].replace(/&amp;/g, '&'),
      text: m[2].replace(/<[^>]+>/g, '').trim()
    }));

    let cfRouteLink = null;
    let directLink = null;
    let hubCloudLink = null;

    for (const l of links) {
      if (l.href.includes('cf_route=')) {
        cfRouteLink = l.href;
      } else if (l.href.includes('hubcloud.ist')) {
        hubCloudLink = l.href;
      } else if (l.href.startsWith('/l.php') && !l.href.includes('tg_route=') && !l.href.includes('go_route=')) {
        if (!directLink) directLink = l.href;
      }
    }

    let cloudDirect = null;
    let directDownload = null;
    let streamUrl = null;

    // Follow cf_route with manual redirect to extract genuine Cloudflare R2 file URL
    if (cfRouteLink) {
      const fullCfUrl = cfRouteLink.startsWith('http') ? cfRouteLink : `https://hubcdn.io${cfRouteLink}`;
      try {
        const cfRes = await fetch(fullCfUrl, {
          headers: { ...COMMON_HEADERS, 'Referer': hubCdnUrl },
          redirect: 'manual'
        });
        if ([301, 302, 303, 307, 308].includes(cfRes.status)) {
          const loc = cfRes.headers.get('location');
          if (loc) {
            cloudDirect = loc;
            streamUrl = loc;
          }
        }
      } catch (e) {
        console.warn('HubCDN cf_route resolve error:', e.message);
      }
    }

    // Follow direct route with manual redirect to extract genuine Google CDN video URL
    if (directLink) {
      const fullDirectUrl = directLink.startsWith('http') ? directLink : `https://hubcdn.io${directLink}`;
      try {
        const dRes = await fetch(fullDirectUrl, {
          headers: { ...COMMON_HEADERS, 'Referer': hubCdnUrl },
          redirect: 'manual'
        });
        if ([301, 302, 303, 307, 308].includes(dRes.status)) {
          const loc = dRes.headers.get('location');
          if (loc) {
            directDownload = loc;
            if (!streamUrl) streamUrl = loc;
          }
        }
      } catch (e) {
        console.warn('HubCDN direct route resolve error:', e.message);
      }
    }

    // Fallback: If legacy targetUrl / textarea was present
    if (!cloudDirect && !directDownload) {
      const targetMatch = h1.match(/var\s+targetUrl\s*=\s*["']([^"']+)["']/i) ||
        h1.match(/<textarea[^>]+id=["']downloadLinkBox["'][^>]*>([\s\S]*?)<\/textarea>/i);
      if (targetMatch) {
        const filesDlUrl = targetMatch[1].trim();
        const r2 = await fetch(filesDlUrl, { headers: { ...COMMON_HEADERS, 'Referer': hubCdnUrl } });
        if (r2.ok) {
          const h2 = await r2.text();
          const fLinks = [...h2.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
          for (const fl of fLinks) {
            const href = fl[1];
            const text = fl[2].replace(/<[^>]+>/g, '').trim();
            if (text.includes('Cloud Direct') || href.includes('r2.cloudflarestorage') || href.includes('r2.dev')) {
              cloudDirect = href;
            } else if (text.includes('Direct Download') || href.includes('googleusercontent')) {
              directDownload = href;
            }
          }
        }
      }
    }

    let extra = null;
    if (hubCloudLink) {
      extra = await resolveHubCloudLink(hubCloudLink);
    }

    const finalStream = streamUrl || extra?.streamUrl || cloudDirect || directDownload;
    let embedUrl = null;
    if (finalStream) {
      embedUrl = `https://hbplay.pages.dev/?u=${Buffer.from(finalStream).toString('base64')}`;
    }

    const result = {
      filesDlUrl: hubCdnUrl,
      cloudDirect: cloudDirect || extra?.cloudDirect || directDownload || hubCdnUrl,
      directDownload: directDownload || extra?.directDownload || cloudDirect || hubCdnUrl,
      hdCloud: hubCloudLink || hubCdnUrl,
      streamUrl: finalStream,
      embedUrl: embedUrl || extra?.embedUrl
    };

    RESOLVER_CACHE.set(hubCdnUrl, { data: result, expiresAt: Date.now() + RESOLVER_TTL_MS });
    return result;
  } catch (err) {
    console.warn('Error in resolveHubCdnTier:', err.message);
    return null;
  }
}

/**
 * Extracts Movies4u Player Information (Designated embed and direct HLS stream)
 */
function extractM4uPlayer(m4uHtml, fileId) {
  let embedUrl = `https://morencius.com/embed/${fileId}`;
  let directStreamUrl = null;

  try {
    const evalMatch = m4uHtml.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\)\)/);
    if (evalMatch) {
      const unpacker = evalMatch[0].replace(/^eval/, '');
      const unpacked = eval(unpacker);

      const hls2Match = unpacked.match(/"hls2"\s*:\s*"([^"]+)"/i);
      const hls4Match = unpacked.match(/"hls4"\s*:\s*"([^"]+)"/i);
      if (hls2Match && hls2Match[1].startsWith('http')) {
        directStreamUrl = hls2Match[1].replace(/\\/g, '');
      } else if (hls4Match && hls4Match[1].startsWith('http')) {
        directStreamUrl = hls4Match[1].replace(/\\/g, '');
      }

      const embedDomainMatch = unpacked.match(/(?:https%3A%2F%2F|https:\/\/)(morencl[a-z0-9.]+|morenci[a-z0-9.]+)\/embed/i);
      if (embedDomainMatch) {
        embedUrl = `https://${embedDomainMatch[1]}/embed/${fileId}`;
      }
    }
  } catch (e) {
    console.warn('Error unpacking Movies4u player:', e.message);
  }

  return { embedUrl, directStreamUrl };
}

// Helper: Determine category from title and source
function detectCategory(title, source) {
  if (source === 'MicroTV') return 'Mini Drama';
  const clean = (title || '').toLowerCase();
  if (clean.includes('tv show') || clean.includes('tv series') || clean.includes('television') ||
    clean.includes('reality show') || clean.includes('talk show') || clean.includes('k-drama') ||
    clean.includes('kdrama') || clean.includes('drama series')) {
    return 'TV Shows';
  }
  if (clean.includes('season') || clean.includes('s0') || clean.includes('s1') || clean.includes('s2') ||
    clean.includes('s3') || clean.includes('s4') || clean.includes('s5') ||
    clean.includes('complete series') || clean.includes('completed web') || clean.includes('web series') ||
    clean.includes('episode')) {
    return 'Web Series';
  }
  return 'Movies';
}

// Clean HTML titles
function cleanTitle(raw) {
  if (!raw) return '';
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&#[a-zA-Z0-9]+;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#038;/g, '&')
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Clean View Count Formatter (Eliminates emojis and formats cleanly: e.g. "3.2K views")
function formatViewCount(rawViews) {
  if (!rawViews) return '1.5K views';
  const clean = String(rawViews).replace(/👁️/g, '').replace(/views/gi, '').trim();
  const numMatch = clean.replace(/,/g, '').match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!numMatch) return '1.5K views';
  const num = parseFloat(numMatch[1]);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M views`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K views`;
  return `${num} views`;
}

// ---------------------------------------------------------------------------
// 1. SOURCE: m.microtv.st (Mini Drama / Reels)
// ---------------------------------------------------------------------------

const MICROTV_CACHE = new Map();
const MICROTV_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Dynamic live fetcher for m.microtv.st with anti-blocking Jina AI reader and multi-proxy failover.
 * Ensures Mini Drama works seamlessly even on cloud hosting IPs (e.g. Vercel) where Cloudflare challenges appear.
 */
async function fetchMicroTvHtml(targetUrl) {
  if (!targetUrl) return null;
  const cached = MICROTV_CACHE.get(targetUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Strategy 1: Direct fetch (Super fast 200ms response for local & non-challenged requests)
  try {
    const activeMicro = await getActiveMicroTvBase();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(targetUrl, {
      headers: {
        ...COMMON_HEADERS,
        'Referer': `${activeMicro}/`
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const text = await res.text();
      if (!text.includes('Just a moment...') && !text.includes('Checking your browser') && text.length > 500) {
        MICROTV_CACHE.set(targetUrl, { data: text, expiresAt: Date.now() + MICROTV_CACHE_TTL_MS });
        return text;
      }
    }
  } catch (e) {
    console.warn('MicroTV direct fetch error, falling back to readers:', e.message);
  }

  // Strategy 2: Jina AI cloud reader (Cleanly extracts full HTML bypassing Cloudflare on Vercel)
  try {
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const jRes = await fetch(jinaUrl, {
      headers: {
        'X-Return-Format': 'html',
        'X-No-Cache': 'true'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (jRes.ok) {
      const html = await jRes.text();
      if (html.length > 500 && !html.includes('Just a moment...') && (html.includes('post-card') || html.includes('embed-player') || html.includes('download.php') || html.includes('featured-poster'))) {
        MICROTV_CACHE.set(targetUrl, { data: html, expiresAt: Date.now() + MICROTV_CACHE_TTL_MS });
        return html;
      }
    }
  } catch (e) {
    console.warn('MicroTV Jina fetch warning:', e.message);
  }

  // Strategy 3: allorigins fallback bridge
  try {
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const pRes = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (pRes.ok) {
      const text = await pRes.text();
      if (text.length > 500 && !text.includes('Just a moment...')) {
        MICROTV_CACHE.set(targetUrl, { data: text, expiresAt: Date.now() + MICROTV_CACHE_TTL_MS });
        return text;
      }
    }
  } catch (e) { }

  return null;
}

function parseMicroTvCards(html) {
  const cards = [];
  const cardRegex = /<div\s+class=["']post-card["']>([\s\S]*?)<\/div>/gi;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const cardHtml = match[1];
    const linkMatch = cardHtml.match(/<a\s+[^>]*href=["'](?:https?:\/\/(?:m|new)\.microtv\.st)?\/post\/([a-zA-Z0-9_-]+)["']/i) ||
      cardHtml.match(/<a\s+[^>]*href=["']\/post\/([a-zA-Z0-9_-]+)["']/i);
    const slug = linkMatch ? linkMatch[1] : null;

    const imgMatch = cardHtml.match(/<img[^>]+?\bsrc=["']([^"']+)["']/i);
    const thumbnail = imgMatch ? imgMatch[1] : '';

    const h3Match = cardHtml.match(/<h3>([\s\S]*?)<\/h3>/i);
    const altMatch = cardHtml.match(/alt=["']([^"']+)["']/i);
    let title = h3Match ? h3Match[1].trim() : (altMatch ? altMatch[1].trim() : '');
    title = cleanTitle(title);

    const viewsMatch = cardHtml.match(/<div\s+class=["']views["']>([\s\S]*?)<\/div>/i) ||
      cardHtml.match(/<span\s+class=["']views["']>([\s\S]*?)<\/span>/i) ||
      cardHtml.match(/👁️\s*([0-9,]+)\s*views/i);
    const rawViews = viewsMatch ? viewsMatch[1].replace(/<[^>]+>/g, '').trim() : '1800';
    const views = formatViewCount(rawViews);

    if (slug) {
      cards.push({
        id: `microtv_${slug}`,
        slug,
        title: title || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        thumbnail,
        views,
        source: 'MicroTV',
        category: 'Mini Drama',
        quality: 'HD Stream'
      });
    }
  }

  return cards;
}

let KNOWN_MICROTV_TOTAL_PAGES = 35;

function parsePagination(html, requestedPage) {
  const curPage = parseInt(requestedPage, 10) || 1;
  const pageNumbers = new Set();
  pageNumbers.add(curPage);

  // Scan all page query occurrences across the HTML to find the maximum published page (e.g. 33+)
  const pageMatches = [...html.matchAll(/[?&]page=([0-9]+)/gi)];
  pageMatches.forEach(m => {
    const num = parseInt(m[1], 10);
    if (!isNaN(num) && num > 0 && num < 1000) {
      pageNumbers.add(num);
      if (num > KNOWN_MICROTV_TOTAL_PAGES) {
        KNOWN_MICROTV_TOTAL_PAGES = num;
      }
    }
  });

  const totalPages = Math.max(KNOWN_MICROTV_TOTAL_PAGES, curPage);
  for (let i = 1; i <= Math.min(totalPages, 5); i++) {
    pageNumbers.add(i);
  }
  pageNumbers.add(totalPages);

  const sortedPages = Array.from(pageNumbers).sort((a, b) => a - b);

  return {
    currentPage: curPage,
    totalPages,
    hasNext: curPage < totalPages || html.includes('Next »') || html.includes('Next'),
    hasPrev: curPage > 1 || html.includes('« Previous') || html.includes('Previous'),
    pages: sortedPages
  };
}

// ---------------------------------------------------------------------------
// 1b. SOURCE: Dynamic ToonWorld4All (toonworld4all.me / archive.toonworld4all.me) (Anime)
// ---------------------------------------------------------------------------
const TOONWORLD_BASE = 'https://toonworld4all.me';
const ARCHIVE_TOONWORLD_BASE = 'https://archive.toonworld4all.me';

function parseToonworldCards(html) {
  const cards = [];
  const articleMatches = [...html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi)];

  for (const artMatch of articleMatches) {
    const art = artMatch[1];
    const linkMatch = art.match(/href=["'](https?:\/\/toonworld4all\.me\/([^\/'"]+)\/?)["']/i);
    if (!linkMatch) continue;

    const permalink = linkMatch[1];
    const slug = linkMatch[2];

    const titleMatch = art.match(/<h2[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
      art.match(/alt=["']([^"']+)["']/i) ||
      art.match(/title=["']([^"']+)["']/i);
    const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : slug;
    const title = cleanTitle(rawTitle);

    const imgMatch = art.match(/src=["']([^"']+)["']/i);
    let thumbnail = imgMatch ? imgMatch[1] : '';
    const dataSrcMatch = art.match(/data-src=["']([^"']+)["']/i) || art.match(/data-lazy-src=["']([^"']+)["']/i);
    if (dataSrcMatch && !thumbnail.startsWith('http')) {
      thumbnail = dataSrcMatch[1];
    }

    cards.push({
      id: `toonworld_${slug}`,
      slug,
      permalink,
      title,
      thumbnail,
      views: `${(Math.floor(Math.random() * 25) + 12) / 10}k views`,
      source: 'ToonWorld4All',
      category: 'Anime',
      quality: '480p | 720p | 1080p'
    });
  }

  return cards;
}

let KNOWN_TOONWORLD_TOTAL_PAGES = 230;

function parseToonworldPagination(html, requestedPage) {
  const curPage = parseInt(requestedPage, 10) || 1;
  const pageNumbers = new Set();
  pageNumbers.add(curPage);

  const pageMatches = [...html.matchAll(/\/category\/anime\/page\/([0-9]+)\/?/gi)];
  pageMatches.forEach(m => {
    const num = parseInt(m[1], 10);
    if (!isNaN(num) && num > 0 && num < 1000) {
      pageNumbers.add(num);
      if (num > KNOWN_TOONWORLD_TOTAL_PAGES) {
        KNOWN_TOONWORLD_TOTAL_PAGES = num;
      }
    }
  });

  const totalPages = Math.max(KNOWN_TOONWORLD_TOTAL_PAGES, curPage);
  for (let i = 1; i <= Math.min(totalPages, 5); i++) {
    pageNumbers.add(i);
  }
  pageNumbers.add(totalPages);

  const sortedPages = Array.from(pageNumbers).sort((a, b) => a - b);

  return {
    currentPage: curPage,
    totalPages,
    hasNext: curPage < totalPages || html.includes('next page-numbers'),
    hasPrev: curPage > 1 || html.includes('prev page-numbers'),
    pages: sortedPages
  };
}

async function fetchToonworldAnimeCatalog(page = 1) {
  try {
    const curPage = Math.max(1, parseInt(page, 10) || 1);
    const catUrl = curPage > 1 ? `${TOONWORLD_BASE}/category/anime/page/${curPage}/` : `${TOONWORLD_BASE}/category/anime/`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(catUrl, {
      headers: { ...COMMON_HEADERS, 'Referer': `${TOONWORLD_BASE}/` },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const items = parseToonworldCards(html);
      if (items.length > 0) {
        const pagination = parseToonworldPagination(html, curPage);
        return { items, pagination };
      }
    }
  } catch (err) {
    console.warn(`[ToonWorld] Catalog live fetch warning (page ${page}):`, err.message);
  }

  // Cloud deployment fallback (Render / Vercel Cloudflare challenge resilience)
  if (ANIME_SEED_CATALOG.length > 0) {
    const pageSize = 12;
    const totalPages = Math.max(30, Math.ceil(ANIME_SEED_CATALOG.length / pageSize));
    const curPage = Math.min(Math.max(1, parseInt(page, 10) || 1), totalPages);
    const start = ((curPage - 1) * pageSize) % ANIME_SEED_CATALOG.length;
    let items = ANIME_SEED_CATALOG.slice(start, start + pageSize);
    if (items.length < pageSize) {
      items = items.concat(ANIME_SEED_CATALOG.slice(0, pageSize - items.length));
    }

    const pageNumbers = new Set();
    pageNumbers.add(curPage);
    for (let i = 1; i <= Math.min(totalPages, 5); i++) pageNumbers.add(i);
    if (curPage > 1) pageNumbers.add(curPage - 1);
    if (curPage < totalPages) pageNumbers.add(curPage + 1);
    pageNumbers.add(totalPages);

    return {
      items,
      pagination: {
        currentPage: curPage,
        totalPages,
        hasNext: curPage < totalPages,
        hasPrev: curPage > 1,
        pages: Array.from(pageNumbers).sort((a, b) => a - b)
      }
    };
  }

  return {
    items: [],
    pagination: {
      currentPage: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
      pages: [1]
    }
  };
}

async function fetchToonworldSearch(query) {
  if (!query) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const searchUrl = `${TOONWORLD_BASE}/?s=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: { ...COMMON_HEADERS, 'Referer': `${TOONWORLD_BASE}/` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const html = await res.text();
      const items = parseToonworldCards(html);
      if (items.length > 0) return items;
    }
  } catch (err) {
    console.warn(`[ToonWorld] Search live fetch warning for "${query}":`, err.message);
  }

  // Fallback to seed catalog search
  if (ANIME_SEED_CATALOG.length > 0) {
    const q = query.toLowerCase();
    return ANIME_SEED_CATALOG.filter(it => (it.title || '').toLowerCase().includes(q) || (it.slug || '').toLowerCase().includes(q));
  }
  return [];
}

async function resolveToonworldRedirect(redirectPath, referer) {
  if (!redirectPath) return null;
  const fullUrl = redirectPath.startsWith('http') ? redirectPath : `${ARCHIVE_TOONWORLD_BASE}${redirectPath}`;
  const cached = RESOLVER_CACHE.get(fullUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(fullUrl, {
      headers: { ...COMMON_HEADERS, 'Referer': referer || `${ARCHIVE_TOONWORLD_BASE}/` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    const match = html.match(/window\.__PROPS__\s*=\s*({[\s\S]*?});/);
    if (match) {
      const props = JSON.parse(match[1]);
      const { domain, hidden } = props.link || {};
      if (domain && hidden) {
        const resolved = `${domain}${hidden}`;
        RESOLVER_CACHE.set(fullUrl, { data: resolved, expiresAt: Date.now() + RESOLVER_TTL_MS });
        return resolved;
      }
    }
  } catch (e) {
    console.warn('Toonworld redirect resolve warning:', e.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// 2. SOURCE: Dynamic Movies4u (movies4u.nf / movies4u.bot) (Movies & Series)
// ---------------------------------------------------------------------------
async function fetchMovies4uSearch(query) {
  try {
    const activeBase = await getActiveMovies4uBase();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${activeBase}/lookup.php?q=${encodeURIComponent(query)}`, {
      headers: { ...COMMON_HEADERS, 'Referer': `${activeBase}/` },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.hits)) return [];

    return data.hits.map(hit => {
      // Extract clean slug from permalink (handles both absolute and relative URLs)
      let slug = '';
      if (hit.permalink) {
        slug = hit.permalink.replace(/^https?:\/\/[^\/]+/i, '').replace(/^\/+|\/+$/g, '');
      }
      if (!slug && hit.id) {
        slug = String(hit.id);
      }

      const title = cleanTitle(hit.post_title);
      const cat = detectCategory(title, 'Movies4u');
      const permalink = hit.permalink
        ? (hit.permalink.startsWith('http') ? hit.permalink : `${activeBase}/${hit.permalink.replace(/^\/+/, '')}`)
        : `${activeBase}/?p=${hit.id}`;

      return {
        id: `m4u_${slug || hit.id}`,
        slug: slug || String(hit.id),
        permalink,
        title,
        thumbnail: hit.post_thumbnail || '',
        views: '2.5k views',
        source: 'Movies4u',
        category: cat,
        quality: hit.movie_quality || '1080p | 720p | 480p'
      };
    });
  } catch (err) {
    console.warn('Movies4u search warning:', err.message);
    return [];
  }
}

async function fetchMovies4uHome(page = 1) {
  try {
    let activeBase = await getActiveMovies4uBase();
    let res = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const targetUrl = page > 1 ? `${activeBase}/page/${page}/` : `${activeBase}/`;
      res = await fetch(targetUrl, {
        headers: { ...COMMON_HEADERS, 'Referer': `${activeBase}/` },
        signal: controller.signal
      });
      clearTimeout(timeout);
    } catch (_) {
      if (activeBase !== 'https://movies4u.nf') {
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), 4000);
        res = await fetch(page > 1 ? `https://movies4u.nf/page/${page}/` : `https://movies4u.nf/`, {
          headers: { ...COMMON_HEADERS, 'Referer': 'https://movies4u.nf/' },
          signal: controller2.signal
        }).catch(() => null);
        clearTimeout(timeout2);
        if (res && res.ok) activeBase = 'https://movies4u.nf';
      }
    }

    if (!res || !res.ok) return [];
    const html = await res.text();
    const articles = [...html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi)];
    const items = [];

    articles.forEach((art, idx) => {
      const artHtml = art[1];
      const linkMatch = artHtml.match(/<a\s+[^>]*href=["'](https?:\/\/(?:new[12]\.movies4u\.garden|[^"']*movies4u[^"']*)\/[^"']+)["']/i) ||
        artHtml.match(/<a\s+[^>]*href=["'](\/[^"']+)["']/i);
      if (!linkMatch) return;

      let permalink = linkMatch[1];
      if (permalink.startsWith('/')) permalink = `${MOVIES4U_BASE}${permalink}`;
      let slug = '';
      try {
        const u = new URL(permalink);
        slug = u.pathname.replace(/^\/|\/$/g, '');
      } catch (e) {
        slug = permalink.replace(/^https?:\/\/[^\/]+\/|\/$/g, '');
      }

      // Title & Quality from aria-label or h2
      const ariaMatch = artHtml.match(/aria-label=["']([^"']+)["']/i);
      const h2Match = artHtml.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i);
      let title = ariaMatch ? ariaMatch[1] : (h2Match ? h2Match[1] : slug);
      title = cleanTitle(title);

      // Quality
      let quality = '1080p | 720p | 480p';
      const qMatch = title.match(/(480p\s*\|\s*720p\s*\|\s*1080p|1080p|720p|480p|HDRip|PreDvD|HQ-HDTC)/i);
      if (qMatch) {
        quality = qMatch[1];
      }

      // Image
      const imgMatch = artHtml.match(/src=["']([^"']+)["']/i);
      let thumbnail = imgMatch ? imgMatch[1] : '';

      const cat = detectCategory(title, 'Movies4u');
      items.push({
        id: `m4u_${slug || idx}`,
        slug,
        permalink,
        title,
        thumbnail,
        views: `${(Math.floor(Math.random() * 20) + 10) / 10}k views`,
        source: 'Movies4u',
        category: cat,
        quality
      });
    });

    return items;
  } catch (err) {
    console.warn('Movies4u home warning:', err.message);
    return [];
  }
}

/**
 * Scrapes specific category archives from Movies4u (e.g. bollywood-movies, hollywood-movies, south-hindi-movies, korean)
 */
async function fetchMovies4uCategory(categorySlug, page = 1) {
  try {
    let activeBase = await getActiveMovies4uBase();
    const targetUrl = page > 1 ? `${activeBase}/category/${categorySlug}/page/${page}/` : `${activeBase}/category/${categorySlug}/`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(targetUrl, {
      headers: { ...COMMON_HEADERS, 'Referer': `${activeBase}/` },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res || !res.ok) return [];
    const html = await res.text();
    const articles = [...html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi)];
    const items = [];

    articles.forEach((art, idx) => {
      const artHtml = art[1];
      const linkMatch = artHtml.match(/<a\s+[^>]*href=["'](https?:\/\/(?:new[123]\.movies4u\.garden|[^"']*movies4u[^"']*)\/[^"']+)["']/i) ||
        artHtml.match(/<a\s+[^>]*href=["'](\/[^"']+)["']/i);
      if (!linkMatch) return;

      let permalink = linkMatch[1];
      if (permalink.startsWith('/')) permalink = `${MOVIES4U_BASE}${permalink}`;
      let slug = '';
      try {
        const u = new URL(permalink);
        slug = u.pathname.replace(/^\/|\/$/g, '');
      } catch (e) {
        slug = permalink.replace(/^https?:\/\/[^\/]+\/|\/$/g, '');
      }

      const ariaMatch = artHtml.match(/aria-label=["']([^"']+)["']/i);
      const h2Match = artHtml.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i);
      let title = ariaMatch ? ariaMatch[1] : (h2Match ? h2Match[1] : slug);
      title = cleanTitle(title);

      let quality = '1080p | 720p | 480p';
      const qMatch = title.match(/(480p\s*\|\s*720p\s*\|\s*1080p|1080p|720p|480p|HDRip|PreDvD|HQ-HDTC|WEB-DL|BluRay)/i);
      if (qMatch) {
        quality = qMatch[1];
      }

      const imgMatch = artHtml.match(/src=["']([^"']+)["']/i);
      let thumbnail = imgMatch ? imgMatch[1] : '';

      // Determine human-friendly category label
      let cat = 'Movies';
      if (categorySlug.includes('bollywood')) cat = 'Bollywood';
      else if (categorySlug.includes('hollywood')) cat = 'Hollywood';
      else if (categorySlug.includes('south')) cat = 'South Movies';
      else if (categorySlug.includes('korean')) cat = 'Korean';
      else if (categorySlug.includes('web-series')) cat = 'Web Series';

      items.push({
        id: `m4u_${slug || idx}`,
        slug,
        permalink,
        title,
        thumbnail,
        views: `${(Math.floor(Math.random() * 20) + 12) / 10}k views`,
        source: 'Movies4u',
        category: cat,
        quality
      });
    });

    return items;
  } catch (err) {
    console.warn(`Movies4u category ${categorySlug} warning:`, err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 3. SOURCE: HDHub4u Dynamic Mirror (Resolved from https://hdhub4u.kg/)
// ---------------------------------------------------------------------------
async function fetchHdwallSearch(query) {
  if (!query) return [];
  const items = [];
  const activeBase = await getActiveHdhubBase();

  // 1. Typesense Search on pingora.fyi (primary search engine for new8.hdhub4u.cl)
  try {
    const apiUrl = new URL('https://search.pingora.fyi/collections/post/documents/search');
    apiUrl.searchParams.append('q', query);
    apiUrl.searchParams.append('query_by', 'post_title,category,stars,director,imdb_id');
    apiUrl.searchParams.append('query_by_weights', '4,2,2,2,4');
    apiUrl.searchParams.append('sort_by', 'sort_by_date:desc');
    apiUrl.searchParams.append('limit', 25);
    apiUrl.searchParams.append('highlight_fields', 'none');
    apiUrl.searchParams.append('use_cache', 'true');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(apiUrl.toString(), {
      headers: {
        'User-Agent': COMMON_HEADERS['User-Agent'],
        'Referer': `${activeBase}/search.html?q=${encodeURIComponent(query)}`,
        'Origin': activeBase,
        'Accept': 'application/json, text/plain, */*'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.hits)) {
        for (const h of data.hits) {
          const doc = h.document;
          const cleanSlug = doc.permalink ? doc.permalink.replace(/^https?:\/\/[^\/]+\/|\/$/g, '') : '';
          const cleanT = (doc.post_title || '').replace(/<[^>]+>/g, '').trim();
          let quality = '1080p | 720p | 480p';
          const qMatch = cleanT.match(/(480p|720p|1080p|2160p|4k|PreDvD|HEVC|HDRip|BluRay)/i);
          if (qMatch) quality = qMatch[1];

          items.push({
            id: `hdwall_${cleanSlug.replace(/\.html$/, '')}`,
            slug: cleanSlug,
            permalink: doc.permalink || `${activeBase}/${cleanSlug}`,
            title: cleanT,
            thumbnail: doc.featured_image || '',
            views: `${(Math.floor(Math.random() * 30) + 15) / 10}k views`,
            source: 'HDWall',
            category: detectCategory(cleanT, 'HDWall'),
            quality
          });
        }
      }
    }
  } catch (e) {
    console.warn('HDHub Typesense search warning:', e.message);
  }

  // 2. HDTVB DLE Search (guarantees coverage from https://hdtvb.net/)
  try {
    const searchUrl = `https://hdtvb.net/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(searchUrl, {
      headers: {
        ...COMMON_HEADERS,
        'Referer': 'https://hdtvb.net/'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const thumbs = [...html.matchAll(/<li\s+class=["'][^"']*thumb[^"']*["']>([\s\S]*?)<\/li>/gi)];
      thumbs.forEach(t => {
        const tHtml = t[1];
        const linkMatch = tHtml.match(/<a\s+[^>]*href=["'](https?:\/\/[^"']+\/[^"']+\.html)["']/i) ||
          tHtml.match(/<a\s+[^>]*href=["'](\/[^"']+\.html)["']/i);
        if (!linkMatch) return;
        let permalink = linkMatch[1];
        if (permalink.startsWith('/')) permalink = `https://hdtvb.net${permalink}`;
        const slug = permalink.replace(/^https?:\/\/[^\/]+\/|\/$/g, '');

        const figMatch = tHtml.match(/<figcaption>[\s\S]*?<p>([\s\S]*?)<\/p>/i) ||
          tHtml.match(/alt=["']([^"']+)["']/i);
        const title = figMatch ? cleanTitle(figMatch[1]) : slug;

        const imgMatch = tHtml.match(/src=["']([^"']+)["']/i);
        let thumbnail = imgMatch ? imgMatch[1] : '';
        if (thumbnail.startsWith('/')) thumbnail = `https://hdtvb.net${thumbnail}`;

        let quality = '1080p | 720p | 480p';
        const qMatch = title.match(/(480p|720p|1080p|2160p|4k|PreDvD|HEVC|HDRip|BluRay)/i);
        if (qMatch) quality = qMatch[1];

        if (!items.some(i => i.slug === slug || i.title.toLowerCase() === title.toLowerCase())) {
          items.push({
            id: `hdwall_${slug.replace(/\.html$/, '')}`,
            slug,
            permalink,
            title,
            thumbnail,
            views: `${(Math.floor(Math.random() * 30) + 15) / 10}k views`,
            source: 'HDWall',
            category: detectCategory(title, 'HDWall'),
            quality
          });
        }
      });
    }
  } catch (e) {
    console.warn('HDTVB DLE search warning:', e.message);
  }

  // 3. Fallback for Similar Multi-word queries: if low results, search primary keyword token
  if (items.length < 3 && query.includes(' ')) {
    const qTokens = query.split(/\s+/).filter(w => w.length > 2 && !['movie', 'series', 'download', 'hindi', 'full', 'watch'].includes(w.toLowerCase()));
    if (qTokens.length > 0) {
      try {
        const fallbackUrl = new URL('https://search.pingora.fyi/collections/post/documents/search');
        fallbackUrl.searchParams.append('q', qTokens[0]);
        fallbackUrl.searchParams.append('query_by', 'post_title,category,stars');
        fallbackUrl.searchParams.append('limit', 15);
        fallbackUrl.searchParams.append('highlight_fields', 'none');

        const fRes = await fetch(fallbackUrl.toString(), {
          headers: {
            'User-Agent': COMMON_HEADERS['User-Agent'],
            'Referer': `${activeBase}/search.html?q=${encodeURIComponent(qTokens[0])}`,
            'Origin': activeBase
          }
        });
        if (fRes.ok) {
          const fData = await fRes.json();
          if (fData && Array.isArray(fData.hits)) {
            for (const h of fData.hits) {
              const doc = h.document;
              const cleanSlug = doc.permalink ? doc.permalink.replace(/^https?:\/\/[^\/]+\/|\/$/g, '') : '';
              const cleanT = (doc.post_title || '').replace(/<[^>]+>/g, '').trim();
              if (!items.some(i => i.slug === cleanSlug || i.title.toLowerCase() === cleanT.toLowerCase())) {
                items.push({
                  id: `hdwall_${cleanSlug.replace(/\.html$/, '')}`,
                  slug: cleanSlug,
                  permalink: doc.permalink || `${activeBase}/${cleanSlug}`,
                  title: cleanT,
                  thumbnail: doc.featured_image || '',
                  views: '2.5k views',
                  source: 'HDWall',
                  category: detectCategory(cleanT, 'HDWall'),
                  quality: '1080p | 720p | 480p'
                });
              }
            }
          }
        }
      } catch (fe) { }
    }
  }

  return items;
}

async function fetchHdwallHome(page = 1) {
  try {
    const activeBase = await getActiveHdhubBase();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const targetUrl = page > 1 ? `${activeBase}/page/${page}/` : `${activeBase}/`;
    const res = await fetch(targetUrl, {
      headers: { ...COMMON_HEADERS, 'Referer': `${activeBase}/` },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const html = await res.text();
    return parseHdwallHtml(html, activeBase);
  } catch (err) {
    console.warn('HDWall home warning:', err.message);
    return [];
  }
}

function parseHdwallHtml(html, activeBase = null) {
  const base = activeBase || dynamicHdhubBase || 'https://new8.hdhub4u.cl';
  const items = [];
  const thumbs = [...html.matchAll(/<li\s+class=["'][^"']*thumb[^"']*["']>([\s\S]*?)<\/li>/gi)];

  thumbs.forEach((t, idx) => {
    const tHtml = t[1];
    const linkMatch = tHtml.match(/<a\s+[^>]*href=["'](https?:\/\/(?:hdtvb\.net|hdwall\.xyz|hdhubs\.xyz|[^"']*hdhub4u[^"']*)[^"']*\.html)["']/i) ||
      tHtml.match(/<a\s+[^>]*href=["'](\/[^"']+\.html)["']/i) ||
      tHtml.match(/<a\s+[^>]*href=["'](https?:\/\/[^"']+\/[^"']+\.html)["']/i);
    if (!linkMatch) return;

    let permalink = linkMatch[1];
    if (permalink.startsWith('/')) permalink = `${base}${permalink}`;
    let slug = '';
    try {
      const u = new URL(permalink);
      slug = u.pathname.replace(/^\/|\/$/g, '');
    } catch (e) {
      slug = permalink.replace(/^https?:\/\/[^\/]+\/|\/$/g, '');
    }

    const imgMatch = tHtml.match(/src=["']([^"']+)["']/i);
    let thumbnail = imgMatch ? imgMatch[1] : '';
    if (thumbnail.startsWith('/')) {
      thumbnail = `${base}${thumbnail}`;
    }

    const figMatch = tHtml.match(/<figcaption>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/figcaption>/i) ||
      tHtml.match(/alt=["']([^"']+)["']/i) ||
      tHtml.match(/title=["']([^"']+)["']/i);
    let title = figMatch ? figMatch[1] : slug;
    title = cleanTitle(title);

    let quality = '1080p | 720p | 480p';
    const qMatch = title.match(/(480p|720p|1080p|2160p|4k|PreDvD|HEVC|HDRip|BluRay)/i);
    if (qMatch) {
      quality = qMatch[1];
    }

    const cat = detectCategory(title, 'HDWall');
    items.push({
      id: `hdwall_${slug.replace(/\.html$/, '')}`,
      slug,
      permalink,
      title,
      thumbnail,
      views: `${(Math.floor(Math.random() * 30) + 15) / 10}k views`,
      source: 'HDWall',
      category: cat,
      quality
    });
  });

  return items;
}


// ---------------------------------------------------------------------------
// 4. API: Unified Content Aggregation Endpoint (Homepage)
// ---------------------------------------------------------------------------
app.get('/api/content', async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const categoryFilter = (req.query.category || 'all').toLowerCase();

  try {
    let allItems = [];
    let pagination = {
      currentPage: page,
      totalPages: 33,
      hasNext: true,
      hasPrev: page > 1,
      pages: [1, 2, 3, 4, 5, 33]
    };

    if (categoryFilter === 'anime') {
      const animeData = await fetchToonworldAnimeCatalog(page);
      allItems = animeData.items;
      pagination = animeData.pagination;
    } else if (categoryFilter === 'mini_drama' || categoryFilter === 'mini drama' || categoryFilter === 'mini-drama' || categoryFilter === 'dramas') {
      // Dynamic real-time scraping of m.microtv.st for Mini Drama
      const microTvUrl = page > 1 ? `${MICROTV_BASE}/?page=${page}` : `${MICROTV_BASE}/`;
      const html = await fetchMicroTvHtml(microTvUrl);
      if (html) {
        allItems = parseMicroTvCards(html);
        pagination = parsePagination(html, page);
        if (allItems.length > 0) {
          MICROTV_PAGES_CATALOG[String(page)] = allItems;
        }
      }

      // Cloud deployment fallback (Render / Vercel Cloudflare challenge resilience)
      if (allItems.length === 0 && (MICROTV_PAGES_CATALOG[String(page)] || MICROTV_SEED_CATALOG.length > 0)) {
        const pageKey = String(page);
        if (MICROTV_PAGES_CATALOG[pageKey]) {
          allItems = MICROTV_PAGES_CATALOG[pageKey];
        } else {
          const pageSize = 50;
          const start = (page - 1) * pageSize;
          allItems = MICROTV_SEED_CATALOG.slice(start, start + pageSize);
        }

        const totalPages = Math.max(35, Object.keys(MICROTV_PAGES_CATALOG).length, Math.ceil(MICROTV_SEED_CATALOG.length / 50));
        const curPage = Math.min(Math.max(1, page), totalPages);

        const pageNumbers = new Set();
        pageNumbers.add(curPage);
        for (let i = 1; i <= Math.min(totalPages, 5); i++) pageNumbers.add(i);
        if (curPage > 1) pageNumbers.add(curPage - 1);
        if (curPage < totalPages) pageNumbers.add(curPage + 1);
        pageNumbers.add(totalPages);

        pagination = {
          currentPage: curPage,
          totalPages: totalPages,
          hasNext: curPage < totalPages,
          hasPrev: curPage > 1,
          pages: Array.from(pageNumbers).sort((a, b) => a - b)
        };
      }
    } else if (categoryFilter === 'movies' || categoryFilter === 'bollywood' || categoryFilter === 'hollywood' || categoryFilter === 'south' || categoryFilter === 'south_movies' || categoryFilter === 'korean' || categoryFilter === 'korean_movies' || categoryFilter === 'web_series' || categoryFilter === 'new_releases') {
      const genre = (req.query.genre || (categoryFilter !== 'movies' ? categoryFilter : 'all')).toLowerCase();

      if (genre === 'bollywood') {
        allItems = await fetchMovies4uCategory('bollywood-movies', page);
      } else if (genre === 'hollywood') {
        allItems = await fetchMovies4uCategory('hollywood-movies', page);
      } else if (genre === 'south' || genre === 'south_movies') {
        allItems = await fetchMovies4uCategory('south-hindi-movies', page);
      } else if (genre === 'korean' || genre === 'korean_movies') {
        allItems = await fetchMovies4uCategory('korean', page);
      } else if (genre === 'web_series') {
        allItems = await fetchMovies4uCategory('web-series', page);
      } else {
        // All Movies / New Releases: Aggregate from Movies4u Home and HDWall Home
        const [m4uItems, hdwallItems] = await Promise.allSettled([
          fetchMovies4uHome(page),
          fetchHdwallHome(page)
        ]);
        const m4uList = (m4uItems.status === 'fulfilled' ? m4uItems.value : []).filter(i => i.category === 'Movies');
        const hdList = (hdwallItems.status === 'fulfilled' ? hdwallItems.value : []).filter(i => i.category === 'Movies');
        const maxLen = Math.max(m4uList.length, hdList.length);
        for (let i = 0; i < maxLen; i++) {
          if (i < m4uList.length) allItems.push(m4uList[i]);
          if (i < hdList.length) allItems.push(hdList[i]);
        }
      }

      // Deduplicate items
      const seenIds = new Set();
      allItems = allItems.filter(item => {
        if (!item || !item.id || seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      });

      pagination = {
        currentPage: page,
        totalPages: 30,
        hasNext: page < 30,
        hasPrev: page > 1,
        pages: [1, 2, 3, 4, 5, 30]
      };
    } else if (categoryFilter === 'tv_shows' || categoryFilter === 'tv shows') {
      // Dynamic aggregation for TV Shows from Movies4u and HDWall
      const [m4uItems, hdwallItems] = await Promise.allSettled([
        fetchMovies4uHome(page),
        fetchHdwallHome(page)
      ]);
      const m4uList = (m4uItems.status === 'fulfilled' ? m4uItems.value : []).filter(i => i.category === 'TV Shows' || i.category === 'Web Series');
      const hdList = (hdwallItems.status === 'fulfilled' ? hdwallItems.value : []).filter(i => i.category === 'TV Shows' || i.category === 'Web Series');
      const maxLen = Math.max(m4uList.length, hdList.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < m4uList.length) allItems.push(m4uList[i]);
        if (i < hdList.length) allItems.push(hdList[i]);
      }
      pagination = {
        currentPage: page,
        totalPages: 30,
        hasNext: page < 30,
        hasPrev: page > 1,
        pages: [1, 2, 3, 4, 5, 30]
      };
    } else if (categoryFilter === 'web_series' || categoryFilter === 'web series') {
      // Dynamic aggregation for Web Series from Movies4u and HDWall
      const [m4uItems, hdwallItems] = await Promise.allSettled([
        fetchMovies4uHome(page),
        fetchHdwallHome(page)
      ]);
      const m4uList = (m4uItems.status === 'fulfilled' ? m4uItems.value : []).filter(i => i.category === 'Web Series' || i.category === 'TV Shows');
      const hdList = (hdwallItems.status === 'fulfilled' ? hdwallItems.value : []).filter(i => i.category === 'Web Series' || i.category === 'TV Shows');
      const maxLen = Math.max(m4uList.length, hdList.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < m4uList.length) allItems.push(m4uList[i]);
        if (i < hdList.length) allItems.push(hdList[i]);
      }
      pagination = {
        currentPage: page,
        totalPages: 30,
        hasNext: page < 30,
        hasPrev: page > 1,
        pages: [1, 2, 3, 4, 5, 30]
      };
    } else {
      // Default: Interleaved Aggregation across MicroTV, Movies4u, HDWall & ToonWorld (Anime)
      const microTvUrl = page > 1 ? `${MICROTV_BASE}/?page=${page}` : `${MICROTV_BASE}/`;
      const [microHtml, m4uItems, hdwallItems, animeData] = await Promise.allSettled([
        fetchMicroTvHtml(microTvUrl),
        fetchMovies4uHome(page),
        fetchHdwallHome(page),
        fetchToonworldAnimeCatalog(page)
      ]);

      let microItems = [];
      if (microHtml.status === 'fulfilled' && microHtml.value) {
        microItems = parseMicroTvCards(microHtml.value);
        pagination = parsePagination(microHtml.value, page);
      }

      // Cloud deployment fallback: Ensure Mini Drama appears on homepage even if live scrape returns 0 on Render
      if (microItems.length === 0 && MICROTV_SEED_CATALOG.length > 0) {
        const pageSize = 8;
        const offset = ((page - 1) * pageSize) % MICROTV_SEED_CATALOG.length;
        microItems = MICROTV_SEED_CATALOG.slice(offset, offset + pageSize);
        if (microItems.length < pageSize) {
          microItems = microItems.concat(MICROTV_SEED_CATALOG.slice(0, pageSize - microItems.length));
        }
      }

      const m4uList = m4uItems.status === 'fulfilled' ? m4uItems.value : [];
      const hdList = hdwallItems.status === 'fulfilled' ? hdwallItems.value : [];
      const animeList = (animeData.status === 'fulfilled' && animeData.value?.items) ? animeData.value.items : [];

      const maxLen = Math.max(microItems.length, m4uList.length, hdList.length, animeList.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < microItems.length) allItems.push(microItems[i]);
        if (i < m4uList.length) allItems.push(m4uList[i]);
        if (i < hdList.length) allItems.push(hdList[i]);
        if (i < animeList.length) allItems.push(animeList[i]);
      }
    }

    res.json({
      success: true,
      page,
      count: allItems.length,
      category: categoryFilter,
      pagination,
      items: allItems
    });
  } catch (err) {
    console.error('Error fetching aggregated content:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch content from sources',
      message: err.message
    });
  }
});

// ---------------------------------------------------------------------------
// 4b. API: Categorized Movie Sections (New Releases, Bollywood, Hollywood, South, Korean)
// ---------------------------------------------------------------------------
app.get('/api/movies/sections', async (req, res) => {
  try {
    const [newReleasesRes, bollyRes, hollyRes, southRes, koreanRes] = await Promise.allSettled([
      fetchMovies4uHome(1),
      fetchMovies4uCategory('bollywood-movies', 1),
      fetchMovies4uCategory('hollywood-movies', 1),
      fetchMovies4uCategory('south-hindi-movies', 1),
      fetchMovies4uCategory('korean', 1)
    ]);

    const newReleases = (newReleasesRes.status === 'fulfilled' ? newReleasesRes.value : []).slice(0, 12);
    const bollywood = (bollyRes.status === 'fulfilled' ? bollyRes.value : []).slice(0, 12);
    const hollywood = (hollyRes.status === 'fulfilled' ? hollyRes.value : []).slice(0, 12);
    const south = (southRes.status === 'fulfilled' ? southRes.value : []).slice(0, 12);
    const korean = (koreanRes.status === 'fulfilled' ? koreanRes.value : []).slice(0, 12);

    res.json({
      success: true,
      sections: [
        {
          id: 'new_releases',
          title: 'New Releases',
          subtitle: 'Latest 2026 Blockbusters & Digital Premieres',
          icon: 'fa-bolt',
          badge: 'Latest 2026',
          items: newReleases
        },
        {
          id: 'bollywood',
          title: 'Bollywood Movies',
          subtitle: 'Top Hindi Cinema, HDTC & Original Releases',
          icon: 'fa-clapperboard',
          badge: 'Hindi Cinema',
          items: bollywood
        },
        {
          id: 'hollywood',
          title: 'Hollywood & Dual Audio',
          subtitle: 'English Master Hits with Clear Hindi Dual Audio',
          icon: 'fa-film',
          badge: 'English + Hindi',
          items: hollywood
        },
        {
          id: 'south_movies',
          title: 'South Indian Movies',
          subtitle: 'Tamil, Telugu, Malayalam & Kannada in Multi-Audio Hindi',
          icon: 'fa-fire-flame-curved',
          badge: 'Hindi Dubbed',
          items: south
        },
        {
          id: 'korean_movies',
          title: 'Korean & Asian Cinema',
          subtitle: 'K-Drama Highlights, Thrillers & Asian Features',
          icon: 'fa-masks-theater',
          badge: 'K-Cinema & Dramas',
          items: korean
        }
      ]
    });
  } catch (err) {
    console.error('Error fetching movie sections:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 5. API: Multi-Source Search Endpoint (Parallel query across all 3 domains)
// ---------------------------------------------------------------------------
app.get('/api/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  const categoryFilter = (req.query.category || 'all').toLowerCase();
  const page = parseInt(req.query.page, 10) || 1;
  const noDrama = req.query.type === 'movies' || req.query.no_drama === '1' || req.query.exclude_minidrama === 'true' || categoryFilter === 'movies' || categoryFilter === 'bollywood' || categoryFilter === 'hollywood' || categoryFilter === 'south' || categoryFilter === 'korean';

  if (!query) {
    return res.json({
      success: true,
      items: [],
      pagination: { currentPage: 1, totalPages: 1, pages: [1], hasNext: false, hasPrev: false }
    });
  }

  try {
    // 1. Query MicroTV search (skipped if movie search requested)
    const microTvPromise = noDrama ? Promise.resolve([]) : (async () => {
      try {
        const searchUrl = page > 1
          ? `${MICROTV_BASE}/?search=${encodeURIComponent(query)}&page=${page}`
          : `${MICROTV_BASE}/?search=${encodeURIComponent(query)}`;
        const html = await fetchMicroTvHtml(searchUrl);
        let items = html ? parseMicroTvCards(html) : [];
        if (items.length === 0 && MICROTV_SEED_CATALOG.length > 0) {
          const q = query.toLowerCase();
          items = MICROTV_SEED_CATALOG.filter(it => it.title.toLowerCase().includes(q) || it.slug.toLowerCase().includes(q));
        }
        return items;
      } catch (e) {
        if (MICROTV_SEED_CATALOG.length > 0) {
          const q = query.toLowerCase();
          return MICROTV_SEED_CATALOG.filter(it => it.title.toLowerCase().includes(q) || it.slug.toLowerCase().includes(q));
        }
        return [];
      }
    })();

    // 2. Query Movies4u internal JSON lookup
    const m4uPromise = fetchMovies4uSearch(query);

    // 3. Query HDWall / HDHub mirror search
    const hdwallPromise = fetchHdwallSearch(query);

    // 4. Query Filmyzilla sitemap index search
    const filmyzillaPromise = fetchFilmyzillaSearch(query);

    // 5. Query ToonWorld Anime search
    const toonworldPromise = fetchToonworldSearch(query);

    // Run all 5 queries concurrently
    const [microRes, m4uRes, hdwallRes, filmyRes, toonRes] = await Promise.allSettled([
      microTvPromise,
      m4uPromise,
      hdwallPromise,
      filmyzillaPromise,
      toonworldPromise
    ]);

    let microResults = (!noDrama && microRes.status === 'fulfilled') ? microRes.value : [];
    const m4uResults = m4uRes.status === 'fulfilled' ? m4uRes.value : [];
    const hdwallResults = hdwallRes.status === 'fulfilled' ? hdwallRes.value : [];
    const filmyResults = filmyRes.status === 'fulfilled' ? filmyRes.value : [];
    const toonResults = toonRes.status === 'fulfilled' ? toonRes.value : [];

    console.log(`Search "${query}" counts: MicroTV=${microResults.length}, Movies4u=${m4uResults.length}, HDWall=${hdwallResults.length}, Filmyzilla=${filmyResults.length}, ToonWorld=${toonResults.length}`);

    // Aggregate results from all 5 sources
    let combined = [];
    const maxLen = Math.max(microResults.length, m4uResults.length, hdwallResults.length, filmyResults.length, toonResults.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < microResults.length) combined.push(microResults[i]);
      if (i < m4uResults.length) combined.push(m4uResults[i]);
      if (i < hdwallResults.length) combined.push(hdwallResults[i]);
      if (i < filmyResults.length) combined.push(filmyResults[i]);
      if (i < toonResults.length) combined.push(toonResults[i]);
    }

    // Apply category filtering if requested
    if (categoryFilter === 'anime') {
      combined = combined.filter(i => i.category === 'Anime');
    } else if (categoryFilter === 'mini_drama' || categoryFilter === 'mini drama' || categoryFilter === 'dramas') {
      combined = combined.filter(i => i.category === 'Mini Drama');
    } else if (categoryFilter === 'movies') {
      combined = combined.filter(i => i.category === 'Movies');
    } else if (categoryFilter === 'tv_shows' || categoryFilter === 'tv shows') {
      combined = combined.filter(i => i.category === 'TV Shows' || i.category === 'Web Series');
    } else if (categoryFilter === 'web_series' || categoryFilter === 'web series') {
      combined = combined.filter(i => i.category === 'Web Series' || i.category === 'TV Shows');
    }

    res.json({
      success: true,
      query,
      count: combined.length,
      category: categoryFilter,
      sources: {
        microtv: microResults.length,
        movies4u: m4uResults.length,
        hdwall: hdwallResults.length,
        filmyzilla: filmyResults.length,
        toonworld: toonResults.length
      },
      pagination: {
        currentPage: page,
        totalPages: 1,
        pages: [1],
        hasNext: false,
        hasPrev: false
      },
      items: combined
    });
  } catch (err) {
    console.error('Error performing multi-source search:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to query search from source servers',
      message: err.message
    });
  }
});

// ---------------------------------------------------------------------------
// 6. API: Post Detail Endpoint (Universal for MicroTV, Movies4u, and HDWall)
// ---------------------------------------------------------------------------
app.get('/api/post', async (req, res) => {
  let slug = (req.query.slug || req.query.id || '').trim();
  let source = (req.query.source || '').trim();

  // If slug has source prefix (e.g. microtv_..., m4u_..., hdwall_..., filmyzilla_...)
  if (slug.startsWith('microtv_')) {
    source = 'MicroTV';
    slug = slug.replace(/^microtv_/, '');
  } else if (slug.startsWith('m4u_')) {
    source = 'Movies4u';
    slug = slug.replace(/^m4u_/, '');
  } else if (slug.startsWith('hdwall_')) {
    source = 'HDWall';
    slug = slug.replace(/^hdwall_/, '');
  } else if (slug.startsWith('filmyzilla_')) {
    source = 'Filmyzilla';
    slug = slug.replace(/^filmyzilla_/, '');
  } else if (slug.startsWith('toonworld_')) {
    source = 'ToonWorld4All';
    slug = slug.replace(/^toonworld_/, '');
  }

  if (!source) {
    if (req.query.url && (req.query.url.includes('toonworld') || req.query.url.includes('archive.toonworld4all'))) source = 'ToonWorld4All';
    else if (req.query.url && req.query.url.includes('filmyzilla')) source = 'Filmyzilla';
    else if (slug.endsWith('.html')) source = 'HDWall';
    else if (slug.includes('drishyam') || slug.includes('movie') || slug.includes('series')) source = 'Movies4u';
    else source = 'MicroTV';
  }

  try {
    if (source === 'ToonWorld4All') {
      // ---------------- ToonWorld4All Anime Detail Handler ----------------
      const cleanSlug = slug.replace(/^\/+|\/+$/g, '').replace(/^toonworld_/, '');
      const postUrl = `${TOONWORLD_BASE}/${cleanSlug}/`;

      let postHtml = null;
      try {
        const pRes = await fetch(postUrl, {
          headers: { ...COMMON_HEADERS, 'Referer': `${TOONWORLD_BASE}/` },
          signal: AbortSignal.timeout(7000)
        });
        if (pRes.ok) {
          postHtml = await pRes.text();
        }
      } catch (e) {
        console.warn(`[ToonWorld] Post fetch error for ${cleanSlug}:`, e.message);
      }

      // Title & Poster
      let title = cleanSlug.replace(/[-_]+/g, ' ');
      let poster = '';

      if (postHtml) {
        const hTitleMatch = postHtml.match(/<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
          postHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
          postHtml.match(/<title>([\s\S]*?)<\/title>/i);
        if (hTitleMatch) {
          title = cleanTitle(hTitleMatch[1]);
        }
        const ogImgMatch = postHtml.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i) ||
          postHtml.match(/<img[^>]+src=["']([^"']*iili\.io[^"']+)["']/i) ||
          postHtml.match(/<div class=["']entry-content[^"']*["']>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
        if (ogImgMatch) {
          poster = ogImgMatch[1];
        }
      }

      // Fallback poster/title from seed catalog if needed
      if (!poster || !title) {
        const seedItem = ANIME_SEED_CATALOG.find(it => it.slug === cleanSlug || it.id === `toonworld_${cleanSlug}`);
        if (seedItem) {
          if (!poster) poster = seedItem.thumbnail;
          if (!title || title === cleanSlug) title = seedItem.title;
        }
      }

      // Extract all episodes from postHtml
      const episodes = [];
      if (postHtml) {
        const epRegex = /<a[^>]+href=["'](https?:\/\/archive\.toonworld4all\.me\/(?:episode|movie)\/([^\/'"]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
        let epMatch;
        let epCount = 0;
        const seenHashes = new Set();
        while ((epMatch = epRegex.exec(postHtml)) !== null) {
          const epUrl = epMatch[1];
          const epHash = epMatch[2];
          if (seenHashes.has(epHash)) continue;
          seenHashes.add(epHash);
          epCount++;
          episodes.push({
            episodeNumber: epCount,
            title: `Episode ${epCount}`,
            url: epUrl,
            hash: epHash
          });
        }
      }

      // Determine active episode URL
      let activeEpUrl = (req.query.episodeUrl || '').trim();
      let currentEpisodeIndex = 0;

      if (activeEpUrl && episodes.length > 0) {
        const idx = episodes.findIndex(ep => ep.url === activeEpUrl || ep.hash === activeEpUrl);
        if (idx !== -1) {
          currentEpisodeIndex = idx;
          activeEpUrl = episodes[idx].url;
        }
      }

      if (!activeEpUrl && episodes.length > 0) {
        activeEpUrl = episodes[0].url;
        currentEpisodeIndex = 0;
      }

      const qualities = [];
      let directStreamUrl = null;
      let embedUrl = null;

      if (activeEpUrl) {
        try {
          const epRes = await fetch(activeEpUrl, {
            headers: { ...COMMON_HEADERS, 'Referer': postUrl },
            signal: AbortSignal.timeout(7000)
          });
          if (epRes.ok) {
            const epHtml = await epRes.text();
            const propsMatch = epHtml.match(/window\.__PROPS__\s*=\s*({[\s\S]*?});/);
            if (propsMatch) {
              const props = JSON.parse(propsMatch[1]);
              const rawEncodes = props.data?.data?.encodes || [];

              // USER REQUIREMENT: Show ONLY three qualities: 480p, 720p, 1080p
              const targetQualities = ['480p', '720p', '1080p'];
              for (const q of targetQualities) {
                // Find best encode matching resolution
                const encode = rawEncodes.find(e => (e.resolution || '').toLowerCase() === q || (e.resolution || '').toLowerCase().includes(q));
                if (!encode) continue;

                const files = encode.files || [];
                // USER REQUIREMENT: 3 downloading host URLs:
                // HubCloud (hubcloud.ist), Filepress (new2.filepress.lat), GDFlix (gdflix.dev)
                const hubFile = files.find(f => (f.host || '').toLowerCase().includes('hubcloud') || (f.short || '').includes('hubcloud'));
                const filepressFile = files.find(f => (f.host || '').toLowerCase().includes('filepress') || (f.short || '').includes('filepress'));
                const gdflixFile = files.find(f => (f.host || '').toLowerCase().includes('gdflix') || (f.short || '').includes('gdflix'));

                // Resolve the 3 requested cloud storage hosts concurrently
                const [hubcloudUrl, filepressUrl, gdflixUrl] = await Promise.all([
                  hubFile ? resolveToonworldRedirect(hubFile.link, activeEpUrl) : null,
                  filepressFile ? resolveToonworldRedirect(filepressFile.link, activeEpUrl) : null,
                  gdflixFile ? resolveToonworldRedirect(gdflixFile.link, activeEpUrl) : null
                ]);

                const chosenHub = hubcloudUrl || filepressUrl || gdflixUrl || postUrl;
                qualities.push({
                  quality: q,
                  size: encode.readable?.size || (q === '480p' ? '85 MB' : (q === '720p' ? '180 MB' : '320 MB')),
                  hubUrl: chosenHub,
                  hubcloudUrl: hubcloudUrl || null,
                  filepressUrl: filepressUrl || null,
                  gdflixUrl: gdflixUrl || null,
                  cloudDirectUrl: hubcloudUrl ? `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubcloudUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=cloud_direct` : (filepressUrl || gdflixUrl),
                  directDownloadUrl: hubcloudUrl ? `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubcloudUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=direct` : (filepressUrl || gdflixUrl),
                  hdCloudUrl: hubcloudUrl || filepressUrl || gdflixUrl || postUrl
                });
              }
            }
          }
        } catch (epErr) {
          console.warn(`[ToonWorld] Archive episode fetch error:`, epErr.message);
        }
      }

      // Pre-resolve best direct stream option from HubCloud (first preference 720p or 480p)
      const hubQual = qualities.find(q => q.hubcloudUrl) || qualities[0];
      if (hubQual && hubQual.hubcloudUrl) {
        try {
          const resolvedHub = await resolveHubCloudLink(hubQual.hubcloudUrl);
          if (resolvedHub) {
            if (resolvedHub.streamUrl) directStreamUrl = resolvedHub.streamUrl;
            if (resolvedHub.embedUrl) embedUrl = resolvedHub.embedUrl;
          }
        } catch (hErr) {
          console.warn('[ToonWorld] HubCloud direct stream resolve warning:', hErr.message);
        }
      }

      // Fallback default qualities if archive link parsing was empty
      if (qualities.length === 0) {
        const defaultTiers = [
          { quality: '480p', size: '85 MB' },
          { quality: '720p', size: '180 MB' },
          { quality: '1080p', size: '320 MB' }
        ];
        defaultTiers.forEach(t => {
          qualities.push({
            quality: t.quality,
            size: t.size,
            hubUrl: postUrl,
            hubcloudUrl: null,
            filepressUrl: null,
            gdflixUrl: null,
            cloudDirectUrl: `/api/cloud-direct-download?title=${encodeURIComponent(title)}&quality=${t.quality}&type=cloud_direct`,
            directDownloadUrl: `/api/cloud-direct-download?title=${encodeURIComponent(title)}&quality=${t.quality}&type=direct`,
            hdCloudUrl: `/api/cloud-direct-download?title=${encodeURIComponent(title)}&quality=${t.quality}&type=hd_cloud`
          });
        });
      }

      return res.json({
        success: true,
        slug: cleanSlug,
        source: 'ToonWorld4All',
        category: 'Anime',
        title,
        poster,
        embedUrl,
        directStreamUrl,
        isPlayable: true,
        unplayableMessage: null,
        aspectRatio: 'theater',
        episodes,
        currentEpisode: currentEpisodeIndex + 1,
        currentEpisodeUrl: activeEpUrl,
        qualities,
        originalViews: '18.4K views',
        publishDate: 'Recent'
      });
    } else if (source === 'Filmyzilla') {
      // ---------------- Filmyzilla Detail Handler ----------------
      let movieUrl = null;
      let movieId = null;
      let movieSlug = slug;

      if (slug.startsWith('filmyzilla_')) {
        slug = slug.replace(/^filmyzilla_/, '');
      }

      if (req.query.url && req.query.url.includes('filmyzilla')) {
        movieUrl = req.query.url;
      }

      const index = await getFilmyzillaIndex();
      const matched = index.find(x => x.movieId === slug || x.id === slug || x.slug === slug || (x.permalink && x.permalink.includes(slug)));
      if (matched) {
        movieUrl = matched.permalink;
        movieId = matched.movieId;
        movieSlug = matched.slug;
      } else if (!movieUrl) {
        if (/^\d+$/.test(slug)) {
          movieId = slug;
          movieUrl = `${FILMYZILLA_BASE}/movie/${slug}/movie.html`;
        } else {
          movieUrl = `${FILMYZILLA_BASE}/movie/${slug}.html`;
        }
      }

      const cacheKey = `filmyzilla_detail_${movieId || movieSlug}`;
      const cached = RESOLVER_CACHE.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.data);
      }

      const postRes = await fetch(movieUrl, {
        headers: { ...COMMON_HEADERS, 'Referer': `${FILMYZILLA_BASE}/` }
      });

      if (!postRes.ok) {
        return res.status(404).json({ success: false, error: 'Filmyzilla movie not found' });
      }

      const html = await postRes.text();

      // Title
      const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
      let title = titleMatch ? titleMatch[1].replace(/Free Download Filmyzilla/i, '').replace(/Filmyzilla/i, '').trim() : movieSlug.replace(/[-_]+/g, ' ');

      // Poster
      let poster = `${FILMYZILLA_BASE}/files/images/${movieSlug}.jpg`;
      const imgMatch = html.match(/<img[^>]+src=["']([^"']*\/files\/images\/[^"']+)["']/i);
      if (imgMatch) {
        poster = imgMatch[1].startsWith('http') ? imgMatch[1] : `${FILMYZILLA_BASE}${imgMatch[1]}`;
      }

      // Extract server links from Filmyzilla / HDFilmyzilla
      const serverLinks = [...html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"'\s<>]+\/server\/(\d+)\/([^"']+))["'][^>]*>([\s\S]*?)<\/a>/gi)];

      const qualityFetches = serverLinks.map(async (sl) => {
        const sUrl = sl[1];
        const sId = sl[2];
        const linkText = sl[4].replace(/<[^>]+>/g, '').trim();

        try {
          const sRes = await fetch(sUrl, {
            headers: { ...COMMON_HEADERS, 'Referer': movieUrl }
          });
          const sHtml = await sRes.text();
          const sizeMatch = sHtml.match(/Size of file:\s*([0-9.]+\s*[MGBKmgk]+)/i) ||
            sHtml.match(/([0-9.]+\s*(?:MB|GB|KB))/i);
          const fileSize = sizeMatch ? sizeMatch[1].trim() : 'Standard';

          let qLabel = '480p';
          if (sUrl.includes('1080p') || linkText.includes('1080p')) qLabel = '1080p';
          else if (sUrl.includes('720p') || linkText.includes('720p')) qLabel = '720p';
          else if (sUrl.includes('480p') || linkText.includes('480p')) qLabel = '480p';
          if (sUrl.toLowerCase().includes('hevc') || linkText.toLowerCase().includes('hevc')) {
            qLabel = `HEVC ${qLabel}`;
          }

          return {
            quality: qLabel,
            size: fileSize,
            serverId: sId,
            servers: [
              { serverNumber: 1, name: 'Server 1 (High Speed)', url: `/api/filmyzilla-download?serverId=${sId}&server=1` },
              { serverNumber: 2, name: 'Server 2 (Fast CDN)', url: `/api/filmyzilla-download?serverId=${sId}&server=2` },
              { serverNumber: 3, name: 'Server 3 (Direct)', url: `/api/filmyzilla-download?serverId=${sId}&server=3` },
              { serverNumber: 4, name: 'Server 4 (Backup)', url: `/api/filmyzilla-download?serverId=${sId}&server=4` }
            ]
          };
        } catch (e) {
          return null;
        }
      });

      const qualities = (await Promise.all(qualityFetches)).filter(Boolean);

      const result = {
        success: true,
        id: `filmyzilla_${movieId || movieSlug}`,
        slug: movieSlug,
        source: 'Filmyzilla',
        category: detectCategory(title, 'Filmyzilla'),
        title,
        poster,
        thumbnail: poster,
        isFilmyzilla: true,
        qualities,
        directStreamUrl: null,
        embedUrl: null,
        views: '2.8k views',
        description: 'Multi-server high speed direct download from Filmyzilla.'
      };

      RESOLVER_CACHE.set(cacheKey, { data: result, expiresAt: Date.now() + RESOLVER_TTL_MS });
      return res.json(result);
    }

    if (source === 'HDWall') {
      // ---------------- HDWall Detail Handler ----------------
      const activeBase = await getActiveHdhubBase();
      const cleanSlug = slug.replace(/^\/+|\/+$/g, '');
      const candidates = [
        req.query.url,
        `${activeBase}/${cleanSlug}/`,
        `${activeBase}/${cleanSlug}`,
        `${activeBase}/${cleanSlug}.html`,
        `https://hdtvb.net/${cleanSlug}.html`,
        `https://hdtvb.net/${cleanSlug}/`
      ].filter(Boolean);

      let response = null;
      let postUrl = '';

      for (const candidate of candidates) {
        try {
          const res = await fetch(candidate, {
            headers: { ...COMMON_HEADERS, 'Referer': candidate.includes('hdtvb') ? 'https://hdtvb.net/' : `${activeBase}/` }
          });
          if (res.ok) {
            response = res;
            postUrl = candidate;
            break;
          }
        } catch (e) { }
      }

      // Fallback search on HDWall if candidates failed
      if (!response || !response.ok) {
        try {
          const searchStory = cleanSlug.replace(/\.html$/, '').replace(/[-_]/g, ' ');
          const searchUrl = `${activeBase}/index.php?do=search&subaction=search&story=${encodeURIComponent(searchStory)}`;
          const searchRes = await fetch(searchUrl, {
            headers: { ...COMMON_HEADERS, 'Referer': `${activeBase}/` }
          });
          if (searchRes.ok) {
            const searchHtml = await searchRes.text();
            const items = parseHdwallHtml(searchHtml, activeBase);
            if (items.length > 0) {
              const matched = items[0];
              const altUrl = matched.permalink || `${activeBase}/${matched.slug}`;
              const altRes = await fetch(altUrl, {
                headers: { ...COMMON_HEADERS, 'Referer': `${activeBase}/` }
              });
              if (altRes.ok) {
                response = altRes;
                postUrl = altUrl;
              }
            }
          }
        } catch (hdErr) {
          console.warn('HDWall fallback search warning:', hdErr.message);
        }
      }

      if (!response || !response.ok) {
        return res.status(404).json({ success: false, error: 'HDWall item not found across all mirrors' });
      }

      const html = await response.text();

      // Title
      const hTitleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
      const title = cleanTitle(hTitleMatch ? hTitleMatch[1] : slug);

      // Primary Poster
      const posterMatch = html.match(/<figure[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i) ||
        html.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i) ||
        html.match(/<img[^>]+class=["'][^"']*aligncenter[^"']*["'][^>]+src=["']([^"']+)["']/i);
      let poster = posterMatch ? posterMatch[1] : '';
      if (poster.startsWith('/')) poster = `${activeBase}${poster}`;

      // Extract quality downloads mapped to file sizes (supporting hubcdn, hubcloud, hubdrive)
      const rawLinks = [...html.matchAll(/<a[^>]+href=["'](https?:\/\/(?:hubcdn\.io|hubcloud\.[a-z0-9-]+|hubdrive\.[a-z0-9-]+)\/(?:cloud|drive|video|file)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
      const qualities = [];
      let directStreamUrl = null;
      let embedUrl = null;

      // Extract and resolve HubCloud/HubDrive links
      for (const l of rawLinks) {
        let hubUrl = l[1];
        if (hubUrl.includes('hubdrive.')) {
          try {
            const hdRes = await fetch(hubUrl, { headers: { ...COMMON_HEADERS, 'Referer': postUrl } });
            if (hdRes.ok) {
              const hdHtml = await hdRes.text();
              const hcMatch = hdHtml.match(/href=["'](https?:\/\/hubcloud\.[a-z0-9-]+\/(?:drive|video)\/[^"']+)["']/i);
              if (hcMatch) {
                hubUrl = hcMatch[1];
              }
            }
          } catch (e) { }
        }

        const text = cleanTitle(l[2]);
        const qMatch = text.match(/(480p|720p|1080p|2160p|4k)/i);
        const sMatch = text.match(/([0-9.]+\s*(?:MB|GB|Mb|Gb))/i);
        const q = qMatch ? qMatch[1].toLowerCase() : (qualities.length === 0 ? '480p' : (qualities.length === 1 ? '720p' : '1080p'));
        const s = sMatch ? sMatch[1].toUpperCase() : (q === '480p' ? '450MB' : (q === '720p' ? '1.2GB' : '2.9GB'));

        qualities.push({
          quality: q,
          size: s,
          hubUrl,
          cloudDirectUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=cloud_direct`,
          directDownloadUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=direct`,
          hdCloudUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=hd_cloud`
        });
      }

      // Fast resolve first quality link for stream playback
      if (qualities.length > 0 && qualities[0].hubUrl.includes('hubcdn.io')) {
        try {
          const resolvedFirst = await resolveHubCdnTier(qualities[0].hubUrl);
          if (resolvedFirst?.streamUrl) directStreamUrl = resolvedFirst.streamUrl;
          if (resolvedFirst?.embedUrl) embedUrl = resolvedFirst.embedUrl;
        } catch (e) { }
      } else if (qualities.length > 0 && qualities[0].hubUrl.includes('hubcloud.')) {
        try {
          const resolvedCloud = await resolveHubCloudLink(qualities[0].hubUrl);
          if (resolvedCloud?.streamUrl) directStreamUrl = resolvedCloud.streamUrl;
          if (resolvedCloud?.embedUrl) embedUrl = resolvedCloud.embedUrl;
        } catch (e) { }
      }

      // If no hubcdn links parsed, populate structured tiers
      if (qualities.length === 0) {
        const defaultTiers = [
          { quality: '480p', size: '450MB' },
          { quality: '720p', size: '1.2GB' },
          { quality: '1080p', size: '2.9GB' }
        ];
        defaultTiers.forEach(t => {
          qualities.push({
            quality: t.quality,
            size: t.size,
            hubUrl: postUrl,
            cloudDirectUrl: `/api/cloud-direct-download?title=${encodeURIComponent(title)}&quality=${t.quality}&type=cloud_direct`,
            directDownloadUrl: `/api/cloud-direct-download?title=${encodeURIComponent(title)}&quality=${t.quality}&type=direct`,
            hdCloudUrl: `/api/cloud-direct-download?title=${encodeURIComponent(title)}&quality=${t.quality}&type=hd_cloud`
          });
        });
      }

      // Standard Video Player Container setup across all aggregated items (no unplayable warning UI)
      return res.json({
        success: true,
        slug: cleanSlug,
        source: 'HDWall',
        category: detectCategory(title, 'HDWall'),
        title,
        poster,
        embedUrl,
        directStreamUrl,
        isPlayable: true,
        unplayableMessage: null,
        aspectRatio: 'theater',
        qualities,
        originalViews: '4.8K views',
        publishDate: 'Recent'
      });

    } else if (source === 'Movies4u') {
      // ---------------- Movies4u Detail Handler ----------------
      const activeM4uBase = await getActiveMovies4uBase();
      const postSlug = slug.replace(/^\/+|\/+$/g, '');
      let postUrl = /^\d+$/.test(postSlug)
        ? `${activeM4uBase}/?p=${postSlug}`
        : `${activeM4uBase}/${postSlug}/`;

      let response = await fetch(postUrl, {
        headers: { ...COMMON_HEADERS, 'Referer': `${activeM4uBase}/` },
        redirect: 'follow'
      });

      // Fallback: If 404, attempt lookup search via lookup.php to resolve the true permalink
      if (!response.ok) {
        try {
          const searchQuery = postSlug.replace(/[-_]/g, ' ');
          const lookupRes = await fetch(`${activeM4uBase}/lookup.php?q=${encodeURIComponent(searchQuery)}`, {
            headers: { ...COMMON_HEADERS, 'Referer': `${activeM4uBase}/` }
          });
          if (lookupRes.ok) {
            const lookupData = await lookupRes.json();
            if (lookupData.ok && Array.isArray(lookupData.hits) && lookupData.hits.length > 0) {
              const hit = lookupData.hits[0];
              const hitSlug = (hit.permalink || '').replace(/^https?:\/\/[^\/]+/i, '').replace(/^\/+|\/+$/g, '');
              const altUrl = hitSlug ? `${activeM4uBase}/${hitSlug}/` : `${activeM4uBase}/?p=${hit.id}`;
              const altRes = await fetch(altUrl, {
                headers: { ...COMMON_HEADERS, 'Referer': `${activeM4uBase}/` },
                redirect: 'follow'
              });
              if (altRes.ok) {
                response = altRes;
              }
            }
          }
        } catch (fbErr) {
          console.warn('Movies4u 404 fallback lookup warning:', fbErr.message);
        }
      }

      if (!response.ok) {
        return res.status(404).json({ success: false, error: `Movies4u post not found (HTTP ${response.status})` });
      }

      const html = await response.text();

      // Title
      const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
      const title = cleanTitle(titleMatch ? titleMatch[1] : slug);

      // Primary Poster
      const posterMatch = html.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i) ||
        html.match(/<div class=["']post-thumbnail["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
      const poster = posterMatch ? posterMatch[1] : '';

      // Watch Online link / embed / direct stream
      const watchMatch = html.match(/<a[^>]+href=["'](https?:\/\/m4uplay\.[a-z0-9-]+\/file\/([a-zA-Z0-9_-]+))["'][^>]*>[\s\S]*?Watch Online[\s\S]*?<\/a>/i) ||
        html.match(/<a[^>]+href=["'](https?:\/\/m4uplay[^\s"']+)["']/i);
      let embedUrl = null;
      let directStreamUrl = null;

      if (watchMatch) {
        const m4uPlayUrl = watchMatch[1];
        const fileId = watchMatch[2] || (m4uPlayUrl.match(/\/file\/([a-zA-Z0-9_-]+)/) || [])[1];
        try {
          const m4uRes = await fetch(m4uPlayUrl, { headers: { ...COMMON_HEADERS, 'Referer': postUrl } });
          const m4uText = await m4uRes.text();
          const playerInfo = extractM4uPlayer(m4uText, fileId);
          embedUrl = playerInfo.embedUrl;
          directStreamUrl = playerInfo.directStreamUrl;
        } catch (e) {
          console.warn('Movies4u embed resolve warning:', e.message);
          if (fileId) embedUrl = `https://morencius.com/embed/${fileId}`;
        }
      }

      // Download tiers: check for m4ulinks on post (e.g. m4ulinks.sbs, m4ulinks.site, etc.)
      const qualities = [];
      const m4uLinksMatch = html.match(/https?:\/\/m4ulinks\.[a-z0-9-]+\/number\/([0-9]+)/i);

      if (m4uLinksMatch) {
        try {
          const m4uLinksUrl = m4uLinksMatch[0];
          const mLinksRes = await fetch(m4uLinksUrl, { headers: { ...COMMON_HEADERS, 'Referer': postUrl } });
          if (mLinksRes.ok) {
            const mLinksHtml = await mLinksRes.text();
            const seenTiers = new Set();

            // 1. Precise heading section matching: <h4|p>QUALITY [SIZE]</h4|p> ... <a href="https://hubcloud.../(drive|video)/...">
            const sections = [...mLinksHtml.matchAll(/(<h[2-6][^>]*>[\s\S]*?)(?=<h[2-6]|$)/gi)];
            for (const sec of sections) {
              const secHtml = sec[1];
              const headingMatch = secHtml.match(/<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/i);
              const hubMatch = secHtml.match(/href=["'](https?:\/\/[^"']*hubcloud\.[a-z0-9-]+\/(?:drive|video)\/[^"']+)["']/i);
              if (!headingMatch || !hubMatch) continue;

              const rawHeading = cleanTitle(headingMatch[1]);
              const hubUrl = hubMatch[1];
              const qMatch = rawHeading.match(/(480p|720p|1080p|2160p|4k)/i);
              const sMatch = rawHeading.match(/([0-9.]+\s*(?:MB|GB|Mb|Gb))/i);
              const q = qMatch ? qMatch[1].toLowerCase() : (qualities.length === 0 ? '480p' : (qualities.length === 1 ? '720p' : '1080p'));
              const s = sMatch ? sMatch[1].toUpperCase() : (q === '480p' ? '450MB' : (q === '720p' ? '1.2GB' : '2.9GB'));

              const isHevc = /hevc/i.test(rawHeading);
              const label = isHevc ? `${q.toUpperCase()} (HEVC)` : q;

              if (!seenTiers.has(label) && qualities.length < 5) {
                seenTiers.add(label);
                qualities.push({
                  quality: label,
                  size: s,
                  hubUrl,
                  cloudDirectUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=cloud_direct`,
                  directDownloadUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=direct`,
                  hdCloudUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=hd_cloud`
                });
              }
            }

            // Fallback link regex if section matching was empty
            if (qualities.length === 0) {
              const linkDivRegex = /<(?:h[2-6]|p)[^>]*>([\s\S]*?)<\/(?:h[2-6]|p)>[\s\S]*?<a[^>]+href=["'](https?:\/\/[^"']*hubcloud\.[a-z0-9-]+\/(?:drive|video)\/[^"']+)["']/gi;
              let divMatch;
              while ((divMatch = linkDivRegex.exec(mLinksHtml)) !== null) {
                const rawHeading = cleanTitle(divMatch[1]);
                const hubUrl = divMatch[2];

                const qMatch = rawHeading.match(/(480p|720p|1080p|2160p|4k)/i);
                const sMatch = rawHeading.match(/([0-9.]+\s*(?:MB|GB|Mb|Gb))/i);
                const q = qMatch ? qMatch[1].toLowerCase() : (qualities.length === 0 ? '480p' : (qualities.length === 1 ? '720p' : '1080p'));
                const s = sMatch ? sMatch[1].toUpperCase() : (q === '480p' ? '450MB' : (q === '720p' ? '1.2GB' : '2.9GB'));

                const isHevc = /hevc/i.test(rawHeading);
                const label = isHevc ? `${q.toUpperCase()} (HEVC)` : q;

                if (!seenTiers.has(label) && qualities.length < 5) {
                  seenTiers.add(label);
                  qualities.push({
                    quality: label,
                    size: s,
                    hubUrl,
                    cloudDirectUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=cloud_direct`,
                    directDownloadUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=direct`,
                    hdCloudUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=hd_cloud`
                  });
                }
              }
            }

            // Pre-resolve first HubCloud link to get direct stream if not already obtained
            if (qualities.length > 0 && qualities[0].hubUrl) {
              try {
                const resolvedHub = await resolveHubCloudLink(qualities[0].hubUrl);
                if (resolvedHub) {
                  if (!directStreamUrl && resolvedHub.streamUrl) {
                    directStreamUrl = resolvedHub.streamUrl;
                  }
                  if (!embedUrl && resolvedHub.embedUrl) {
                    embedUrl = resolvedHub.embedUrl;
                  }
                }
              } catch (e) {
                console.warn('Movies4u hub pre-resolve warning:', e.message);
              }
            }

            if (!embedUrl && directStreamUrl) {
              embedUrl = `https://hbplay.pages.dev/?u=${Buffer.from(directStreamUrl).toString('base64')}`;
            }
          }
        } catch (mErr) {
          console.warn('Error parsing m4ulinks:', mErr.message);
        }
      }

      // If no m4ulinks found or parsed, inspect post HTML for mdrive.cloud or HubCloud links
      if (qualities.length === 0) {
        const mdriveLinks = [...html.matchAll(/href=["'](https?:\/\/[^"']*mdrive\.cloud\/mdisk\/[0-9]+)["']/gi)].map(m => m[1]);
        if (mdriveLinks.length > 0) {
          const uniqueMdrive = [...new Set(mdriveLinks)];
          for (let i = 0; i < Math.min(uniqueMdrive.length, 3); i++) {
            const mUrl = uniqueMdrive[i];
            const q = i === 0 ? '480p' : (i === 1 ? '720p' : '1080p');
            const s = q === '480p' ? '480MB' : (q === '720p' ? '1.1GB' : '2.1GB');
            try {
              const resolvedMdrive = await resolveMdriveLink(mUrl);
              if (resolvedMdrive) {
                if (!embedUrl && resolvedMdrive.embedUrl) embedUrl = resolvedMdrive.embedUrl;
                if (!directStreamUrl && (resolvedMdrive.cloudDirect || resolvedMdrive.streamUrl)) {
                  directStreamUrl = resolvedMdrive.cloudDirect || resolvedMdrive.streamUrl;
                }
              }
            } catch (e) {}

            qualities.push({
              quality: q,
              size: s,
              hubUrl: mUrl,
              cloudDirectUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(mUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=cloud_direct`,
              directDownloadUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(mUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=direct`,
              hdCloudUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(mUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=hd_cloud`
            });
          }
        }
      }

      if (qualities.length === 0) {
        const directHubLinks = [...html.matchAll(/href=["'](https?:\/\/[^"']*hubcloud\.[a-z0-9-]+\/(?:drive|video)\/[^"']+)["']/gi)].map(m => m[1]);
        if (directHubLinks.length > 0) {
          directHubLinks.slice(0, 4).forEach((hubUrl, idx) => {
            const q = idx === 0 ? '480p' : (idx === 1 ? '720p' : (idx === 2 ? '1080p' : '2160p'));
            const s = q === '480p' ? '450MB' : (q === '720p' ? '1.2GB' : (q === '1080p' ? '2.9GB' : '6.5GB'));
            qualities.push({
              quality: q,
              size: s,
              hubUrl,
              cloudDirectUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=cloud_direct`,
              directDownloadUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=direct`,
              hdCloudUrl: `/api/cloud-direct-download?hubUrl=${encodeURIComponent(hubUrl)}&title=${encodeURIComponent(title)}&quality=${q}&type=hd_cloud`
            });
          });
        }
      }

      // If no m4ulinks parsed, populate structured tiers
      if (qualities.length === 0) {
        const defaultTiers = [
          { quality: '480p', size: '450MB' },
          { quality: '720p', size: '1.2GB' },
          { quality: '1080p', size: '2.9GB' }
        ];
        defaultTiers.forEach(t => {
          qualities.push({
            quality: t.quality,
            size: t.size,
            hubUrl: postUrl,
            cloudDirectUrl: `/api/cloud-direct-download?title=${encodeURIComponent(title)}&quality=${t.quality}&type=cloud_direct`,
            directDownloadUrl: `/api/cloud-direct-download?title=${encodeURIComponent(title)}&quality=${t.quality}&type=direct`,
            hdCloudUrl: `/api/cloud-direct-download?title=${encodeURIComponent(title)}&quality=${t.quality}&type=hd_cloud`
          });
        });
      }

      return res.json({
        success: true,
        slug: postSlug,
        source: 'Movies4u',
        category: detectCategory(title, 'Movies4u'),
        title,
        poster,
        embedUrl,
        directStreamUrl,
        isPlayable: true,
        unplayableMessage: null,
        aspectRatio: 'theater',
        qualities,
        originalViews: '3.9K views',
        publishDate: 'Recent'
      });

    } else {
      // ---------------- MicroTV Detail Handler (Pure Live Scraping) ----------------
      const cleanSlug = slug.replace(/^\/+|\/+$/g, '');
      const postUrl = `${MICROTV_BASE}/post/${encodeURIComponent(cleanSlug)}`;
      let html = await fetchMicroTvHtml(postUrl);

      if (!html) {
        try {
          const searchHtml = await fetchMicroTvHtml(`${MICROTV_BASE}/search?q=${encodeURIComponent(cleanSlug.replace(/[-_]/g, ' '))}`);
          if (searchHtml) {
            const postMatch = searchHtml.match(/<a\s+[^>]*href=["'](?:https?:\/\/(?:m|new)\.microtv\.st)?\/post\/([^"']+)["']/i);
            if (postMatch) {
              html = await fetchMicroTvHtml(`${MICROTV_BASE}/post/${encodeURIComponent(postMatch[1])}`);
            }
          }
        } catch (mErr) {
          console.warn('MicroTV 404 fallback search warning:', mErr.message);
        }
      }

      if (!html) {
        // Fallback to pre-resolved post cache (Essential for Render / Vercel cloud environments)
        const cachedPost = MICROTV_POSTS_CACHE[cleanSlug] ||
          Object.values(MICROTV_POSTS_CACHE).find(p => p.slug === cleanSlug || p.title?.toLowerCase().includes(cleanSlug.replace(/[-_]/g, ' ').toLowerCase()));
        if (cachedPost) {
          return res.json({
            ...cachedPost,
            clientIp: getClientIp(req),
            isCachedCloudFallback: true
          });
        }

        // If not in pre-resolved cache, check if item exists in MICROTV_SEED_CATALOG
        const seedItem = MICROTV_SEED_CATALOG.find(it => it.slug === cleanSlug || it.id === `microtv_${cleanSlug}`);
        if (seedItem) {
          const title = seedItem.title;
          const poster = seedItem.thumbnail;
          return res.json({
            success: true,
            slug: cleanSlug,
            source: 'MicroTV',
            category: 'Mini Drama',
            title,
            poster,
            embedUrl: '',
            downloadPhpUrl: '',
            directStreamUrl: null,
            isPlayable: true,
            aspectRatio: 'vertical',
            actualMediaFileName: `${title}.mkv`,
            mediaFileSize: null,
            qualities: [
              { quality: '480p', size: '450MB', cloudDirectUrl: `/api/cloud-direct-download?title=${encodeURIComponent(title)}&quality=480p&type=cloud_direct` },
              { quality: '720p', size: '1.2GB', cloudDirectUrl: `/api/cloud-direct-download?title=${encodeURIComponent(title)}&quality=720p&type=cloud_direct` },
              { quality: '1080p', size: '2.9GB', cloudDirectUrl: `/api/cloud-direct-download?title=${encodeURIComponent(title)}&quality=1080p&type=cloud_direct` }
            ],
            originalViews: seedItem.views || '2.8K views',
            publishDate: 'Recent',
            clientIp: getClientIp(req),
            isCachedCloudFallback: true
          });
        }

        return res.status(404).json({ success: false, error: 'Series not found on MicroTV' });
      }

      // Title
      const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const title = cleanTitle(titleMatch ? titleMatch[1] : slug);

      // Featured Poster
      const posterMatch = html.match(/<img[^>]+?\bsrc=["']([^"']+)["'][^>]*class=["'][^"']*featured-poster/i) ||
        html.match(/<img[^>]+class=["'][^"']*featured-poster[^"']*["'][^>]+?\bsrc=["']([^"']+)["']/i);
      const poster = posterMatch ? posterMatch[1] : '';

      // Video Embed Player iframe src
      const iframeMatch = html.match(/<div class=["']embed-player["'][\s\S]*?<iframe\s+[^>]*src=["']([^"']+)["']/i) ||
        html.match(/<iframe\s+[^>]*src=["']([^"']+)["']/i);
      const embedUrl = iframeMatch ? iframeMatch[1] : '';

      // Download PHP handler link
      const downloadMatch = html.match(/<a\s+[^>]*href=["'](https?:\/\/[^"']*download\.php[^"']*)["']/i);
      const downloadPhpUrl = downloadMatch ? downloadMatch[1] : '';

      // Pre-resolve direct stream & media file URL via Fast Cloud (FSL R2)
      let directStreamUrl = null;
      let actualMediaFileName = `${title}.mkv`;
      let mediaFileSize = null;

      if (downloadPhpUrl) {
        try {
          const body = new URLSearchParams();
          body.append('fast_cloud_r2_download', '1');
          const fslRes = await fetch(downloadPhpUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': COMMON_HEADERS['User-Agent'],
              'Referer': downloadPhpUrl
            },
            body: body.toString(),
            redirect: 'manual'
          });

          if (fslRes.status === 302 || fslRes.status === 301) {
            directStreamUrl = fslRes.headers.get('location');

            if (directStreamUrl) {
              try {
                const headRes = await fetch(directStreamUrl, {
                  method: 'HEAD',
                  headers: {
                    'User-Agent': COMMON_HEADERS['User-Agent'],
                    'Referer': getRefererForUrl(directStreamUrl)
                  }
                });
                if (headRes.ok) {
                  const len = headRes.headers.get('content-length');
                  if (len) mediaFileSize = parseInt(len, 10);
                }
              } catch (e) { }
            }
          }
        } catch (e) { }
      }

      // Structure 3 Quality tiers mapped to sizes
      const qualities = [
        {
          quality: '480p',
          size: '450MB',
          cloudDirectUrl: `/api/cloud-direct-download?downloadPhpUrl=${encodeURIComponent(downloadPhpUrl || '')}&fileUrl=${encodeURIComponent(directStreamUrl || '')}&action=fast_cloud_r2_download&title=${encodeURIComponent(title)}&quality=480p&type=cloud_direct`,
          directDownloadUrl: `/api/cloud-direct-download?downloadPhpUrl=${encodeURIComponent(downloadPhpUrl || '')}&fileUrl=${encodeURIComponent(directStreamUrl || '')}&action=download&title=${encodeURIComponent(title)}&quality=480p&type=direct`,
          hdCloudUrl: `/api/cloud-direct-download?downloadPhpUrl=${encodeURIComponent(downloadPhpUrl || '')}&fileUrl=${encodeURIComponent(directStreamUrl || '')}&action=xcloud_download&title=${encodeURIComponent(title)}&quality=480p&type=hd_cloud`
        },
        {
          quality: '720p',
          size: '1.2GB',
          cloudDirectUrl: `/api/cloud-direct-download?downloadPhpUrl=${encodeURIComponent(downloadPhpUrl || '')}&fileUrl=${encodeURIComponent(directStreamUrl || '')}&action=fast_cloud_r2_download&title=${encodeURIComponent(title)}&quality=720p&type=cloud_direct`,
          directDownloadUrl: `/api/cloud-direct-download?downloadPhpUrl=${encodeURIComponent(downloadPhpUrl || '')}&fileUrl=${encodeURIComponent(directStreamUrl || '')}&action=download&title=${encodeURIComponent(title)}&quality=720p&type=direct`,
          hdCloudUrl: `/api/cloud-direct-download?downloadPhpUrl=${encodeURIComponent(downloadPhpUrl || '')}&fileUrl=${encodeURIComponent(directStreamUrl || '')}&action=xcloud_download&title=${encodeURIComponent(title)}&quality=720p&type=hd_cloud`
        },
        {
          quality: '1080p',
          size: '2.9GB',
          cloudDirectUrl: `/api/cloud-direct-download?downloadPhpUrl=${encodeURIComponent(downloadPhpUrl || '')}&fileUrl=${encodeURIComponent(directStreamUrl || '')}&action=fast_cloud_r2_download&title=${encodeURIComponent(title)}&quality=1080p&type=cloud_direct`,
          directDownloadUrl: `/api/cloud-direct-download?downloadPhpUrl=${encodeURIComponent(downloadPhpUrl || '')}&fileUrl=${encodeURIComponent(directStreamUrl || '')}&action=download&title=${encodeURIComponent(title)}&quality=1080p&type=direct`,
          hdCloudUrl: `/api/cloud-direct-download?downloadPhpUrl=${encodeURIComponent(downloadPhpUrl || '')}&fileUrl=${encodeURIComponent(directStreamUrl || '')}&action=xcloud_download&title=${encodeURIComponent(title)}&quality=1080p&type=hd_cloud`
        }
      ];

      res.json({
        success: true,
        slug,
        source: 'MicroTV',
        category: 'Mini Drama',
        title,
        poster,
        embedUrl,
        downloadPhpUrl,
        directStreamUrl,
        isPlayable: Boolean(directStreamUrl || embedUrl),
        aspectRatio: 'vertical', // 9:16 for MicroTV Reels
        actualMediaFileName,
        mediaFileSize,
        qualities,
        originalViews: '2.8K views',
        publishDate: 'Recent'
      });
    }
  } catch (err) {
    console.error('Error fetching post details:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch post details from source server',
      message: err.message
    });
  }
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 7. API: Cloud Direct Resolver (Initiates instant file download without ad popups or redirects)
// ---------------------------------------------------------------------------
app.get('/api/cloud-direct-download', async (req, res) => {
  const { hubUrl, downloadPhpUrl, fileUrl, quality = '1080p', type = 'cloud_direct', action = 'fast_cloud_r2_download' } = req.query;
  let title = req.query.title || 'ASI_OTT_Release';

  try {
    let resolvedData = null;

    if (hubUrl) {
      if (hubUrl.includes('hubcdn.io') || hubUrl.includes('hdmobi')) {
        resolvedData = await resolveHubCdnTier(hubUrl);
      } else if (hubUrl.includes('mdrive')) {
        resolvedData = await resolveMdriveLink(hubUrl);
      } else if (hubUrl.includes('hubcloud')) {
        resolvedData = await resolveHubCloudLink(hubUrl);
      }
    }

    if (resolvedData) {
      if (type === 'direct') {
        // High Speed 10Gbps Direct (Google CDN / Direct file)
        let directUrl = resolvedData.directDownload;
        if (directUrl && directUrl.includes('zdownload.php')) {
          try {
            const zRes = await fetch(directUrl, {
              headers: { ...COMMON_HEADERS, 'Referer': resolvedData.filesDlUrl || 'https://new1.filesdl.in/' },
              redirect: 'manual'
            });
            if (zRes.status === 302 || zRes.status === 301) {
              const googleCdn = zRes.headers.get('location');
              if (googleCdn) {
                return res.redirect(302, googleCdn);
              }
            }
          } catch (ze) {
            console.warn('zdownload redirect error:', ze.message);
          }
        }
        if (directUrl && directUrl.startsWith('http')) {
          return res.redirect(302, directUrl);
        }
      } else if (type === 'hd_cloud') {
        // HD Cloud / HubCloud Mirror
        let hdUrl = resolvedData.hdCloud || hubUrl;
        if (hdUrl && hdUrl.startsWith('http')) {
          return res.redirect(302, hdUrl);
        }
      } else {
        // Cloud Direct (Fast Cloudflare R2 / Server storage)
        let cloudUrl = resolvedData.cloudDirect || resolvedData.streamUrl;
        if (cloudUrl && cloudUrl.startsWith('http')) {
          return res.redirect(302, cloudUrl);
        }
      }
    }

    // MicroTV Fast Cloud R2 / Direct / XCloud resolution via download.php
    if (downloadPhpUrl) {
      const actionName = (type === 'direct' || action === 'download') ? 'download'
        : (type === 'hd_cloud' || action === 'xcloud_download') ? 'xcloud_download'
          : 'fast_cloud_r2_download';

      const body = new URLSearchParams();
      body.append(actionName, '1');
      const fslRes = await fetch(downloadPhpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': COMMON_HEADERS['User-Agent'],
          'Referer': downloadPhpUrl
        },
        body: body.toString(),
        redirect: 'manual'
      });

      if (fslRes.status === 302 || fslRes.status === 301) {
        const directFileUrl = fslRes.headers.get('location');
        if (directFileUrl) {
          return res.redirect(302, directFileUrl);
        }
      }
    }

    // Direct File URL fallback
    if (fileUrl && fileUrl.startsWith('http')) {
      return res.redirect(302, fileUrl);
    }

    // Prevention of False Downloads: Return clean error if no valid media source can be resolved
    return res.status(404).json({
      success: false,
      error: `Direct media download link could not be resolved for ${quality}. The source file may be temporarily unavailable.`
    });
  } catch (err) {
    console.error('Error resolving Cloud Direct download:', err.message);
    return res.status(500).json({
      success: false,
      error: `Failed to resolve download link: ${err.message}`
    });
  }
});

// ---------------------------------------------------------------------------
// 8. API: Filmyzilla & HDFilmyzilla Multi-Server Direct Download Resolver
// ---------------------------------------------------------------------------
app.get('/api/filmyzilla-download', async (req, res) => {
  const serverId = req.query.serverId;
  const serverNum = req.query.server || '1';
  const domain = (req.query.domain || '').toLowerCase();
  if (!serverId) {
    return res.status(400).send('Missing serverId parameter');
  }

  const isHdFilmy = domain.includes('hdfilmyzilla') || (req.query.source || '').toLowerCase().includes('hdfilmyzilla');
  const base = isHdFilmy ? HDFILMYZILLA_BASE : FILMYZILLA_BASE;
  const targetUrl = isHdFilmy
    ? `${base}/download/${serverId}/server_${serverNum}`
    : `${base}/verified/${serverId}/server_${serverNum}/`;

  const refererUrl = isHdFilmy
    ? `${base}/server/${serverId}.html`
    : `${base}/server/${serverId}/`;

  try {
    const fetchRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': COMMON_HEADERS['User-Agent'],
        'Referer': refererUrl
      },
      redirect: 'manual'
    });

    if ([301, 302, 303, 307, 308].includes(fetchRes.status)) {
      const loc = fetchRes.headers.get('location');
      if (loc) {
        const fullLoc = loc.startsWith('http') ? loc : `${base}${loc}`;
        return res.redirect(fullLoc);
      }
    }
    return res.redirect(targetUrl);
  } catch (err) {
    console.error('Error resolving Filmyzilla download:', err.message);
    res.redirect(targetUrl);
  }
});

// ---------------------------------------------------------------------------
// 9. API: Direct Stream Download (Clean 302 direct delivery to prevent serverless timeouts)
// ---------------------------------------------------------------------------
app.get('/api/stream-download', async (req, res) => {
  const fileUrl = req.query.url;

  // Prevention of False Downloads: Never serve dummy text as video!
  if (!fileUrl) {
    return res.status(400).json({
      success: false,
      error: 'Missing direct media file URL for download.'
    });
  }

  // Redirect directly to the CDN edge storage URL (prevents 4.5MB Vercel body limits & timeouts)
  return res.redirect(302, fileUrl);
});

// ---------------------------------------------------------------------------
// 10. API: Video Streaming Proxy (Range Requests, Referer Injection & HLS Rewriter)
// ---------------------------------------------------------------------------
app.get('/api/stream-video', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).send('Missing video URL');
  }

  try {
    const baseHeaders = {};
    if (req.headers.range) {
      baseHeaders['Range'] = req.headers.range;
    }

    const { response: videoRes, finalUrl } = await fetchWithRefererRedirect(videoUrl, baseHeaders);

    // If it's an HLS manifest (.m3u8), rewrite relative and absolute segment URLs so they proxy through /api/stream-video
    const contentType = videoRes.headers.get('content-type') || '';
    if (
      finalUrl.includes('.m3u8') ||
      contentType.includes('application/vnd.apple.mpegurl') ||
      contentType.includes('application/x-mpegurl') ||
      contentType.includes('audio/x-mpegurl')
    ) {
      const manifestText = await videoRes.text();
      const u = new URL(finalUrl);
      const basePath = u.origin + u.pathname.substring(0, u.pathname.lastIndexOf('/'));
      const host = req.get('host') || 'asiott.vercel.app';
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const backendOrigin = `${protocol}://${host}`;

      const rewritten = manifestText.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        // If line is a directive with URI="...", rewrite the URI attribute
        if (trimmed.startsWith('#')) {
          return line.replace(/URI=["']([^"']+)["']/gi, (match, uriVal) => {
            const absUri = uriVal.startsWith('http')
              ? uriVal
              : (uriVal.startsWith('/') ? (u.origin + uriVal) : (basePath + '/' + uriVal));
            return `URI="${backendOrigin}/api/stream-video?url=${encodeURIComponent(absUri)}"`;
          });
        }

        // Line is a media playlist or segment URL
        const absUrl = trimmed.startsWith('http')
          ? trimmed
          : (trimmed.startsWith('/') ? (u.origin + trimmed) : (basePath + '/' + trimmed));
        return `${backendOrigin}/api/stream-video?url=${encodeURIComponent(absUrl)}`;
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(rewritten);
    }

    res.status(videoRes.status);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', 'inline');

    let hasContentType = false;
    for (const [key, value] of videoRes.headers.entries()) {
      const lower = key.toLowerCase();
      if (['content-range', 'content-length', 'accept-ranges'].includes(lower)) {
        res.setHeader(key, value);
      } else if (lower === 'content-type') {
        hasContentType = true;
        if (value.toLowerCase().includes('octet-stream') || !value) {
          res.setHeader('Content-Type', 'video/mp4');
        } else {
          res.setHeader(key, value);
        }
      }
    }
    if (!hasContentType) {
      res.setHeader('Content-Type', 'video/mp4');
    }

    const nodeStream = Readable.fromWeb(videoRes.body);
    nodeStream.on('error', (err) => {
      // Gracefully ignore client abort / socket closed
    });
    res.on('close', () => {
      try {
        nodeStream.destroy();
      } catch (e) { }
    });
    nodeStream.pipe(res);
  } catch (err) {
    console.error('Error proxying video stream:', err.message);
    if (!res.headersSent) {
      res.status(500).send('Error proxying video stream: ' + err.message);
    }
  }
});

// ---------------------------------------------------------------------------
// 9b. API: Clean Embed Proxy (Neutralize Anti-Sandbox Redirects & Block External Popups)
// ---------------------------------------------------------------------------
app.get('/api/clean-embed', async (req, res) => {
  const embedUrl = req.query.url;
  if (!embedUrl) {
    return res.status(400).send('Missing embed URL');
  }

  try {
    const u = new URL(embedUrl);
    const origin = `${u.protocol}//${u.host}`;

    // For playmate.to or upstream embeds that challenge backend proxies, redirect browser directly
    if (u.hostname.includes('playmate.to')) {
      return res.redirect(302, embedUrl);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    let fetchRes;
    try {
      fetchRes = await fetch(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Referer': `${origin}/`,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
    } catch (fetchErr) {
      clearTimeout(timeout);
      console.warn(`Upstream clean-embed proxy error for ${u.host}, redirecting to direct embed:`, fetchErr.message);
      return res.redirect(302, embedUrl);
    }

    if (!fetchRes.ok) {
      return res.redirect(302, embedUrl);
    }

    let html = await fetchRes.text();

    // 1. Filter out malicious redirect scripts & anti-sandbox detection code
    html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (fullMatch, content) => {
      // Neutralize anti-sandbox detection that navigates to /sandboxed.html
      if (
        content.includes('sandboxed.html') || 
        (content.includes('sandbox') && (content.includes('location.href') || content.includes('hasAttribute')))
      ) {
        return '<!-- [AdShield] Anti-sandbox detector neutralized -->';
      }

      // Neutralize known popunder and redirect ad scripts
      if (
        fullMatch.includes('ev-static.js') || 
        fullMatch.includes('/ad?type=') || 
        fullMatch.includes('adblock') || 
        content.includes('pickDirect') ||
        content.includes('popunder') ||
        content.includes('openWindow') ||
        (content.includes('window.open') && (content.includes('http') || content.includes('ad')))
      ) {
        return '<!-- [AdShield] Ad redirect script removed -->';
      }

      return fullMatch;
    });

    // 2. Inject Base URL and Client-Side Popup & Redirect Neutralizer
    const shieldSnippet = `
      <base href="${origin}/">
      <script>
        (function() {
          // Block all popup windows (window.open)
          window.open = function(url) {
            console.warn('[AdShield] Blocked popup window:', url);
            return null;
          };

          // Neutralize frame busting / top-level redirects
          try {
            Object.defineProperty(window, 'top', {
              get: function() { return window.self; },
              set: function() {}
            });
            Object.defineProperty(window, 'parent', {
              get: function() { return window.self; },
              set: function() {}
            });
          } catch(e) {}

          // Prevent clicking on transparent overlay ad anchors
          document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('a[target="_blank"]').forEach(function(el) {
              el.removeAttribute('target');
              el.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                return false;
              };
            });
          });
        })();
      </script>
    `;

    if (html.includes('<head>')) {
      html = html.replace(/<head>/i, `<head>${shieldSnippet}`);
    } else {
      html = shieldSnippet + html;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(html);
  } catch (err) {
    console.error('Error generating clean embed:', err.message);
    if (!res.headersSent) {
      return res.status(500).send('Error loading clean embedded player: ' + err.message);
    }
  }
});

// ---------------------------------------------------------------------------
// 10. API: Custom Analytics (Strict IP-Based View Counter)
// ---------------------------------------------------------------------------
app.post('/api/views/track', (req, res) => {
  const contentId = (req.body.id || '').trim();
  if (!contentId) {
    return res.status(400).json({ success: false, error: 'Content ID is required' });
  }

  const clientIp = getClientIp(req);
  const db = getViewsDb();

  if (!db[contentId]) {
    db[contentId] = { views: 0, ips: {} };
  }

  let isNewView = false;
  if (!db[contentId].ips[clientIp]) {
    db[contentId].ips[clientIp] = new Date().toISOString();
    db[contentId].views = (db[contentId].views || 0) + 1;
    isNewView = true;
    saveViewsDb(db);
  }

  res.json({
    success: true,
    contentId,
    views: db[contentId].views,
    clientIp,
    isNewView
  });
});

app.get('/api/views/get', (req, res) => {
  const contentId = (req.query.id || '').trim();
  if (!contentId) {
    return res.status(400).json({ success: false, error: 'Content ID is required' });
  }

  const db = getViewsDb();
  const views = db[contentId] ? db[contentId].views : 0;
  res.json({ success: true, contentId, views });
});

// Watch Page Route Handler
app.get('/watch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

// Server listen on available port (only in standalone Node / Render environment, not on Vercel)
function startServer(port) {
  const host = '0.0.0.0';
  const server = app.listen(port, host, () => {
    console.log(`===============================================`);
    console.log(`ASI OTT Server running at: http://${host}:${port}`);
    console.log(`Environment:               ${process.env.RENDER ? 'Render.com Web Service' : (process.env.NODE_ENV || 'development')}`);
    console.log(`Production Domain:         ${PROD_DOMAIN}`);
    console.log(`Health Check:              http://${host}:${port}/health`);
    console.log(`Home / Search:             http://${host}:${port}`);
    console.log(`Watch Page:                http://${host}:${port}/watch`);
    console.log(`===============================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

// If running directly via `node server.js`
if (require.main === module && !process.env.VERCEL) {
  startServer(DEFAULT_PORT);
}

module.exports = app;
