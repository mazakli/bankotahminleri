require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3001;
app.set('trust proxy', 1);
app.use(cors({ origin: '*' }));
app.use(express.json());
app.get('/', (req, res) => res.json({ status: 'ok' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/debug-env', (req, res) => {
  res.json({
    KEY_EXISTS: !!process.env.SEMRUSH_API_KEY,
    KEY_LENGTH: process.env.SEMRUSH_API_KEY ? process.env.SEMRUSH_API_KEY.length : 0,
    ALL_KEYS: Object.keys(process.env).filter(function(k){ return !k.startsWith('PATH') && !k.startsWith('npm'); })
  });
});
app.get('/api/semrush/organic', async (req, res) => {
  const { domain, database = 'tr', limit = '1000', minvol = '0' } = req.query;
  if (!domain) return res.status(400).json({ error: 'domain gerekli' });
  const apiKey = process.env.SEMRUSH_API_KEY;
  if (!apiKey) return res.status(50
