const { inspect } = require('./_vision'); const { limited } = require('./_ai');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' }); if (limited(req, res, 10)) return;
  try { const r = await inspect((req.body || {}).image); res.status(200).json(r || { degraded: true }); } catch (e) { res.status(400).json({ error: e.message }); }
};
