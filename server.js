require('dotenv').config();
var express = require('express');
var cors = require('cors');
var fetch = require('node-fetch');
var app = express();
var PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);
app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/', function(req, res) {
  res.json({ status: 'ok' });
});

app.get('/health', function(req, res) {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/debug-env', function(req, res) {
  var allKeys = Object.keys(process.env);
  var customKeys = allKeys.filter(function(k) {
    return !k.startsWith('PATH') && !k.startsWith('npm') && !k.startsWith('NODE') && !k.startsWith('HOME') && !k.startsWith('PWD');
  });
  res.json({
    KEY_EXISTS: !!process.env.SEMRUSH_API_KEY,
    KEY_LENGTH: process.env.SEMRUSH_API_KEY ? process.env.SEMRUSH_API_KEY.length : 0,
    CUSTOM_KEYS: customKeys
  });
});

app.get('/api/semrush/organic', async function(req, res) {
  var domain = req.query.domain;
  var database = req.query.database || 'tr';
  var limit = req.query.limit || '1000';
  var minvol = req.query.minvol || '0';

  if (!domain) {
    return res.status(400).json({ error: 'domain gerekli' });
  }

  var apiKey = process.env.SEMRUSH_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key eksik' });
  }

  var u = new URL('https://api.semrush.com/');
  u.searchParams.set('type', 'domain_organic');
  u.searchParams.set('key', apiKey);
  u.searchParams.set('domain', domain);
  u.searchParams.set('database', database);
  u.searchParams.set('display_limit', String(Math.min(Number(limit), 10000)));
  u.searchParams.set('export_columns', 'Ph,Po,Nq,Cp,Ur,Tr');
  u.searchParams.set('display_sort', 'tr_desc');

  var mv = parseInt(minvol) || 0;
  if (mv > 0) {
    u.searchParams.set('display_filter', '+|Nq|Gt|' + (mv - 1));
  }

  try {
    var r = await fetch(u.toString());
    var text = await r.text();

    if (text.includes('TOTAL LIMIT EXCEEDED')) {
      return res.status(402).json({ error: 'Semrush limiti doldu' });
    }
    if (text.startsWith('ERROR')) {
      return res.status(400).json({ error: text.slice(0, 200) });
    }

    var lines = text.trim().split('\n');
    if (lines.length < 2) {
      return res.status(404).json({ error: 'Sonuc yok' });
    }

    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var c = lines[i].split(';');
      if (c.length < 3) continue;
      var kw = (c[0] || '').trim().toLowerCase();
      if (!kw) continue;
      rows.push({
        kw: kw,
        pos: parseInt(c[1]) || 0,
        vol: parseInt(c[2]) || 0,
        cpc: parseFloat(c[3]) || 0,
        url: (c[4] || '').trim()
      });
    }

    res.json({ domain: domain, database: database, total: rows.length, rows: rows });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', function() {
  console.log('CALISIYOR port=' + PORT);
  console.log('API_KEY=' + (process.env.SEMRUSH_API_KEY ? 'VAR' : 'YOK'));
});
