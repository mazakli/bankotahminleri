require('dotenv').config();
var express = require('express');
var cors    = require('cors');
var fetch   = require('node-fetch');
var path    = require('path');
var crypto  = require('crypto');
var app     = express();
var PORT    = process.env.PORT || 3001;

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Güvenlik başlıkları ──────────────────────────────────────────────
app.use(function (req, res, next) {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(self), camera=()');
  if (req.path.startsWith('/widget')) {
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
  } else {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net unpkg.com; " +
      "style-src 'self' 'unsafe-inline' cdn.jsdelivr.net unpkg.com cdnjs.cloudflare.com fonts.googleapis.com; " +
      "font-src 'self' fonts.gstatic.com cdnjs.cloudflare.com data:; " +
      "img-src 'self' data: *.tile.openstreetmap.org *.openstreetmap.org; " +
      "connect-src 'self' router.project-osrm.org; " +
      "frame-src 'none';"
    );
  }
  next();
});

// ── Basit rate limiter (paket gerektirmez) ───────────────────────────
var _rlMap = new Map();
setInterval(function () {
  var cutoff = Math.floor(Date.now() / 60000) - 2;
  _rlMap.forEach(function (_, k) { if (+k.split('|')[1] < cutoff) _rlMap.delete(k); });
}, 120000);
function rateLimit(max) {
  return function (req, res, next) {
    var key = req.ip + '|' + Math.floor(Date.now() / 60000);
    var cnt = (_rlMap.get(key) || 0) + 1;
    _rlMap.set(key, cnt);
    if (cnt > max) return res.status(429).json({ error: 'Çok fazla istek. Lütfen bir dakika bekleyin.' });
    next();
  };
}

// non-www → www (301 kalıcı yönlendirme, SEO için zorunlu)
app.use(function (req, res, next) {
  if (req.hostname === '724eczane.com') {
    return res.redirect(301, 'https://www.724eczane.com' + req.originalUrl);
  }
  next();
});

var NOSY_BASE = 'https://www.nosyapi.com/apiv2/service/';
var REFRESH_HOURS_TR = [9, 12, 15, 17, 19];

var cityCache = new Map();

function toSlug(str) {
  return (str || '')
    .replace(/İ/g, 'i').replace(/ı/g, 'i')
    .replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u').replace(/[Öö]/g, 'o')
    .replace(/[Çç]/g, 'c')
    .toLowerCase().replace(/\s+/g, '-');
}

function nosyHeaders(apiKey) {
  return { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' };
}

function parseRow(p) {
  return {
    name:     p.pharmacyName || '',
    dist:     p.district     || '',
    address:  p.address      || '',
    phone:    p.phone        || '',
    lat:      p.latitude     || '',
    lng:      p.longitude    || '',
    distSlug: toSlug(p.district || '')
  };
}

function todayISO() { return new Date().toISOString().split('T')[0]; }

function lastRefreshHour() {
  var now = new Date();
  var trHour = new Date(now.getTime() + 3 * 60 * 60 * 1000).getUTCHours();
  var last = null;
  for (var i = 0; i < REFRESH_HOURS_TR.length; i++) {
    if (REFRESH_HOURS_TR[i] <= trHour) last = REFRESH_HOURS_TR[i];
  }
  return last;
}

async function getCityPharmacies(apiKey, citySlug, distSlug, date) {
  var cacheKey = citySlug + '|' + date + '|h' + lastRefreshHour();
  var cached = cityCache.get(cacheKey);
  if (cached) return cached;

  var url = NOSY_BASE + 'pharmacies-on-duty?city=' + encodeURIComponent(citySlug) + '&date=' + encodeURIComponent(date);
  var r    = await fetch(url, { headers: nosyHeaders(apiKey) });
  if (!r.ok) {
    var errText = await r.text();
    throw new Error('NosyAPI ' + r.status + ': ' + errText.slice(0, 200));
  }
  var json = await r.json();
  var rows = (json && json.data) || [];
  var parsed = Array.isArray(rows) ? rows.map(parseRow) : [];
  cityCache.set(cacheKey, parsed);
  console.log('[cache] ' + citySlug + ' ' + date + ' — ' + parsed.length + ' eczane (1 kredi)');
  return parsed;
}

function msUntilNextRefresh() {
  var now   = new Date();
  var trNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  var minutesPassed = trNow.getUTCHours() * 60 + trNow.getUTCMinutes();
  var nextHour = null;
  for (var i = 0; i < REFRESH_HOURS_TR.length; i++) {
    if (REFRESH_HOURS_TR[i] * 60 > minutesPassed) { nextHour = REFRESH_HOURS_TR[i]; break; }
  }
  if (nextHour === null) nextHour = REFRESH_HOURS_TR[0] + 24;
  var trSec = trNow.getUTCSeconds(), trMs = trNow.getUTCMilliseconds();
  return (nextHour * 60 - minutesPassed) * 60 * 1000 - trSec * 1000 - trMs;
}

function scheduleNextRefresh() {
  var ms = msUntilNextRefresh();
  console.log('[cache] temizleme: ' + new Date(Date.now() + ms).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }));
  setTimeout(function () {
    cityCache.clear();
    console.log('[cache] temizlendi');
    scheduleNextRefresh();
  }, ms);
}

function getDateInfo() {
  var now = new Date();
  var daysT  = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  var months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  var fmt = function (d) { return d.getDate()+' '+months[d.getMonth()]+' '+d.getFullYear()+' '+daysT[d.getDay()]; };
  var iso = function (d) { return d.toISOString().split('T')[0]; };
  var y = new Date(now); y.setDate(now.getDate()-1);
  var t = new Date(now); t.setDate(now.getDate()+1);
  return {
    dun:   { label: fmt(y),   iso: iso(y) },
    bugun: { label: fmt(now), iso: iso(now) },
    yarin: { label: fmt(t),   iso: iso(t) }
  };
}

var demoPharmacies = [
  { name:'MERKEZ ECZANESİ',  dist:'MERKEZ', address:'Atatürk Cad. No:15',            phone:'0312 555 11 22', lat:'', lng:'' },
  { name:'SAĞLIK ECZANESİ', dist:'MERKEZ', address:'Cumhuriyet Mah. 123 Sok. No:5', phone:'0312 555 33 44', lat:'', lng:'' },
  { name:'GÜVEN ECZANESİ',  dist:'MERKEZ', address:'İstiklal Cad. No:42',           phone:'0312 555 55 66', lat:'', lng:'' },
  { name:'HAYAT ECZANESİ',  dist:'MERKEZ', address:'Yıldız Mah. Gül Sok. No:3',     phone:'0312 555 77 88', lat:'', lng:'' }
];

app.get('/api/eczaneler', rateLimit(30), async function (req, res) {
  var citySlug = (req.query.il    || '').trim();
  var distSlug = (req.query.ilce  || '').trim();
  var date     = (req.query.tarih || '').trim();
  if (!citySlug || !date) return res.status(400).json({ error: 'il ve tarih gerekli' });
  var apiKey = (process.env.NOSYAPI_KEY || '').trim();
  if (!apiKey) return res.json({ pharmacies: demoPharmacies, demo: true });
  try {
    var pharmacies = await getCityPharmacies(apiKey, citySlug, distSlug, date);
    if (distSlug) pharmacies = pharmacies.filter(function (p) { return p.distSlug === distSlug; });
    res.json({ pharmacies: pharmacies });
  } catch (err) {
    console.error('[api/eczaneler] ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cache-status', function (req, res) {
  var ms = msUntilNextRefresh();
  var keys = [];
  cityCache.forEach(function (v, k) { keys.push(k + ' (' + v.length + ')'); });
  res.json({
    cachedCities:  keys,
    totalCached:   cityCache.size,
    nextRefresh:   new Date(Date.now() + ms).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
    refreshHours:  REFRESH_HOURS_TR,
    currentTRHour: new Date(new Date().getTime() + 3*60*60*1000).getUTCHours()
  });
});

app.get('/api/test-city', async function (req, res) {
  var apiKey = (process.env.NOSYAPI_KEY || '').trim();
  if (!apiKey) return res.json({ error: 'NOSYAPI_KEY yok' });
  var city = (req.query.city || 'istanbul').trim();
  var date = (req.query.date || todayISO()).trim();
  var url  = NOSY_BASE + 'pharmacies-on-duty?city=' + encodeURIComponent(city) + '&date=' + encodeURIComponent(date);
  try {
    var r    = await fetch(url, { headers: nosyHeaders(apiKey) });
    var text = await r.text();
    var json = null;
    try { json = JSON.parse(text); } catch(e) {}
    var rows = json && json.data;
    var firstRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    res.json({
      status:      r.status,
      city:        city,
      date:        date,
      url:         url,
      rowCount:    Array.isArray(rows) ? rows.length : null,
      firstRowKeys: firstRow ? Object.keys(firstRow) : null,
      firstRow:    firstRow,
      rawSlice:    text.slice(0, 400)
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// ── Google Indexing API ──────────────────────────────────────────────
function b64url(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function googleAccessToken() {
  var email = (process.env.GOOGLE_CLIENT_EMAIL || '').trim();
  var key   = (process.env.GOOGLE_PRIVATE_KEY  || '').replace(/\\n/g, '\n').trim();
  if (!email || !key) return null;
  var now  = Math.floor(Date.now() / 1000);
  var hdr  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var pay  = b64url(JSON.stringify({ iss: email, scope: 'https://www.googleapis.com/auth/indexing', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now }));
  var sign = crypto.createSign('RSA-SHA256');
  sign.update(hdr + '.' + pay);
  var sig = sign.sign(key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  var jwt = hdr + '.' + pay + '.' + sig;
  var r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt,
  });
  var data = await r.json();
  return data.access_token || null;
}

async function googleIndexUrl(url, type) {
  var token = await googleAccessToken();
  if (!token) return { error: 'GOOGLE_CLIENT_EMAIL veya GOOGLE_PRIVATE_KEY eksik' };
  var r = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ url: url, type: type || 'URL_UPDATED' }),
  });
  return await r.json();
}

// URL'leri Google'a gönder — ADMIN_KEY header ile korunur
app.post('/api/indexing/submit', async function (req, res) {
  if ((req.headers['x-admin-key'] || '') !== (process.env.ADMIN_KEY || '')) {
    return res.status(403).json({ error: 'Yetkisiz' });
  }
  var urls  = req.body.urls;
  var type  = req.body.type || 'URL_UPDATED';
  if (!Array.isArray(urls) || urls.length === 0) return res.status(400).json({ error: 'urls dizisi gerekli' });
  var results = [];
  for (var u of urls) {
    try {
      var r = await googleIndexUrl(u, type);
      results.push({ url: u, result: r });
    } catch (e) {
      results.push({ url: u, error: e.message });
    }
  }
  res.json({ submitted: results.length, results: results });
});

// Temel sayfaları Google'a tek seferde gönder
app.get('/api/indexing/submit-core', async function (req, res) {
  if ((req.query.key || '') !== (process.env.ADMIN_KEY || '')) {
    return res.status(403).json({ error: 'Yetkisiz' });
  }
  var base = 'https://www.724eczane.com';
  var coreUrls = ['/', '/eczane-ekle', '/sitene-ekle', '/iletisim'].map(function (p) { return base + p; });
  var iller2 = require('./data/iller');
  iller2.forEach(function (il) { coreUrls.push(base + '/nobetci-' + il.slug); });
  var results = [];
  for (var u of coreUrls) {
    try { results.push({ url: u, result: await googleIndexUrl(u, 'URL_UPDATED') }); }
    catch (e) { results.push({ url: u, error: e.message }); }
  }
  res.json({ submitted: results.length, results: results });
});

// ── Eczane başvurusu kaydet (Railway loglarına düşer) ───────────────────
app.post('/api/eczane-ekle', function (req, res) {
  var d = req.body || {};
  console.log('[eczane-ekle] Başvuru: ' + (d.name||'?') + ' / ' + (d.il||'?') + ' / ' + (d.ilce||'?') + ' / ' + (d.phone||'?'));
  res.json({ success: true });
});

// Sitemap (SEO)
app.get('/sitemap.xml', function (req, res) {
  var iller = require('./data/iller');
  var base  = 'https://www.724eczane.com';
  var today = new Date().toISOString().split('T')[0];
  var urls  = [
    { loc: base + '/',                    priority: '1.0', freq: 'daily'   },
    { loc: base + '/sitene-ekle',         priority: '0.6', freq: 'monthly' },
    { loc: base + '/eczane-ekle',         priority: '0.6', freq: 'monthly' },
    { loc: base + '/iletisim',            priority: '0.5', freq: 'monthly' },
    { loc: base + '/gizlilik',            priority: '0.3', freq: 'yearly'  },
    { loc: base + '/kullanim-kosullari',  priority: '0.3', freq: 'yearly'  },
    { loc: base + '/cerez-politikasi',    priority: '0.3', freq: 'yearly'  },
  ];
  iller.forEach(function (il) {
    urls.push({ loc: base + '/nobetci-' + il.slug, priority: '0.8', freq: 'daily' });
    il.districts.forEach(function (d) {
      urls.push({ loc: base + '/nobetci-' + il.slug + '-' + d.slug, priority: '0.7', freq: 'daily' });
    });
  });
  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  urls.forEach(function (u) {
    xml += '  <url><loc>' + u.loc + '</loc><changefreq>' + u.freq + '</changefreq><priority>' + u.priority + '</priority><lastmod>' + today + '</lastmod></url>\n';
  });
  xml += '</urlset>';
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
});

app.get('/nobetci-:slug', function (req, res, next) {
  var slug  = req.params.slug;
  var iller = require('./data/iller');
  var il    = iller.find(function (i) { return i.slug === slug; });
  if (il) return res.render('il', { il: il, iller: iller, today: getDateInfo(), title: il.name + ' Nöbetçi Eczaneleri | 724eczane.com', description: 'Bugün ' + il.name + ' ilindeki nöbetçi eczaneleri. Adres, telefon ve yol tarifi bilgileriyle güncel liste — 724eczane.com' });
  for (var i = 0; i < iller.length; i++) {
    var cur = iller[i];
    if (slug.startsWith(cur.slug + '-')) {
      var ilceSlug = slug.slice(cur.slug.length + 1);
      var ilce = cur.districts.find(function (d) { return d.slug === ilceSlug; });
      if (ilce) return res.render('ilce', { il: cur, ilce: ilce, iller: iller, today: getDateInfo(), title: cur.name + ' ' + ilce.name + ' Nöbetçi Eczaneleri | 724eczane.com', description: 'Bugün ' + cur.name + ' ' + ilce.name + ' ilçesindeki nöbetçi eczaneleri. Adres, telefon ve yol tarifi bilgileriyle güncel liste.' });
    }
  }
  next();
});

app.get('/', function (req, res) {
  var iller = require('./data/iller');
  res.render('home', { iller: iller, title: 'Türkiye Nöbetçi Eczane Rehberi | 724eczane.com', description: "Türkiye'nin 81 ilinde nöbetçi eczaneleri anında bulun. İl ve ilçe bazlı güncel nöbetçi eczane listesi — 724eczane.com" });
});

app.get('/widget', function (req, res) {
  var iller    = require('./data/iller');
  var ilSlug   = (req.query.il   || '').trim();
  var ilceSlug = (req.query.ilce || '').trim();
  var il = iller.find(function (i) { return i.slug === ilSlug; });
  if (!il) return res.status(404).send('İl bulunamadı');
  var ilce = ilceSlug ? (il.districts.find(function (d) { return d.slug === ilceSlug; }) || null) : null;
  res.render('widget', { il: il, ilce: ilce, today: getDateInfo() });
});

app.get('/sitene-ekle', function (req, res) {
  var iller = require('./data/iller');
  res.render('sitene-ekle', { iller: iller, title: 'Sitenize Nöbetçi Eczane Ekleyin | 724eczane.com', description: 'Tek satır kod ile nöbetçi eczane listesini sitenize ücretsiz ekleyin. İl ve ilçe seçin, iframe kodunu kopyalayın.' });
});

app.get('/eczane-ekle', function (req, res) {
  var iller = require('./data/iller');
  res.render('eczane-ekle', { iller: iller, title: 'Eczanenizi Ekleyin | 724eczane.com', description: 'Nöbetçi eczane listemize eczanenizi ücretsiz ekleyin. Adres, telefon ve konum bilgilerinizi girin.' });
});

app.get('/iletisim', function (req, res) {
  var iller = require('./data/iller');
  res.render('iletisim', { iller: iller, title: 'İletişim | 724eczane.com', description: '724eczane.com ile iletişime geçin. Soru, öneri ve geri bildirimleriniz için bize ulaşın.' });
});

app.get('/gizlilik', function (req, res) {
  var iller = require('./data/iller');
  res.render('gizlilik', { iller: iller, title: 'Gizlilik Politikası | 724eczane.com', description: '724eczane.com gizlilik politikası. Kişisel verilerinizin nasıl toplandığını ve kullanıldığını öğrenin.' });
});

app.get('/kullanim-kosullari', function (req, res) {
  var iller = require('./data/iller');
  res.render('kullanim-kosullari', { iller: iller, title: 'Kullanım Koşulları | 724eczane.com', description: '724eczane.com kullanım koşulları. Siteyi kullanmadan önce lütfen bu koşulları okuyunuz.' });
});

app.get('/cerez-politikasi', function (req, res) {
  res.render('cerez-politikasi', { title: 'Çerez Politikası | 724eczane.com', description: '724eczane.com çerez politikası. Sitede kullanılan çerezler ve kişisel veri işleme hakkında bilgi edinin.' });
});

app.get('/health',    function (req, res) { res.json({ status: 'ok', time: new Date().toISOString() }); });
app.get('/debug-env', function (req, res) {
  var adminKey = process.env.ADMIN_KEY || '';
  if (!adminKey || (req.query.key || '') !== adminKey) return res.status(404).send('Not found');
  var key = (process.env.NOSYAPI_KEY || '').trim();
  res.json({ NOSYAPI_KEY: key ? 'VAR (' + key.length + ' karakter)' : 'YOK', PORT: PORT });
});

app.listen(PORT, '0.0.0.0', function () {
  console.log('CALISIYOR port=' + PORT);
  scheduleNextRefresh();
});
