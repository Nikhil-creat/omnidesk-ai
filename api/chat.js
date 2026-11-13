const { viaGroq, viaGemini } = require('./_ai');
const hits = new Map(); // simple per-IP limiter (20 req/min); use Upstash Redis for multi-instance
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const ip = (req.headers['x-forwarded-for'] || 'x').split(',')[0], now = Date.now();
  const h = (hits.get(ip) || []).filter(t => now - t < 6e4); h.push(now); hits.set(ip, h);
  if (h.length > 20) return res.status(429).setHeader('Retry-After', '30').json({ error: 'Too many requests' });
  let msgs = (req.body && req.body.messages) || [];
  msgs = msgs.slice(-10).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 1500).replace(/\b\d{13,19}\b/g, '[REDACTED]') })); // PII mask
  if (!msgs.length) return res.status(400).json({ error: 'messages required' });
  for (const fn of [viaGroq, viaGemini]) {
    try { return res.status(200).json(await fn(msgs)); } catch (e) { console.error(e.message); }
  }
  res.status(200).json({ reply: "I don't have verified information on that — let me connect you with a specialist.", provider: 'fallback', handoff: true });
};
