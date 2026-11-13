const { limited } = require('./_ai');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (limited(req, res, 5)) return;
  const b = req.body || {}; if (b.website) return res.status(200).json({ ok: true }); // honeypot
  const name = String(b.name || '').trim().slice(0, 80), email = String(b.email || '').trim().slice(0, 120), msg = String(b.message || '').trim().slice(0, 1500);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || msg.length < 5) return res.status(400).json({ error: 'Please fill name, a valid email and a message.' });
  const text = '\ud83d\udce9 New lead\nName: ' + name + '\nEmail: ' + email + '\nMessage: ' + msg;
  console.log(text);
  if (process.env.LEAD_WEBHOOK_URL) { try { await fetch(process.env.LEAD_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text, text }), signal: AbortSignal.timeout(6000) }); } catch (e) { console.error(e.message); } }
  res.status(200).json({ ok: true });
};
