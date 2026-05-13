require('dotenv').config();
var express = require('express');
var cors    = require('cors');
var fetch   = require('node-fetch');
var path    = require('path');
var app     = express();
var PORT    = process.env.PORT || 3001;

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.get('/api/eczaneler', async function (req, res) {
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

app.get('/health',    function (req, res) { res.json({ status: 'ok', time: new Date().toISOString() }); });
app.get('/debug-env', function (req, res) {
  var key = (process.env.NOSYAPI_KEY || '').trim();
  res.json({ NOSYAPI_KEY: key ? 'VAR (' + key.length + ' karakter)' : 'YOK', PORT: PORT });
});

app.listen(PORT, '0.0.0.0', function () {
  console.log('CALISIYOR port=' + PORT);
  scheduleNextRefresh();
});
