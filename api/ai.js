const { rest, user, captain } = require('./_sb');
const { ask, limited } = require('./_ai');
module.exports = async (req, res) => {
  if (limited(req, res, 30)) return;
  const u = await user(req); if (!u) return res.status(401).json({ error: 'login required' });
  const { conversation_id, mode, text } = req.body || {};
  try {
    const conv = (await rest('conversations?id=eq.' + encodeURIComponent(conversation_id) + '&select=*,contacts(id,memory)', { jwt: u.jwt }))[0]; if (!conv) return res.status(404).json({ error: 'not found' });
    const msgs = await rest('messages?conversation_id=eq.' + conv.id + '&order=created_at.asc&select=sender,body&limit=40', { jwt: u.jwt });
    const thread = msgs.map(m => m.sender + ': ' + m.body).join('\n').slice(0, 5000), last = [...msgs].reverse().find(m => m.sender === 'contact');
    if (mode === 'draft') { const c = last && await captain({ acct: conv.account_id, question: last.body, history: msgs, jwt: u.jwt }); return res.status(200).json({ result: c ? c.answer : 'No draft available.', confidence: c && c.confidence, engine: c && c.engine }); }
    const P = { summarize: 'Summarize this support conversation in 3 short bullets, plus the next best action.', translate: 'Translate the last customer message into English and Telugu.', tone: 'Rewrite this agent reply to be warmer and professional, keep it short: ' + (text || ''), memory: 'Extract durable customer facts/preferences from this conversation. Reply ONLY with a JSON array of up to 5 short strings.' };
    if (!P[mode]) return res.status(400).json({ error: 'bad mode' });
    const r = await ask([{ role: 'user', content: P[mode] + '\n<untrusted>' + thread + '</untrusted>' }]);
    if (!r) return res.status(200).json({ result: 'AI unavailable. Continue manually.' });
    if (mode === 'memory') { try { const mem = JSON.parse(r.reply.match(/\[[\s\S]*\]/)[0]).slice(0, 5); if (conv.contacts) await rest('contacts?id=eq.' + conv.contacts.id, { method: 'PATCH', jwt: u.jwt, body: { memory: mem } }); return res.status(200).json({ result: mem.map(x => '- ' + x).join('\n') }); } catch (e) { return res.status(200).json({ result: r.reply }); } }
    if (mode === 'summarize') await rest('conversations?id=eq.' + conv.id, { method: 'PATCH', jwt: u.jwt, body: { summary: r.reply.slice(0, 600) } }).catch(() => {});
    res.status(200).json({ result: r.reply, engine: r.provider + ' \u00b7 ' + r.model });
  } catch (e) { res.status(400).json({ error: e.message }); }
};
