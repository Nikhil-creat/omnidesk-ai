const { rest, user } = require('./_sb'); const { limited } = require('./_ai');
module.exports = async (req, res) => { // agent reply -> Telegram (membership enforced by RLS on the conversation read)
  if (req.method !== 'POST' || limited(req, res, 60)) return res.status(405).end();
  const u = await user(req); if (!u) return res.status(401).json({ error: 'login required' });
  try { const { conversation_id, text } = req.body || {}; const c = (await rest('conversations?id=eq.' + encodeURIComponent(conversation_id) + '&select=channel,session', { jwt: u.jwt }))[0];
    if (!c || c.channel !== 'telegram' || !String(c.session).startsWith('tg:')) return res.status(400).json({ error: 'not a telegram conversation' });
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: c.session.slice(3), text: String(text).slice(0, 3500) }) });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok }); } catch (e) { res.status(400).json({ error: e.message }); }
};
