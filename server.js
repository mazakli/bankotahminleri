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

app.get('/api/eczaneler', async function(req, res) {
  var il    = (req.query.il    || '').trim();
  var ilce  = (req.query.ilce  || '').trim();
  var tarih = (req.query.tarih || '').trim();

  if (!il || !tarih) {
    return res.status(400).json({ error: 'il ve tarih gerekli' });
  }

  var apiKey = process.env.NOSYAPI_KEY;
  if (!apiKey) {
    return res.json({ pharmacies: demoPharmacies, demo: true });
  }

  var cacheKey = il + '|' + ilce + '|' + tarih;
  var cached = pharmacyCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return res.json({ pharmacies: cached.data });
  }

  try {
    var apiUrl = 'https://www.nosyapi.com/apidoc/nobetci-eczane'
      + '?apikey=' + encodeURIComponent(apiKey)
      + '&il=' + encodeURIComponent(il);
    if (ilce) apiUrl += '&ilce=' + encodeURIComponent(ilce);
    apiUrl += '&tarih=' + encodeURIComponent(tarih);

    var r = await fetch(apiUrl);

    if (!r.ok) {
      var errText = await r.text();
      return res.status(r.status).json({ error: 'API hatası: ' + r.status, detail: errText.slice(0, 200) });
    }

    var json = await r.json();

    var pharmacies = [];
    if (json && json.data && Array.isArray(json.data)) {
      pharmacies = json.data.map(function(p) {
        return {
          name:    p.eczaneAdi    || p.name    || '',
          dist:    p.ilce         || p.dist    || '',
          address: p.adres        || p.address || '',
          phone:   p.telefon      || p.phone   || '',
          lat:     p.enlem        || p.latitude  || p.lat || '',
          lng:     p.boylam       || p.longitude || p.lng || ''
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

app.get('/debug-env', function(req, res) {
  res.json({
    NOSYAPI_KEY: process.env.NOSYAPI_KEY ? 'VAR (' + process.env.NOSYAPI_KEY.length + ' karakter)' : 'YOK',
    PORT: PORT
  });
});

app.listen(PORT, '0.0.0.0', function() {
  console.log('CALISIYOR port=' + PORT);
  console.log('NOSYAPI_KEY=' + (process.env.NOSYAPI_KEY ? 'VAR' : 'YOK - demo mod aktif'));
});
