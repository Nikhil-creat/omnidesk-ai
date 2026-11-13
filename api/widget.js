const { rest } = require('./_sb'); const { limited } = require('./_ai'); const { inbound, FALL } = require('./_inbound'); const { inspect } = require('./_vision');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end(); if (limited(req, res, 60)) return;
  const q = req.method === 'GET' ? req.query : (req.body || {}); const slug = String(q.slug || '').slice(0, 40), session = String(q.session || '').slice(0, 64);
  if (!/^[a-z0-9]+$/i.test(slug) || session.length < 8) return res.status(400).json({ error: 'bad request' });
  try {
    const a = (await rest('accounts?slug=eq.' + slug + '&select=id,name', { svc: true }))[0]; if (!a) return res.status(404).json({ error: 'unknown workspace' });
    const latest = (await rest(`conversations?account_id=eq.${a.id}&session=eq.${encodeURIComponent(session)}&order=created_at.desc&limit=1&select=id,status,csat_requested`, { svc: true }))[0];
    if (req.method === 'GET') { if (!latest) return res.status(200).json({ messages: [] }); if (latest.status === 'resolved') return res.status(200).json({ messages: [], csat: !!latest.csat_requested });
      const after = q.after ? '&created_at=gt.' + encodeURIComponent(q.after) : ''; return res.status(200).json({ messages: await rest(`messages?conversation_id=eq.${latest.id}&sender=in.(agent,bot)${after}&order=created_at.asc&select=sender,body,created_at`, { svc: true }) }); }
    if (q.csat) { const sc = Math.round(+q.csat.score); if (!latest || latest.status !== 'resolved' || !latest.csat_requested || !(sc >= 1 && sc <= 5)) return res.status(400).json({ error: 'no survey pending' });
      await rest('csat', { method: 'POST', svc: true, prefer: 'resolution=merge-duplicates', body: { conversation_id: latest.id, account_id: a.id, score: sc, comment: String(q.csat.comment || '').slice(0, 500) } });
      await rest('conversations?id=eq.' + latest.id, { method: 'PATCH', svc: true, body: { csat_requested: false } }); return res.status(200).json({ ok: true }); }
    let text = String(q.text || '').trim().slice(0, 1500).replace(/\b\d{13,19}\b/g, '[REDACTED]'), vision = null;
    if (q.image) { try { vision = await inspect(q.image); } catch (e) { return res.status(400).json({ error: e.message }); } if (vision && vision.rejected) return res.status(400).json({ error: 'Image rejected by safety screening.' });
      text = text || (vision ? `[Image: ${vision.cnn_class}]` : '[Image attached]'); }
    if (!text) return res.status(400).json({ error: 'text required' });
    res.status(200).json(await inbound({ a, session, text, vision, name: q.name, email: q.email }));
  } catch (e) { console.error(e.message); res.status(200).json({ reply: FALL, handoff: true }); }
};
