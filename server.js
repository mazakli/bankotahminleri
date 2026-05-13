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

var NOSY_BASE = 'https://www.nosyapi.com/apiv2/service/';

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

function nosyHeaders(apiKey) {
  return { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' };
}

function nosyFetch(apiKey, il, ilce, tarih) {
  var url = NOSY_BASE + 'pharmacies-on-duty'
    + '?il=' + encodeURIComponent(il);
  if (ilce) url += '&ilce=' + encodeURIComponent(ilce);
  url += '&tarih=' + encodeURIComponent(tarih);
  return fetch(url, { headers: nosyHeaders(apiKey) });
}

function parsePharmacies(json) {
  var rows = (json && (json.data || json.payload || json.result)) || [];
  if (!Array.isArray(rows) && Array.isArray(json)) rows = json;
  if (!Array.isArray(rows)) return [];
  return rows.map(function(p) {
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
    var text = await r.text();
    var json;
    try { json = JSON.parse(text); } catch(e) {
      return res.status(502).json({ error: 'API JSON döndürmedi', raw: text.slice(0, 200) });
    }
    var pharmacies = parsePharmacies(json);
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

  var tarih = req.query.tarih || new Date().toISOString().split('T')[0];
  var hdrs = nosyHeaders(apiKey);

  async function tryUrl(url) {
    try {
      var r = await fetch(url, { headers: hdrs });
      var text = await r.text();
      var parsed = null;
      try { parsed = JSON.parse(text); } catch(e) {}
      var rows = parsed && (parsed.data || parsed.result || parsed.payload);
      var firstRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      return {
        status: r.status,
        rowCount: parsed && parsed.rowCount,
        firstRowKeys: firstRow ? Object.keys(firstRow) : null,
        firstRow: firstRow,
        raw: text.slice(0, 400)
      };
    } catch(e) { return { error: e.message }; }
  }

  var citiesUrl   = NOSY_BASE + 'pharmacies-on-duty/cities';
  var istanbulTR  = NOSY_BASE + 'pharmacies-on-duty?il=' + encodeURIComponent('İstanbul') + '&tarih=' + encodeURIComponent(tarih);
  var istanbulEN  = NOSY_BASE + 'pharmacies-on-duty?il=istanbul&tarih=' + encodeURIComponent(tarih);
  var istanbulUP  = NOSY_BASE + 'pharmacies-on-duty?il=ISTANBUL&tarih=' + encodeURIComponent(tarih);

  res.json({
    cities_sample: await tryUrl(citiesUrl),
    istanbul_tr:   await tryUrl(istanbulTR),
    istanbul_en:   await tryUrl(istanbulEN),
    istanbul_upper: await tryUrl(istanbulUP)
  });
});

app.get('/debug-env', function(req, res) {
  var key = (process.env.NOSYAPI_KEY || '').trim();
  res.json({
    NOSYAPI_KEY: key ? 'VAR (' + key.length + ' karakter)' : 'YOK',
    PORT: PORT
  });
});

app.listen(PORT, '0.0.0.0', function() {
  console.log('CALISIYOR port=' + PORT);
  console.log('NOSYAPI_KEY=' + (process.env.NOSYAPI_KEY ? 'VAR' : 'YOK - demo mod aktif'));
});
