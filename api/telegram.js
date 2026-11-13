const crypto = require('crypto'); const { rest } = require('./_sb'); const { inbound } = require('./_inbound'); const { limited } = require('./_ai');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end(); if (limited(req, res, 120)) return;
  const sec = process.env.TELEGRAM_WEBHOOK_SECRET || '', got = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  if (sec.length < 16 || got.length !== sec.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(sec))) return res.status(401).end(); // signature check
  const m = req.body && req.body.message; if (!m || !m.text) return res.status(200).json({ ok: true });
  try {
    const a = (await rest('accounts?slug=eq.' + encodeURIComponent(process.env.TELEGRAM_WORKSPACE_SLUG || '') + '&select=id,name', { svc: true }))[0]; if (!a) return res.status(200).json({ ok: true });
    const r = await inbound({ a, session: 'tg:' + m.chat.id, text: m.text.slice(0, 1500), channel: 'telegram', name: [m.from && m.from.first_name, m.from && m.from.last_name].filter(Boolean).join(' ') });
    if (r.reply) await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: m.chat.id, text: r.reply }) });
  } catch (e) { console.error(e.message); }
  res.status(200).json({ ok: true });
};
