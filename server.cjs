/**
 * Ü | Secure server for photo -> chibi tactical fighter conversion.
 * Node 20+; no external npm dependencies.
 * Only the current uploaded person's photo is used as identity reference.
 * Do not commit API keys or personally selected photos to the repository.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.IMAGE_MODEL || 'gpt-image-2.5-sunburst';
const API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const ACCESS_TOKEN = process.env.APP_ACCESS_TOKEN || '';
const PRODUCTION = process.env.NODE_ENV === 'production';
const TEST_MODE = process.env.NODE_ENV === 'test';
const API_ENDPOINT = TEST_MODE && process.env.TEST_UPSTREAM_URL
  ? process.env.TEST_UPSTREAM_URL
  : 'https://api.openai.com/v1/images/edits';
const UPSTREAM_TIMEOUT = Math.min(360000, Math.max(30000, Number(process.env.AI_TIMEOUT_MS || 240000)));
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 35 * 1024 * 1024;
const JOB_LIFETIME_MS = 12 * 60 * 1000;
const MAX_CONCURRENT = 2;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 6;
const attempts = new Map();
const jobs = new Map();
let inProgress = 0;

const styleBytes = fs.readFileSync(path.join(__dirname, 'assets', 'sabit_tarz_referansi.jpg'));
if (!styleBytes.length) throw new Error('Sabit stil görseli bulunamadı.');
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT geçersiz.');
if (PRODUCTION && ACCESS_TOKEN.length < 16) throw new Error('NODE_ENV=production için APP_ACCESS_TOKEN en az 16 karakter olmalı.');

const prompt = `Create ONE new, premium-quality FULL-BODY 2D chibi tactical combat character image. INPUT IMAGE 1 is the user's selected photo: it is the ONLY identity reference. Preserve this person's distinctive face, eyes, eyebrows, nose, skin tone, approximate age, and recognizable facial proportions. INPUT IMAGE 2 is STYLE REFERENCE ONLY: borrow its illustration quality, dramatic huge-head/tiny-body proportions, angular stern expression and richly shaded tactical combat wardrobe. Never copy the style model's actual face or replace the uploaded person's identity. Make the entire newly illustrated character visually coherent, NOT a photorealistic face pasted on an existing drawing. Styled messy hair and beard should suit the identity from IMAGE 1; if the person is clean shaven or has different hair, adapt those traits rather than inserting a different person's face. Full-body standing guard pose with two fists raised, dark tactical jacket/vest with pockets and straps, gloves, knee guards, combat boots. Center the whole character head-to-shoes in a clean near-white background with a subtle floor shadow. Crisp polished game art, expressive eyes and realistic illustration lighting. Just one person, no text, no logo, no weapons, no collage, no visible frame.`;

function commonHeaders(mime) {
  return {
    'Content-Type': mime,
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY'
  };
}
function sendJSON(res, code, obj) {
  if (res.writableEnded || res.destroyed) return;
  const data = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { ...commonHeaders('application/json; charset=utf-8'), 'Content-Length': data.length });
  res.end(data);
}
function sendError(res, code, message) { sendJSON(res, code, { error: message }); }
function sendPNG(res, data) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(200, { ...commonHeaders('image/png'), 'Content-Length': data.length });
  res.end(data);
}
function secureEqual(a, b) {
  if (typeof a !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function authorized(req, res) {
  if (!ACCESS_TOKEN || secureEqual(req.headers['x-app-access-token'], ACCESS_TOKEN)) return true;
  sendError(res, 401, 'Özel erişim kodu yanlış veya girilmedi.');
  return false;
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const forwarded = req.headers['x-forwarded-host'];
    const host = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.headers.host);
    return /^https?:$/.test(url.protocol) && url.host === host;
  } catch { return false; }
}
function rateAllowed(remote) {
  const now = Date.now();
  const a = (attempts.get(remote) || []).filter(time => now - time < RATE_WINDOW_MS);
  if (a.length >= MAX_REQUESTS_PER_WINDOW) { attempts.set(remote, a); return false; }
  a.push(now); attempts.set(remote, a);
  if (attempts.size > 1000) for (const [k, v] of attempts) if (now - (v.at(-1) || 0) > RATE_WINDOW_MS) attempts.delete(k);
  return true;
}
function cleanupJobs() {
  const now = Date.now();
  for (const [id, j] of jobs) if (j.finishedAt && now - j.finishedAt > JOB_LIFETIME_MS) jobs.delete(id);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, oversized = false;
    const chunks = [];
    req.on('data', x => { size += x.length; if (size > MAX_REQUEST_BYTES) oversized = true; else chunks.push(x); });
    req.on('end', () => oversized
      ? reject(Object.assign(new Error('Fotoğraf verisi çok büyük.'), { status: 413 }))
      : resolve(Buffer.concat(chunks)));
    req.on('error', reject);
    req.on('aborted', () => reject(Object.assign(new Error('Yükleme iptal edildi.'), { status: 400 })));
  });
}
function decodePhoto(raw) {
  if (typeof raw !== 'string') throw Object.assign(new Error('Önce galeriden fotoğraf seçmelisin.'), { status: 400 });
  const match = /^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(raw);
  if (!match || match[2].length > MAX_PHOTO_BYTES * 4 / 3 + 8)
    throw Object.assign(new Error('Fotoğraf biçimi veya boyutu geçersiz.'), { status: 400 });
  const bytes = Buffer.from(match[2], 'base64');
  const mime = match[1];
  if (bytes.length < 64 || bytes.length > MAX_PHOTO_BYTES)
    throw Object.assign(new Error('Fotoğraf boş veya fazla büyük.'), { status: 413 });
  const jpg = bytes[0] === 255 && bytes[1] === 216;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!((mime === 'jpeg' && jpg) || (mime === 'png' && png) || (mime === 'webp' && webp)))
    throw Object.assign(new Error('Fotoğraf içeriği JPG, PNG veya WEBP biçiminde değil.'), { status: 400 });
  return { bytes, mime };
}
function verifyPNG(base64) {
  if (typeof base64 !== 'string' || base64.length < 100 || base64.length > MAX_RESPONSE_BYTES * 4 / 3 + 8) return null;
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 64 || bytes.length > MAX_RESPONSE_BYTES) return null;
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
  if (w < 256 || h < 256 || w > 4096 || h > 4096) return null;
  if (bytes.toString('ascii', bytes.length - 8, bytes.length - 4) !== 'IEND') return null;
  return bytes;
}
async function readJSONLimit(response) {
  if (!response.body) throw new Error('AI servisi boş yanıt döndürdü.');
  if (Number(response.headers.get('content-length') || 0) > MAX_RESPONSE_BYTES * 1.5) throw new Error('AI yanıtı çok büyük.');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_RESPONSE_BYTES * 1.5) throw new Error('AI yanıtı fazla büyük.');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('AI servisi geçerli JSON döndürmedi.'); }
}
async function runImageEdit(photo, externalSignal) {
  const timer = new AbortController();
  const handle = setTimeout(() => timer.abort(new Error('Görsel üretimi zaman aşımına uğradı.')), UPSTREAM_TIMEOUT);
  const signal = AbortSignal.any([timer.signal, externalSignal]);
  try {
    const form = new FormData();
    form.append('model', MODEL);
    form.append('prompt', prompt);
    form.append('quality', 'high');
    form.append('size', '1024x1536');
    form.append('output_format', 'png');
    form.append('n', '1');
    form.append('image[]', new Blob([photo.bytes], { type: 'image/' + photo.mime }), 'kullanici.' + (photo.mime === 'jpeg' ? 'jpg' : photo.mime));
    form.append('image[]', new Blob([styleBytes], { type: 'image/jpeg' }), 'stil-referansi.jpg');
    const res = await fetch(API_ENDPOINT, { method: 'POST', headers: { Authorization: 'Bearer ' + API_KEY }, body: form, signal });
    const json = await readJSONLimit(res);
    if (!res.ok) {
      const code = json?.error?.code || json?.error?.type || '';
      console.error('AI servisi HTTP', res.status, 'hata türü', String(code).slice(0, 60));
      if (res.status === 401 || res.status === 403) throw new Error('OpenAI API anahtarı geçersiz veya model erişimi yok.');
      if (res.status === 429) throw new Error('OpenAI API kotası veya istek limiti aşıldı.');
      if (res.status === 400) throw new Error('Görsel modeli isteği kabul etmedi. Model erişimini ve ayarlarını kontrol et.');
      throw new Error('Görsel servisi şu anda yanıt vermiyor (HTTP ' + res.status + ').');
    }
    const png = verifyPNG(json?.data?.[0]?.b64_json);
    if (!png) throw new Error('AI sunucusu geçerli bir PNG sonucu üretmedi.');
    return png;
  } finally { clearTimeout(handle); }
}
function startJob(photo) {
  const id = crypto.randomBytes(18).toString('hex');
  const abortController = new AbortController();
  const job = { id, state: 'processing', createdAt: Date.now(), finishedAt: 0, png: null, error: null, abortController };
  jobs.set(id, job);
  inProgress++;
  // Intentionally keep AI generation separate from the short HTTP upload request.
  // This prevents phone/proxy request timeouts during image generation.
  void runImageEdit(photo, abortController.signal).then(png => {
    if (job.state === 'cancelled') return;
    job.png = png; job.state = 'completed'; job.finishedAt = Date.now();
  }).catch(err => {
    if (job.state === 'cancelled') return;
    job.state = 'failed'; job.error = err?.message || 'AI üretimi başarısız.'; job.finishedAt = Date.now();
    console.error('Ü AI işi:', job.error);
  }).finally(() => { inProgress--; });
  return job;
}
function publicJob(job) {
  return { state: job.state, ...(job.state === 'failed' ? { error: job.error } : {}) };
}
const server = http.createServer(async (req, res) => {
  const pathname = (req.url || '').split('?')[0];
  cleanupJobs();
  if (pathname === '/favicon.ico' && req.method === 'GET') { res.writeHead(204); res.end(); return; }
  if ((pathname === '/' || pathname === '/index.html') && req.method === 'GET') {
    const buf = fs.readFileSync(path.join(__dirname, 'index.html'));
    res.writeHead(200, { ...commonHeaders('text/html; charset=utf-8'), 'Content-Length': buf.length }); res.end(buf); return;
  }
  if (pathname === '/api/health' && req.method === 'GET') { sendJSON(res, 200, { ok: true }); return; }
  if (pathname === '/api/status' && req.method === 'GET') {
    sendJSON(res, 200, { ready: !!API_KEY, requiresAccessCode: !!ACCESS_TOKEN, model: MODEL }); return;
  }
  if (pathname === '/api/character' && req.method === 'POST') {
    if (!sameOrigin(req)) { sendError(res, 403, 'İstek farklı bir siteden gönderilemez.'); return; }
    if (!API_KEY) { sendError(res, 503, 'Sunucuda OPENAI_API_KEY tanımlanmamış.'); return; }
    if (!authorized(req, res)) return;
    if (inProgress >= MAX_CONCURRENT) { sendError(res, 429, 'Sunucu meşgul. Biraz sonra tekrar dene.'); return; }
    if (!rateAllowed(req.socket.remoteAddress || 'unknown')) { sendError(res, 429, 'Çok fazla AI isteği gönderildi. Daha sonra tekrar dene.'); return; }
    try {
      if (!req.headers['content-type']?.startsWith('application/json'))
        throw Object.assign(new Error('İstek JSON biçiminde olmalı.'), { status: 415 });
      const data = await readBody(req);
      let parsed;
      try { parsed = JSON.parse(data.toString('utf8')); }
      catch { throw Object.assign(new Error('Fotoğraf verisi okunamadı.'), { status: 400 }); }
      const photo = decodePhoto(parsed?.image);
      const job = startJob(photo);
      sendJSON(res, 202, { jobId: job.id, state: 'processing' });
    } catch (err) { sendError(res, err.status || 400, err.message || 'Fotoğraf işlenemedi.'); }
    return;
  }
  const match = /^\/api\/jobs\/([a-f0-9]{36})(?:\/(image))?$/.exec(pathname);
  if (match) {
    if (!sameOrigin(req)) { sendError(res, 403, 'İstek farklı bir siteden gönderilemez.'); return; }
    if (!authorized(req, res)) return;
    const job = jobs.get(match[1]);
    if (!job) { sendError(res, 404, 'İş bulunamadı veya süresi doldu.'); return; }
    if (req.method === 'DELETE' && !match[2]) {
      if (job.state === 'processing') {
        job.state = 'cancelled'; job.abortController.abort(); job.finishedAt = Date.now();
      }
      job.png = null;
      sendJSON(res, 200, { cancelled: true }); return;
    }
    if (req.method === 'GET' && !match[2]) { sendJSON(res, 200, publicJob(job)); return; }
    if (req.method === 'GET' && match[2]) {
      if (job.state === 'completed' && job.png) sendPNG(res, job.png);
      else sendError(res, 409, 'Karakter henüz hazır değil.');
      return;
    }
  }
  sendError(res, 404, 'Adres bulunamadı.');
});
server.requestTimeout = 300000;
server.headersTimeout = 30000;
server.listen(PORT, HOST, () => console.log('Ü sunucusu http://' + HOST + ':' + PORT + ' — API ' + (API_KEY ? 'tanımlı' : 'EKSİK')));
