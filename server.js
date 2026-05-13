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

// Günlük önbellek — tarih değişince otomatik yenilenir
var allCache = { date: null, data: [] };
var cacheLoading = false;
var cacheCallbacks = [];

function toSlug(str) {
  return (str || '').toLowerCase()
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o')
    .replace(/ç/g, 'c').replace(/\s+/g, '-');
}

function nosyHeaders(apiKey) {
  return { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' };
}

function parseRow(p) {
  return {
    name:        p.pharmacyName || '',
    dist:        p.district     || '',
    address:     p.address      || '',
    phone:       p.phone        || '',
    lat:         p.latitude     || '',
    lng:         p.longitude    || '',
    citySlug:    toSlug(p.city     || ''),
    distSlug:    toSlug(p.district || '')
  };
}

async function fetchAllPharmacies(apiKey, date) {
  if (allCache.date === date && allCache.data.length > 0) return allCache.data;

  // Eş zamanlı istekler için tek fetch
  if (cacheLoading) {
    return new Promise(function (resolve) { cacheCallbacks.push(resolve); });
  }

  cacheLoading = true;
  try {
    var url = NOSY_BASE + 'pharmacies-on-duty/all?date=' + encodeURIComponent(date);
    var r   = await fetch(url, { headers: nosyHeaders(apiKey) });
    var json = await r.json();
    var rows = (json && json.data) || [];
    var parsed = Array.isArray(rows) ? rows.map(parseRow) : [];
    allCache = { date: date, data: parsed };
    console.log('[cache] ' + date + ' — ' + parsed.length + ' eczane yüklendi');
    cacheCallbacks.forEach(function (cb) { cb(parsed); });
    return parsed;
  } finally {
    cacheLoading = false;
    cacheCallbacks = [];
  }
}

function todayISO() { return new Date().toISOString().split('T')[0]; }

function getDateInfo() {
  var now    = new Date();
  var daysT  = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  var months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  var fmt   = function (d) { return d.getDate()+' '+months[d.getMonth()]+' '+d.getFullYear()+' '+daysT[d.getDay()]; };
  var iso   = function (d) { return d.toISOString().split('T')[0]; };
  var y = new Date(now); y.setDate(now.getDate()-1);
  var t = new Date(now); t.setDate(now.getDate()+1);
  return {
    dun:   { label: fmt(y), iso: iso(y) },
    bugun: { label: fmt(now), iso: iso(now) },
    yarin: { label: fmt(t), iso: iso(t) }
  };
}

var demoPharmacies = [
  { name:'MERKEZ ECZANESİ',  dist:'MERKEZ', address:'Atatürk Cad. No:15',            phone:'0312 555 11 22', lat:'', lng:'' },
  { name:'SAĞLIK ECZANESİ', dist:'MERKEZ', address:'Cumhuriyet Mah. 123 Sok. No:5', phone:'0312 555 33 44', lat:'', lng:'' },
  { name:'GÜVEN ECZANESİ',  dist:'MERKEZ', address:'İstiklal Cad. No:42',          phone:'0312 555 55 66', lat:'', lng:'' },
  { name:'HAYAT ECZANESİ',  dist:'MERKEZ', address:'Yıldız Mah. Gül Sok. No:3', phone:'0312 555 77 88', lat:'', lng:'' }
];

app.get('/api/eczaneler', async function (req, res) {
  var citySlug = (req.query.il    || '').trim();
  var distSlug = (req.query.ilce  || '').trim();
  var date     = (req.query.tarih || '').trim();

  if (!citySlug || !date) return res.status(400).json({ error: 'il ve tarih gerekli' });

  var apiKey = (process.env.NOSYAPI_KEY || '').trim();
  if (!apiKey) return res.json({ pharmacies: demoPharmacies, demo: true });

  try {
    var all = await fetchAllPharmacies(apiKey, date);
    var filtered = all.filter(function (p) {
      if (p.citySlug !== citySlug) return false;
      if (distSlug && p.distSlug !== distSlug) return false;
      return true;
    });
    res.json({ pharmacies: filtered, cached: allCache.date === date, total: all.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cache-status', function (req, res) {
  res.json({
    cacheDate:  allCache.date,
    today:      todayISO(),
    totalRows:  allCache.data.length,
    isToday:    allCache.date === todayISO()
  });
});

app.get('/nobetci-:slug', function (req, res, next) {
  var slug  = req.params.slug;
  var iller = require('./data/iller');
  var il    = iller.find(function (i) { return i.slug === slug; });
  if (il) {
    return res.render('il', {
      il: il, iller: iller, today: getDateInfo(),
      title: il.name + ' Nöbetçi Eczaneleri - Bugün Açık Eczaneler',
      description: 'Bugün ' + il.name + ' ilindeki nöbetçi eczaneleri bulun.'
    });
  }
  for (var i = 0; i < iller.length; i++) {
    var cur = iller[i];
    if (slug.startsWith(cur.slug + '-')) {
      var ilceSlug = slug.slice(cur.slug.length + 1);
      var ilce = cur.districts.find(function (d) { return d.slug === ilceSlug; });
      if (ilce) {
        return res.render('ilce', {
          il: cur, ilce: ilce, iller: iller, today: getDateInfo(),
          title: cur.name + ' ' + ilce.name + ' Nöbetçi Eczaneleri',
          description: 'Bugün ' + cur.name + ' ' + ilce.name + ' ilçesindeki nöbetçi eczaneleri bulun.'
        });
      }
    }
  }
  next();
});

app.get('/', function (req, res) {
  var iller = require('./data/iller');
  res.render('home', {
    iller: iller,
    title: 'Türkiye Nöbetçi Eczane Rehberi - Bugün Açık Eczaneler',
    description: "Türkiye'nin 81 ilindeki nöbetçi eczaneleri bulun."
  });
});

app.get('/health',    function (req, res) { res.json({ status: 'ok', time: new Date().toISOString() }); });
app.get('/debug-env', function (req, res) {
  var key = (process.env.NOSYAPI_KEY || '').trim();
  res.json({ NOSYAPI_KEY: key ? 'VAR (' + key.length + ' karakter)' : 'YOK', PORT: PORT });
});

app.listen(PORT, '0.0.0.0', function () {
  console.log('CALISIYOR port=' + PORT);
  var apiKey = (process.env.NOSYAPI_KEY || '').trim();
  if (apiKey) {
    // Sunucu açılınca bugünün verisini önbelleğe al
    fetchAllPharmacies(apiKey, todayISO()).catch(function (e) {
      console.error('[cache] ön yükleme hatası:', e.message);
    });
  }
});
