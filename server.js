require('dotenv').config();
var express = require('express');
var cors = require('cors');
var fetch = require('node-fetch');
var path = require('path');
var app = express();
var PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

var pharmacyCache = new Map();
var CACHE_TTL = 60 * 60 * 1000;

function getDateInfo() {
  var now = new Date();
  var daysT = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  var months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  var format = function(d) {
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + ' ' + daysT[d.getDay()];
  };
  var toISO = function(d) { return d.toISOString().split('T')[0]; };
  var yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  var tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  return {
    dun:   { label: format(yesterday), iso: toISO(yesterday) },
    bugun: { label: format(now),       iso: toISO(now) },
    yarin: { label: format(tomorrow),  iso: toISO(tomorrow) }
  };
}

var demoPharmacies = [
  { name: 'MERKEZ ECZANESİ',  dist: 'MERKEZ', address: 'Atatürk Cad. No:15',            phone: '0312 555 11 22', lat: '', lng: '' },
  { name: 'SAĞLIK ECZANESİ', dist: 'MERKEZ', address: 'Cumhuriyet Mah. 123 Sok. No:5',  phone: '0312 555 33 44', lat: '', lng: '' },
  { name: 'GÜVEN ECZANESİ',  dist: 'MERKEZ', address: 'İstiklal Cad. No:42',            phone: '0312 555 55 66', lat: '', lng: '' },
  { name: 'HAYAT ECZANESİ',  dist: 'MERKEZ', address: 'Yıldız Mah. Gül Sok. No:3',      phone: '0312 555 77 88', lat: '', lng: '' }
];

function nosyFetch(apiKey, il, ilce, tarih) {
  var apiUrl = 'https://www.nosyapi.com/api/nobetci-eczane'
    + '?apikey=' + encodeURIComponent(apiKey)
    + '&il=' + encodeURIComponent(il);
  if (ilce) apiUrl += '&ilce=' + encodeURIComponent(ilce);
  apiUrl += '&tarih=' + encodeURIComponent(tarih);
  return fetch(apiUrl, {
    headers: { 'Accept': 'application/json' }
  });
}

app.get('/api/eczaneler', async function(req, res) {
  var il    = (req.query.il    || '').trim();
  var ilce  = (req.query.ilce  || '').trim();
  var tarih = (req.query.tarih || '').trim();

  if (!il || !tarih) {
    return res.status(400).json({ error: 'il ve tarih gerekli' });
  }

  var apiKey = (process.env.NOSYAPI_KEY || '').trim();
  if (!apiKey) {
    return res.json({ pharmacies: demoPharmacies, demo: true });
  }

  var cacheKey = il + '|' + ilce + '|' + tarih;
  var cached = pharmacyCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return res.json({ pharmacies: cached.data });
  }

  try {
    var r = await nosyFetch(apiKey, il, ilce, tarih);

    if (!r.ok) {
      var errText = await r.text();
      return res.status(r.status).json({ error: 'API hatası: ' + r.status, detail: errText.slice(0, 200) });
    }

    var json = await r.json();

    var pharmacies = [];
    var rows = (json && (json.data || json.payload || json.result)) || [];
    if (!Array.isArray(rows) && json && Array.isArray(json)) rows = json;
    if (Array.isArray(rows)) {
      pharmacies = rows.map(function(p) {
        return {
          name:    p.EczaneAdi    || p.eczaneAdi    || p.name    || '',
          dist:    p.Ilce         || p.ilce         || p.dist    || '',
          address: p.Adres        || p.adres        || p.address || '',
          phone:   p.Telefon      || p.telefon      || p.phone   || '',
          lat:     p.Enlem        || p.enlem        || p.latitude  || p.lat || '',
          lng:     p.Boylam       || p.boylam       || p.longitude || p.lng || ''
        };
      });
    }

    pharmacyCache.set(cacheKey, { data: pharmacies, ts: Date.now() });
    res.json({ pharmacies: pharmacies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/nobetci-:slug', function(req, res, next) {
  var slug = req.params.slug;
  var iller = require('./data/iller');

  var il = iller.find(function(i) { return i.slug === slug; });
  if (il) {
    return res.render('il', {
      il: il,
      iller: iller,
      today: getDateInfo(),
      title: il.name + ' Nöbetçi Eczaneleri - Bugün Açık Eczaneler',
      description: 'Bugün ' + il.name + ' ilindeki nöbetçi eczaneleri bulun. Adres, telefon ve yol tarifi bilgileri.'
    });
  }

  for (var i = 0; i < iller.length; i++) {
    var cur = iller[i];
    if (slug.startsWith(cur.slug + '-')) {
      var ilceSlug = slug.slice(cur.slug.length + 1);
      var ilce = cur.districts.find(function(d) { return d.slug === ilceSlug; });
      if (ilce) {
        return res.render('ilce', {
          il: cur,
          ilce: ilce,
          iller: iller,
          today: getDateInfo(),
          title: cur.name + ' ' + ilce.name + ' Nöbetçi Eczaneleri',
          description: 'Bugün ' + cur.name + ' ' + ilce.name + ' ilçesindeki nöbetçi eczaneleri bulun.'
        });
      }
    }
  }

  next();
});

app.get('/', function(req, res) {
  var iller = require('./data/iller');
  res.render('home', {
    iller: iller,
    title: 'Türkiye Nöbetçi Eczane Rehberi - Bugün Açık Eczaneler',
    description: "Türkiye'nin 81 ilindeki nöbetçi eczaneleri bulun. Dün, bugün ve yarın nöbetçi eczaneleri arayın."
  });
});

app.get('/health', function(req, res) {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/test-nosyapi', async function(req, res) {
  var apiKey = (process.env.NOSYAPI_KEY || '').trim();
  if (!apiKey) return res.json({ error: 'NOSYAPI_KEY yok' });

  var il    = (req.query.il || 'istanbul').trim();
  var tarih = req.query.tarih || new Date().toISOString().split('T')[0];

  var base = 'https://www.nosyapi.com/api/nobetci-eczane';
  var urlWithKey   = base + '?apikey=' + encodeURIComponent(apiKey) + '&il=' + encodeURIComponent(il) + '&tarih=' + encodeURIComponent(tarih);
  var urlWithoutKey = base + '?il=' + encodeURIComponent(il) + '&tarih=' + encodeURIComponent(tarih);

  async function tryFetch(url, headers) {
    try {
      var r = await fetch(url, { headers: headers || { 'Accept': 'application/json' } });
      var text = await r.text();
      var parsed = null;
      try { parsed = JSON.parse(text); } catch(e) {}
      return { status: r.status, isHtml: text.trim().startsWith('<'), parsed: parsed, raw: text.slice(0, 200) };
    } catch(e) {
      return { error: e.message };
    }
  }

  var results = {};
  results.keyLength = apiKey.length;
  results.keyPreview = apiKey.slice(0, 6) + '...' + apiKey.slice(-4);
  results.method1_queryParam = await tryFetch(urlWithKey);
  results.method2_bearer = await tryFetch(urlWithoutKey, { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' });

  res.json(results);
});

app.get('/debug-env', function(req, res) {
  var key = (process.env.NOSYAPI_KEY || '').trim();
  res.json({
    NOSYAPI_KEY: key ? 'VAR (' + key.length + ' karakter, ilk6: ' + key.slice(0,6) + ')' : 'YOK',
    PORT: PORT
  });
});

app.listen(PORT, '0.0.0.0', function() {
  console.log('CALISIYOR port=' + PORT);
  console.log('NOSYAPI_KEY=' + (process.env.NOSYAPI_KEY ? 'VAR' : 'YOK - demo mod aktif'));
});
