'use strict';

// ── TJK (Türkiye Jokey Kulübü) API İstemcisi ────────────────────────
// Kaynak: ebayi.tjk.org/s/d/ — PHP kütüphane: SezerFidanci/TJK-API

var fetch = require('node-fetch');
var https = require('https');

var BASE_URL = 'https://ebayi.tjk.org/s/d/';

var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8',
  'Accept-Encoding': 'gzip, deflate',
  'Referer': 'https://www.tjk.org/',
  'Origin': 'https://www.tjk.org',
  'Connection': 'keep-alive',
};

// SSL sertifika doğrulamasını devre dışı bırak (PHP kütüphanesindeki gibi)
var sslAgent = new https.Agent({ rejectUnauthorized: false });

// ── Önbellek ─────────────────────────────────────────────────────────
var apiCache = new Map();
var CACHE_TTL = 10 * 60 * 1000; // 10 dakika

function cacheGet(key) {
  var entry = apiCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function cacheSet(key, data) {
  apiCache.set(key, { data: data, ts: Date.now() });
}

// ── HTTP İsteği ───────────────────────────────────────────────────────
async function fetchJson(url) {
  var cached = cacheGet(url);
  if (cached) {
    console.log('[tjk-api] önbellekten:', url);
    return cached;
  }

  console.log('[tjk-api] istek:', url);
  var r = await fetch(url, {
    headers: HEADERS,
    agent: sslAgent,
    timeout: 20000,
  });

  if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + url);

  var text = await r.text();
  var data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('JSON parse hatası — ' + url + ' — ' + text.slice(0, 200));
  }

  cacheSet(url, data);
  return data;
}

// Tarih: '2026-05-14' → '20260514'
function toYmd(tarih) {
  return tarih.replace(/-/g, '');
}

// ── Ham TJK Endpoints ─────────────────────────────────────────────────
async function fetchYarislarListesi(tarih) {
  return fetchJson(BASE_URL + 'program/' + toYmd(tarih) + '/yarislar.json');
}

async function fetchProgramDetay(tarih, hipSlug) {
  return fetchJson(BASE_URL + 'program/' + toYmd(tarih) + '/full/' + encodeURIComponent(hipSlug) + '.json');
}

async function fetchSonuclarListesi(tarih) {
  return fetchJson(BASE_URL + 'sonuclar/' + toYmd(tarih) + '/yarislar.json');
}

async function fetchSonuclarDetay(tarih, hipSlug) {
  return fetchJson(BASE_URL + 'sonuclar/' + toYmd(tarih) + '/full/' + encodeURIComponent(hipSlug) + '.json');
}

// ── Veri Normalleştirici ──────────────────────────────────────────────
// TJK'dan gelen alanlar büyük/küçük harf, Türkçe/İngilizce karışık olabilir

function str(v) { return (v || '').toString().trim(); }
function num(v) { return parseFloat(v) || 0; }
function intVal(v) { return parseInt(v) || 0; }

function normalizeAt(at, idx) {
  // TJK gerçek alanlar: NO, AD, KILO, JOKEYADI, ANTRENORADI, BABA, ANNE, SAHIPADI, SON6, AGF1, GANYAN
  var agfRaw = str(at.AGF1 || at.agf || at.AGF || '0').replace(',', '.');
  var agfVal = parseFloat(agfRaw) || 0;
  return {
    no:       intVal(at.NO || at.AtNo || at.atNo || at.no) || (idx + 1),
    ad:       str(at.AD || at.AtAdi || at.atAdi || at.ad),
    kilo:     num(at.KILO || at.Kilo || at.kilo),
    jokey:    str(at.JOKEYADI || at.JokeyAdi || at.jokeyAdi || at.jokey),
    antrenor: str(at.ANTRENORADI || at.AntrenorAdi || at.antrenorAdi || at.antrenor),
    baba:     str(at.BABA || at.BabaAdi || at.babaAdi || at.baba),
    anne:     str(at.ANNE || at.AnneAdi || at.anneAdi || at.anne),
    sahibi:   str(at.SAHIPADI || at.SahibiAdi || at.sahibiAdi || at.sahip),
    son5:     str(at.SON6 || at.Son5 || at.son5 || at.SonDerece || ''),
    agf:      agfVal,
    ganyan:   str(at.GANYAN || at.ganyan || ''),
  };
}

function normalizeKosu(kosu, idx) {
  // TJK gerçek alanlar: NO, SAAT, MESAFE, PISTADI_TR, GRUP_TR, CINSDETAY_TR, CINSIYET, ikramiyeler, atlar
  var atlar = kosu.atlar || kosu.Atlar || kosu.Deklareler || kosu.deklareler || [];
  var ikramiyeler = kosu.ikramiyeler || [];
  var ikramiye1 = str(ikramiyeler[0] || '');
  // "595.000,00" → 595000
  var ikramiyeInt = ikramiye1 ? parseInt(ikramiye1.replace(/\./g, '').replace(',', '.')) : 0;
  var ikramiyeStr = ikramiye1 ? ikramiye1.split(',')[0].replace(/\./g, '') + ' TL' : '-';

  return {
    no:          intVal(kosu.NO || kosu.KosuNo || kosu.kosuNo || kosu.no) || (idx + 1),
    saat:        str(kosu.SAAT || kosu.BaslangicSaati || kosu.saat),
    mesafe:      intVal(kosu.MESAFE || kosu.Mesafe || kosu.mesafe),
    pist:        str(kosu.PISTADI_TR || kosu.PistCinsi || kosu.pist || kosu.PIST),
    yas:         str(kosu.GRUP_TR || kosu.YasGrubu || kosu.yas),
    cins:        str(kosu.CINSDETAY_TR || kosu.CINSIYET || kosu.cins || ''),
    ikramiye:    ikramiyeInt,
    ikramiyeStr: ikramiyeStr,
    atSayisi:    atlar.length,
    atlar:       atlar.filter(function(a) { return !a.KOSMAZ; }).map(normalizeAt),
  };
}

function normalizeHipodrom(h, idx) {
  var kosular = h.Kosular || h.kosular || h.Races || h.races || [];
  // TJK gerçek alan adları: KEY, AD, YER, GUN, KOD
  var sehirAdi = str(h.AD || h.Ad || h.SehirAdi || h.sehirAdi || h.HipodromAdi || h.ad || h.Name || h.name);
  var key = str(h.KEY || h.Key || h.slug || h.id || sehirAdi);
  var id = key.toLowerCase()
    .replace(/İ/g, 'i').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return {
    id:      id || ('hip' + idx),
    ad:      sehirAdi.toUpperCase(),
    kisa:    sehirAdi.split(' ')[0],
    aktif:   idx === 0,
    slug:    key,
    gun:     intVal(h.GUN || h.Gun || h.gun),
    kosular: kosular.map(normalizeKosu),
  };
}

function normalizeSonucAt(at, idx) {
  return {
    gelisSirasi: intVal(at.GelisSirasi || at.gelisSirasi || at.Sira || at.sira) || (idx + 1),
    atNo:        intVal(at.AtNo || at.atNo || at.No || at.no),
    atAd:        str(at.AtAdi || at.atAdi || at.Ad || at.ad),
    jokey:       str(at.JokeyAdi || at.jokeyAdi || at.Jokey || at.jokey),
    derece:      str(at.Derece || at.derece || at.Sure || at.sure || at.Time),
    handikap:    intVal(at.Kilo || at.kilo || at.Handikap || at.handikap),
    agf:         num(at.AGF || at.agf),
  };
}

function normalizeOdemeler(kosu) {
  var o = kosu.Odemeler || kosu.odemeler || kosu.Ikramiyeler || kosu.ikramiyeler || {};
  return {
    ganyanAt:  str(o.GanyanAt  || o.ganyanAt  || ''),
    ganyanNo:  intVal(o.GanyanNo || o.ganyanNo),
    ganyan:    str(o.Ganyan    || o.ganyan    || ''),
    plaseAt1:  str(o.PlaseAt1  || o.plaseAt1  || ''),
    plaseNo1:  intVal(o.PlaseNo1 || o.plaseNo1),
    plase1:    str(o.Plase1    || o.plase1    || ''),
    plaseAt2:  str(o.PlaseAt2  || o.plaseAt2  || ''),
    plaseNo2:  intVal(o.PlaseNo2 || o.plaseNo2),
    plase2:    str(o.Plase2    || o.plase2    || ''),
    plaseAt3:  str(o.PlaseAt3  || o.plaseAt3  || ''),
    plaseNo3:  intVal(o.PlaseNo3 || o.plaseNo3),
    plase3:    str(o.Plase3    || o.plase3    || ''),
    cifte:     str(o.Cifte     || o.cifte     || ''),
    cifteStr:  str(o.CifteStr  || o.cifteStr  || ''),
    surpriz:   str(o.Surpriz   || o.surpriz   || ''),
    surprizStr:str(o.SurprizStr|| o.surprizStr|| ''),
  };
}

function normalizeSonucKosu(kosu, idx) {
  var sonuclar = kosu.Sonuclar || kosu.sonuclar || kosu.Results || kosu.results || [];
  return {
    no:          intVal(kosu.KosuNo || kosu.kosuNo || kosu.No || kosu.no) || (idx + 1),
    saat:        str(kosu.BaslangicSaati || kosu.baslangicSaati || kosu.Saat || kosu.saat),
    mesafe:      intVal(kosu.Mesafe || kosu.mesafe),
    pist:        str(kosu.PistCinsi || kosu.pistCinsi || kosu.Pist || kosu.pist),
    yas:         str(kosu.YasGrubu || kosu.yasGrubu || kosu.Yas || kosu.yas),
    cins:        str(kosu.Cins || kosu.cins),
    ikramiyeStr: str(kosu.IkramiyeStr || kosu.ikramiyeStr) || intVal(kosu.Ikramiye || kosu.ikramiye || 0).toLocaleString('tr-TR') + ' TL',
    atSayisi:    intVal(kosu.AtSayisi || kosu.atSayisi) || sonuclar.length,
    sonuclar:    sonuclar.map(normalizeSonucAt),
    odemeler:    normalizeOdemeler(kosu),
  };
}

// ── Tam Program Çek ───────────────────────────────────────────────────
async function getFullProgram(tarih) {
  var raw = await fetchYarislarListesi(tarih);
  var liste = Array.isArray(raw) ? raw : (raw.data || raw.hipodromlar || raw.list || [raw]);

  // Sadece Türkiye hipodromlarını al (GUN dolu olanlar)
  var turkiye = liste.filter(function(h) {
    return (h.GUN || h.Gun || h.gun) !== null && (h.GUN || h.Gun || h.gun) !== undefined && (h.GUN || h.Gun || h.gun) !== '';
  });

  console.log('[tjk-api] Türkiye hipodromları:', turkiye.map(function(h){ return h.KEY || h.AD; }));

  var hipodromlar = [];
  for (var i = 0; i < turkiye.length; i++) {
    var h = turkiye[i];
    // KEY alanını slug olarak kullan: ANKARA, IZMIR vb.
    var slug = str(h.KEY || h.Key || h.AD || h.ad);
    try {
      var detay = await fetchProgramDetay(tarih, slug);
      var kosular = detay.Kosular || detay.kosular || detay.Races || detay.races || (Array.isArray(detay) ? detay : []);
      hipodromlar.push(normalizeHipodrom(Object.assign({}, h, { kosular: kosular }), i));
    } catch (e) {
      console.error('[tjk-api] program detay hatası (' + slug + '):', e.message);
      hipodromlar.push(normalizeHipodrom(h, i));
    }
  }

  return { tarih: tarih, hipodromlar: hipodromlar };
}

// ── Tam Sonuçlar Çek ─────────────────────────────────────────────────
async function getFullSonuclar(tarih) {
  var raw = await fetchSonuclarListesi(tarih);
  var liste = Array.isArray(raw) ? raw : (raw.data || raw.hipodromlar || raw.list || [raw]);

  var turkiye = liste.filter(function(h) {
    return (h.GUN || h.Gun || h.gun) !== null && (h.GUN || h.Gun || h.gun) !== undefined && (h.GUN || h.Gun || h.gun) !== '';
  });

  console.log('[tjk-api] Sonuç hipodromları:', turkiye.map(function(h){ return h.KEY || h.AD; }));

  var hipodromlar = [];
  for (var i = 0; i < turkiye.length; i++) {
    var h = turkiye[i];
    var slug = str(h.KEY || h.Key || h.AD || h.ad);
    try {
      var detay = await fetchSonuclarDetay(tarih, slug);
      var kosular = detay.Kosular || detay.kosular || detay.Races || detay.races || (Array.isArray(detay) ? detay : []);
      var normalized = normalizeHipodrom(Object.assign({}, h, { kosular: [] }), i);
      normalized.kosular = kosular.map(normalizeSonucKosu);
      hipodromlar.push(normalized);
    } catch (e) {
      console.error('[tjk-api] sonuç detay hatası (' + slug + '):', e.message);
      hipodromlar.push(normalizeHipodrom(h, i));
    }
  }

  return { tarih: tarih, hipodromlar: hipodromlar };
}

// Debug fonksiyonları
async function getRawYarislar(tarih) {
  return fetchYarislarListesi(tarih);
}

async function getRawSonuclar(tarih) {
  return fetchSonuclarListesi(tarih);
}

async function getRawDetay(tarih, key, tip) {
  if (tip === 'sonuc') return fetchSonuclarDetay(tarih, key);
  return fetchProgramDetay(tarih, key);
}

module.exports = {
  getFullProgram:   getFullProgram,
  getFullSonuclar:  getFullSonuclar,
  getRawYarislar:   getRawYarislar,
  getRawSonuclar:   getRawSonuclar,
  getRawDetay:      getRawDetay,
};
