'use strict';

// ── Turkish Horse Racing Mock Data Module ────────────────────────────

var hipodromlar = [
  { id: 'istanbul', ad: 'İSTANBUL - VELİEFENDİ', kisa: 'İstanbul' },
  { id: 'ankara',   ad: 'ANKARA - 75. YIL',       kisa: 'Ankara'   },
  { id: 'izmir',    ad: 'İZMİR - ÇİĞLİ',         kisa: 'İzmir'    }
];

var jokeyler = [
  'F. Doğan', 'E. Çelik', 'A. Yıldız', 'M. Gürbüz', 'H. Kaya',
  'C. Arslan', 'B. Öztürk', 'İ. Demir', 'T. Şahin', 'Y. Aydın'
];

var antrenorler = [
  'H. Yıldız', 'M. Karakaya', 'A. Özcan', 'F. Polat', 'S. Doğan',
  'R. Aktaş', 'O. Kılıç', 'N. Çetin', 'K. Arslan', 'L. Yıldırım'
];

var sahipler = [
  'A. Koç', 'B. Yıldız At Çiftliği', 'C. Demir Ahırları', 'D. Gürbüz',
  'E. Kaya At Yetiştiriciliği', 'F. Arslan', 'G. Öztürk Çiftliği',
  'H. Şahin', 'İ. Aydın At İşletmesi', 'J. Çelik Ahırları',
  'K. Doğan At Çiftliği', 'L. Karakaya', 'M. Polat Ahırları'
];

var babalar = [
  'KARAKUŞ', 'ALTINHAN', 'BOZKIR', 'ŞIMŞEK', 'DORUK', 'KARTAL',
  'FIRTINA', 'YILDIRIM', 'ÖZGÜR', 'SULTAN', 'ACAR', 'GÜNEŞ',
  'DEMİR', 'EFE', 'FIRATAN', 'GÖKHAN', 'HASRET', 'İPEK',
  'KIRCAL', 'BORAN'
];

var anneler = [
  'ALTINÇIÇEK', 'KARAELMAS', 'ÖZGÜRLÜK', 'SÜMBÜL', 'YILDIZHAN',
  'GÜNEŞHAN', 'BOZKIRAN', 'ŞANSLIGİZEM', 'DORUKHAN', 'SULTANA',
  'ACARHAN', 'BOZOĞLAN', 'ÇAKIR', 'DEMİRKAYA', 'EFSENEM',
  'FIRANÇE', 'GÖKÇE', 'HASNUR', 'İPEKSU', 'KARTALKAYA'
];

var atAdlari = [
  'ALTINTAÇ', 'KARAKAYA', 'YILDIRIM', 'ÖZGÜRLÜK', 'BOZKIR',
  'KAPLAN', 'ŞIMŞEK', 'ÇIRAK', 'DOĞANKAYA', 'SULTANBEY',
  'GÜNEŞATLI', 'DORUKHAN', 'KIRCALI', 'ŞANSLI YILDIZ', 'BORANKAYA',
  'SONSUZLUK', 'KARDEMİR', 'ALTINRÜZGAR', 'ANADOLU FIRTINASI', 'TÜRKİYEM',
  'ACARHAN', 'BOZOĞLAN', 'ÇAKIRGÖZ', 'DEMİRKAYA', 'EFEHAN',
  'FIRATHAN', 'GÖKDAĞ', 'HASANKEYF', 'İPEKYOLU', 'KARTALHAN',
  'BATURHAN', 'ÇANKIRI', 'DAĞKIRAN', 'ERDEMHAN', 'FETHIYE',
  'GÖKTÜRK', 'HAKANLI', 'İKİZLER', 'KALENDER', 'LALELHAN',
  'MANAVHAN', 'NARINCALI', 'OMUZHAN', 'POLATHAN', 'RÜZGARHAN',
  'SAKARYA', 'TAŞKIRAN', 'UĞURHAN', 'VADİHAN', 'YENİHAN'
];

var mesafeler = [1000, 1100, 1200, 1400, 1600, 1800, 2000, 2200, 2400];
var pistler   = ['Kum', 'Çim'];
var yaslar    = ['2 Yaşlı', '3 Yaşlı', '3+ Yaşlı', 'Her Yaşta'];
var cinsler   = ['Dişi', 'Erkek', 'Klâsik', 'Karma'];
var ikramiyeler = [80000, 100000, 120000, 150000, 200000, 250000, 300000, 400000, 500000];

// Deterministic pseudo-random based on a seed string
function seededRand(seed) {
  var h = 0;
  for (var i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return function () {
    h ^= h << 13; h ^= h >> 17; h ^= h << 5;
    return ((h >>> 0) / 4294967296);
  };
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(min, max, rng) {
  return min + Math.floor(rng() * (max - min + 1));
}

function agfVal(rng) {
  var vals = [1.5, 1.8, 2.1, 2.5, 3.0, 3.5, 4.0, 4.5, 5.5, 6.5, 7.0, 8.0, 9.5, 11.0, 13.0, 16.0, 20.0, 25.0];
  return vals[Math.floor(rng() * vals.length)];
}

function son5(rng) {
  var places = [];
  for (var i = 0; i < 5; i++) {
    places.push(randInt(1, 9, rng));
  }
  return places.join('-');
}

function timeStr(baseMin, extraMin) {
  var total = baseMin + extraMin;
  var h = Math.floor(total / 60);
  var m = total % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function dereceStr(mesafe, rng) {
  // Generate realistic finish time based on distance
  var secsPerM = 0.068 + rng() * 0.012;
  var totalSecs = Math.floor(mesafe * secsPerM);
  var mins = Math.floor(totalSecs / 60);
  var secs = totalSecs % 60;
  var ms   = randInt(10, 99, rng);
  return (mins > 0 ? mins + '.' : '') + (secs < 10 ? '0' : '') + secs + '.' + ms;
}

function buildHorseList(seed, kosuNo, hipId, count) {
  var rng = seededRand(seed + hipId + kosuNo);
  // Shuffle horse names deterministically
  var pool = atAdlari.slice();
  for (var i = pool.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  var horses = [];
  // Assign AGF values - first pick some low ones for favorites
  var agfPool = [];
  for (var k = 0; k < count; k++) agfPool.push(agfVal(rng));
  agfPool.sort(function (a, b) { return a - b; }); // sort ascending so favorites are first
  // Reshuffle so favorites aren't always position 1
  var agfShuffled = agfPool.slice();
  for (var i2 = agfShuffled.length - 1; i2 > 0; i2--) {
    var j2 = Math.floor(rng() * (i2 + 1));
    var tmp2 = agfShuffled[i2]; agfShuffled[i2] = agfShuffled[j2]; agfShuffled[j2] = tmp2;
  }

  for (var n = 0; n < count; n++) {
    var jokey = pick(jokeyler, rng);
    horses.push({
      no:       n + 1,
      ad:       pool[n % pool.length] + (kosuNo > 3 ? ' ' + (n + 1) : ''),
      kilo:     randInt(52, 60, rng),
      jokey:    jokey,
      antrenor: pick(antrenorler, rng),
      baba:     pick(babalar, rng),
      anne:     pick(anneler, rng),
      sahibi:   pick(sahipler, rng),
      son5:     son5(rng),
      agf:      agfShuffled[n]
    });
  }
  return horses;
}

function buildKosular(tarih, hipId) {
  var kosular = [];
  var baseHour = 13 * 60; // 13:00
  for (var k = 1; k <= 7; k++) {
    var seed = tarih + hipId + k;
    var rng  = seededRand(seed);
    var mes  = pick(mesafeler, rng);
    var pist = pick(pistler, rng);
    var yas  = pick(yaslar, rng);
    var cins = pick(cinsler, rng);
    var ikr  = pick(ikramiyeler, rng);
    var cnt  = randInt(8, 10, rng);
    var saat = timeStr(baseHour, (k - 1) * 30);
    var atlar = buildHorseList(tarih, k, hipId, cnt);
    kosular.push({
      no:       k,
      saat:     saat,
      mesafe:   mes,
      pist:     pist,
      yas:      yas,
      cins:     cins,
      ikramiye: ikr,
      ikramiyeStr: ikr.toLocaleString('tr-TR') + ' TL',
      atSayisi: cnt,
      atlar:    atlar
    });
  }
  return kosular;
}

function buildBultenData(tarih) {
  return hipodromlar.map(function (hip) {
    return {
      id:      hip.id,
      ad:      hip.ad,
      kisa:    hip.kisa,
      kosular: buildKosular(tarih, hip.id)
    };
  });
}

function buildAGFData(tarih) {
  var bulten = buildBultenData(tarih);
  return bulten.map(function (hip) {
    return {
      id:   hip.id,
      ad:   hip.ad,
      kisa: hip.kisa,
      kosular: hip.kosular.map(function (kosu) {
        var atlar = kosu.atlar.map(function (at) {
          var rng = seededRand(tarih + hip.id + kosu.no + at.no + 'agf');
          var ganyan = (at.agf * (0.85 + rng() * 0.3)).toFixed(2);
          var plase  = (at.agf * 0.35 + rng() * 0.5).toFixed(2);
          return {
            no:     at.no,
            ad:     at.ad,
            agf:    at.agf,
            ganyan: ganyan,
            plase:  plase
          };
        });
        // Sort by AGF for display, keep original no
        var sorted = atlar.slice().sort(function (a, b) { return a.agf - b.agf; });
        var status = ['Yarış Başlamadı', 'Yarış Tamamlandı'];
        var rngS = seededRand(tarih + hip.id + kosu.no + 'status');
        var st = kosu.no <= 4 ? status[0] : status[1];
        return {
          no:       kosu.no,
          saat:     kosu.saat,
          mesafe:   kosu.mesafe,
          pist:     kosu.pist,
          yas:      kosu.yas,
          cins:     kosu.cins,
          ikramiye: kosu.ikramiye,
          ikramiyeStr: kosu.ikramiyeStr,
          durum:    st,
          atlar:    atlar,
          favori:   sorted[0]
        };
      })
    };
  });
}

function buildSonuclarData(tarih) {
  var bulten = buildBultenData(tarih);
  return bulten.map(function (hip) {
    return {
      id:   hip.id,
      ad:   hip.ad,
      kisa: hip.kisa,
      kosular: hip.kosular.map(function (kosu) {
        // Generate finish order deterministically
        var rng = seededRand(tarih + hip.id + kosu.no + 'sonuc');
        var order = kosu.atlar.map(function (at) { return at.no; });
        // Shuffle to get finish order
        for (var i = order.length - 1; i > 0; i--) {
          var j = Math.floor(rng() * (i + 1));
          var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
        }
        // Favorites (low AGF) should appear higher more often - sort partially by AGF
        var byAgf = kosu.atlar.slice().sort(function (a, b) { return a.agf - b.agf; });
        // Top 3 from AGF have higher chance of top 3 finish
        var sonuclar = order.map(function (no, idx) {
          var at = kosu.atlar.find(function (a) { return a.no === no; });
          return {
            gelisSirasi: idx + 1,
            atNo:   at.no,
            atAd:   at.ad,
            jokey:  at.jokey,
            derece: dereceStr(kosu.mesafe, rng),
            handikap: at.kilo,
            agf:    at.agf
          };
        });

        var ganyan1 = sonuclar[0];
        var plase1  = sonuclar[0];
        var plase2  = sonuclar[1];
        var plase3  = sonuclar[2];
        var rngP = seededRand(tarih + hip.id + kosu.no + 'pay');
        var odemeler = {
          ganyanAt:  ganyan1.atAd,
          ganyanNo:  ganyan1.atNo,
          ganyan:    (ganyan1.agf * 0.85 + rngP() * 2).toFixed(2),
          plaseAt1:  plase1.atAd,
          plaseNo1:  plase1.atNo,
          plase1:    (plase1.agf * 0.32 + rngP() * 0.5).toFixed(2),
          plaseAt2:  plase2.atAd,
          plaseNo2:  plase2.atNo,
          plase2:    (plase2.agf * 0.35 + rngP() * 0.5).toFixed(2),
          plaseAt3:  plase3 ? plase3.atAd : '',
          plaseNo3:  plase3 ? plase3.atNo : '',
          plase3:    plase3 ? (plase3.agf * 0.38 + rngP() * 0.5).toFixed(2) : '',
          cifte:     (ganyan1.agf * plase2.agf * 0.4 + rngP() * 5).toFixed(2),
          surpriz:   (ganyan1.agf * plase2.agf * 0.55 + rngP() * 8).toFixed(2),
          cifteStr:  ganyan1.atNo + '-' + plase2.atNo,
          surprizStr: ganyan1.atNo + '-' + plase2.atNo
        };

        return {
          no:          kosu.no,
          saat:        kosu.saat,
          mesafe:      kosu.mesafe,
          pist:        kosu.pist,
          yas:         kosu.yas,
          cins:        kosu.cins,
          ikramiye:    kosu.ikramiye,
          ikramiyeStr: kosu.ikramiyeStr,
          atSayisi:    kosu.atSayisi,
          sonuclar:    sonuclar,
          odemeler:    odemeler
        };
      })
    };
  });
}

// ── Exported Functions ──────────────────────────────────────────────

function getMockBulten(tarih) {
  return buildBultenData(tarih || todayStr());
}

function getMockAGF(tarih) {
  return buildAGFData(tarih || todayStr());
}

function getMockSonuclar(tarih) {
  return buildSonuclarData(tarih || todayStr());
}

function getMockProgram(tarih) {
  return buildBultenData(tarih || todayStr());
}

function todayStr() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().split('T')[0];
}

module.exports = {
  getMockBulten:  getMockBulten,
  getMockAGF:     getMockAGF,
  getMockSonuclar: getMockSonuclar,
  getMockProgram:  getMockProgram,
  hipodromlar:     hipodromlar
};
