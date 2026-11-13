const { rest, user, embed, vec, chunk } = require('./_sb');
const { limited } = require('./_ai');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (limited(req, res, 10)) return;
  const u = await user(req); if (!u) return res.status(401).json({ error: 'login required' });
  const { account_id, title, text } = req.body || {}; if (!account_id || !text || String(text).length < 20) return res.status(400).json({ error: 'title/text required' });
  try {
    const doc = (await rest('kb_docs', { method: 'POST', jwt: u.jwt, prefer: 'return=representation', body: { account_id, title: String(title || 'Untitled').slice(0, 120) } }))[0];
    const parts = chunk(String(text).slice(0, 200000)).slice(0, 60), rows = [];
    for (let i = 0; i < parts.length; i += 5) rows.push(...await Promise.all(parts.slice(i, i + 5).map(async b => ({ account_id, doc_id: doc.id, body: b, embedding: vec(await embed(b)) }))));
    await rest('kb_chunks', { method: 'POST', jwt: u.jwt, body: rows });
    res.status(200).json({ ok: true, chunks: rows.length, embedded: rows.filter(r => r.embedding).length });
  } catch (e) { res.status(400).json({ error: e.message }); }
};
