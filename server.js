require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'ok' }));
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.get('/api/semrush/organic', async (req, res) => {
  const { domain, database = 'tr', limit = '1000', minvol = '0' } = req.query;
  if (!domain) return res.status(400).json({ error: 'domain gerekli' });

  const apiKey = process.env.SEMRUSH_API_KEY;
  console.log('API KEY KONTROL:', apiKey ? 'MEVCUT' : 'EKSIK');
  if (!apiKey) return res.status(500).json({ error: 'API key eksik' });

  const u = new URL('https://api.semrush.com/');
  u.searchParams.set('type', 'domain_organic');
  u.searchParams.set('key', apiKey);
  u.searchParams.set('domain', domain);
  u.searchParams.set('database', database);
  u.searchParams.set('display_limit', String(Math.min(Number(limit), 10000)));
  u.searchParams.set('export_columns', 'Ph,Po,Nq,Cp,Ur,Tr');
  u.searchParams.set('display_sort', 'tr_desc');
