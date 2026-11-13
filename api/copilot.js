const { ask, limited } = require('./_ai');
const P = { summarize: 'Summarize this customer conversation in exactly 3 short bullet points.', draft: 'Write a concise, warm, professional support reply to this customer message. No placeholders.', translate: 'Translate this text into Telugu (Telugu script). Output only the translation.' };
module.exports = async (req, res) => {
  if (limited(req, res, 15)) return;
  const b = req.body || {}, text = String(b.text || '').slice(0, 1500), mode = P[b.mode] ? b.mode : 'draft';
  if (!text) return res.status(400).json({ error: 'text required' });
  const r = await ask([{ role: 'user', content: P[mode] + '\n<untrusted>' + text + '</untrusted>' }]);
  res.status(200).json(r ? { result: r.reply, engine: r.provider + ' \u00b7 ' + r.model } : { result: 'AI unavailable - routed to human queue.', engine: 'fallback' });
};
