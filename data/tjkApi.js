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
  return {
    no:       intVal(at.AtNo || at.atNo || at.no || at.sira) || (idx + 1),
    ad:       str(at.AtAdi || at.atAdi || at.ad || at.name || at.AtAdı),
    kilo:     intVal(at.Kilo || at.kilo || at.Agirlik || at.agirlik || at.Siklet || at.siklet),
    jokey:    str(at.JokeyAdi || at.jokeyAdi || at.Jokey || at.jokey || at.JokeyAdı),
    antrenor: str(at.AntrenorAdi || at.antrenorAdi || at.Antrenor || at.antrenor || at.AntrenörAdı),
    baba:     str(at.BabaAdi || at.babaAdi || at.Baba || at.baba),
    anne:     str(at.AnneAdi || at.anneAdi || at.Anne || at.anne),
    sahibi:   str(at.SahibiAdi || at.sahibiAdi || at.Sahip || at.sahip || at.Owner),
    son5:     str(at.Son5 || at.son5 || at.SonDerece || at.sonDerece || at.Galibiyet),
    agf:      num(at.AGF || at.agf || at.AgfOrani || at.agfOrani || at.Agf),
  };
}

function normalizeKosu(kosu, idx) {
  var atlar = kosu.Atlar || kosu.atlar || kosu.Deklareler || kosu.deklareler || kosu.Horses || kosu.horses || [];
  return {
    no:          intVal(kosu.KosuNo || kosu.kosuNo || kosu.No || kosu.no || kosu.Sira) || (idx + 1),
    saat:        str(kosu.BaslangicSaati || kosu.baslangicSaati || kosu.Saat || kosu.saat || kosu.Time),
    mesafe:      intVal(kosu.Mesafe || kosu.mesafe || kosu.Distance),
    pist:        str(kosu.PistCinsi || kosu.pistCinsi || kosu.Pist || kosu.pist || kosu.Zemin || kosu.zemin),
    yas:         str(kosu.YasGrubu || kosu.yasGrubu || kosu.Yas || kosu.yas || kosu.Age),
    cins:        str(kosu.CinsiyetTuru || kosu.cinsiyetTuru || kosu.Cins || kosu.cins),
    ikramiye:    intVal(kosu.Ikramiye || kosu.ikramiye || kosu.Prize),
    ikramiyeStr: str(kosu.IkramiyeStr || kosu.ikramiyeStr) || (intVal(kosu.Ikramiye || kosu.ikramiye || 0).toLocaleString('tr-TR') + ' TL'),
    atSayisi:    atlar.length,
    atlar:       atlar.map(normalizeAt),
  };
}

function normalizeHipodrom(h, idx) {
  var kosular = h.Kosular || h.kosular || h.Races || h.races || [];
  var sehirAdi = str(h.SehirAdi || h.sehirAdi || h.HipodromAdi || h.hipodromAdi || h.Ad || h.ad || h.Name || h.name);
  var id = sehirAdi.toLowerCase()
    .replace(/İ/g, 'i').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return {
    id:      id || ('hip' + idx),
    ad:      sehirAdi.toUpperCase(),
    kisa:    sehirAdi.split(' ')[0],
    aktif:   idx === 0,
    slug:    str(h.slug || h.Slug || h.SehirId || h.sehirId || h.Id || h.id || sehirAdi),
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

  // yarislar.json bir dizi veya obje olabilir
  var liste = Array.isArray(raw) ? raw : (raw.data || raw.hipodromlar || raw.list || [raw]);

  var hipodromlar = [];
  for (var i = 0; i < liste.length; i++) {
    var h = liste[i];
    var slug = str(h.SehirAdi || h.sehirAdi || h.HipodromAdi || h.hipodromAdi || h.slug || h.id || h.SehirId);
    try {
      var detay = await fetchProgramDetay(tarih, slug);
      // detay bir obje: {kosular: [...]} veya direkt dizi
      var kosular = detay.Kosular || detay.kosular || detay.Races || detay.races || (Array.isArray(detay) ? detay : []);
      hipodromlar.push(normalizeHipodrom(Object.assign({}, h, { kosular: kosular }), i));
    } catch (e) {
      console.error('[tjk-api] program detay hatası (' + slug + '):', e.message);
      // Listedeki hipodromu kosusuz ekle
      hipodromlar.push(normalizeHipodrom(h, i));
    }
  }

  return { tarih: tarih, hipodromlar: hipodromlar };
}

// ── Tam Sonuçlar Çek ─────────────────────────────────────────────────
async function getFullSonuclar(tarih) {
  var raw = await fetchSonuclarListesi(tarih);
  var liste = Array.isArray(raw) ? raw : (raw.data || raw.hipodromlar || raw.list || [raw]);

  var hipodromlar = [];
  for (var i = 0; i < liste.length; i++) {
    var h = liste[i];
    var slug = str(h.SehirAdi || h.sehirAdi || h.HipodromAdi || h.slug || h.id || h.SehirId);
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

// Debug: Ham API verisini döner (geliştirme aşamasında kullanılır)
async function getRawYarislar(tarih) {
  return fetchYarislarListesi(tarih);
}

async function getRawSonuclar(tarih) {
  return fetchSonuclarListesi(tarih);
}

module.exports = {
  getFullProgram:   getFullProgram,
  getFullSonuclar:  getFullSonuclar,
  getRawYarislar:   getRawYarislar,
  getRawSonuclar:   getRawSonuclar,
};
