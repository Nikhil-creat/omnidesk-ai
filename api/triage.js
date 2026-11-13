const { viaGroq, viaGemini } = require('./_ai');
const heur = t => { const l = t.toLowerCase(), f = /(angry|worst|refund|broken|scam|terrible|!!|unacceptable)/.test(l), h = /(human|agent|person|manager)/.test(l);
  return { intent: /refund|charge|bill/.test(l) ? 'billing' : /error|bug|crash|login/.test(l) ? 'technical' : 'general', sentiment: f ? 'frustrated' : 'neutral', priority: f ? 'high' : 'medium', confidence: .6, summary: t.slice(0, 90), engine: 'rules-fallback', human: h }; };
module.exports = async (req, res) => {
  const text = String((req.body && req.body.text) || '').slice(0, 1200).replace(/\b\d{13,19}\b/g, '[REDACTED]');
  if (!text) return res.status(400).json({ error: 'text required' });
  const ask = [{ role: 'user', content: 'Classify this customer message. Reply with ONLY JSON: {"intent":"billing|technical|sales|general","sentiment":"frustrated|neutral|positive","priority":"low|medium|high|urgent","confidence":0-1,"summary":"<=15 words","team":"billing|support|sales"}\n<untrusted>' + text + '</untrusted>' }];
  let out;
  for (const fn of [viaGroq, viaGemini]) { try { const r = await fn(ask); out = { ...JSON.parse(r.reply.match(/\{[\s\S]*\}/)[0]), engine: r.provider + ' · ' + r.model }; break; } catch (e) {} }
  if (!out) out = heur(text);
  out.human = out.human || /\b(human|agent|person|manager)\b/i.test(text);
  out.handoff = out.confidence < .75 || out.sentiment === 'frustrated' || out.human;
  res.status(200).json(out);
};
