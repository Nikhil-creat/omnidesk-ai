// Shared inbound pipeline for every channel (widget, Telegram, ...): conversation -> Captain (triage+RAG+confidence) -> handoff
const { rest, captain } = require('./_sb');
const FALL = "I don't have verified information on that \u2014 let me connect you with a specialist.";
async function inbound({ a, session, text, channel = 'widget', name, email, vision }) {
  let conv = (await rest(`conversations?account_id=eq.${a.id}&session=eq.${encodeURIComponent(session)}&status=neq.resolved&order=created_at.desc&limit=1`, { svc: true }))[0];
  if (!conv) { let cid = null; if (email || name) cid = (await rest('contacts', { method: 'POST', svc: true, prefer: 'return=representation', body: { account_id: a.id, name: String(name || '').slice(0, 80), email: email ? String(email).slice(0, 120) : null } }))[0].id;
    conv = (await rest('conversations', { method: 'POST', svc: true, prefer: 'return=representation', body: { account_id: a.id, session, contact_id: cid, channel } }))[0]; }
  await rest('messages', { method: 'POST', svc: true, body: { account_id: a.id, conversation_id: conv.id, sender: 'contact', body: text, meta: vision ? { vision } : {} } });
  if (conv.status === 'open') return { reply: null, human: true };
  const hist = await rest(`messages?conversation_id=eq.${conv.id}&order=created_at.asc&select=sender,body&limit=12`, { svc: true });
  const botCount = hist.filter(m => m.sender === 'bot').length; let out = null;
  if (botCount < 10) out = await captain({ acct: a.id, question: vision ? text + '\n[Image analysis: ' + JSON.stringify(vision) + ']' : text, history: hist, svc: true });
  const handoff = !out || out.confidence < .75 || out.sentiment === 'frustrated' || out.human_requested || botCount >= 10;
  const reply = !out || out.confidence < .75 ? FALL : out.answer;
  await rest('messages', { method: 'POST', svc: true, body: { account_id: a.id, conversation_id: conv.id, sender: 'bot', body: reply, meta: out ? { confidence: out.confidence, engine: out.engine, sources: out.sources } : { fallback: true } } });
  if (handoff) await rest('messages', { method: 'POST', svc: true, body: { account_id: a.id, conversation_id: conv.id, sender: 'note', body: 'AI handoff. ' + (out ? `Summary: ${out.summary}. Confidence ${out.confidence}, sentiment ${out.sentiment}.` : 'AI unavailable.') } });
  await rest('conversations?id=eq.' + conv.id, { method: 'PATCH', svc: true, body: { status: handoff ? 'open' : 'pending', priority: out && ['low', 'medium', 'high', 'urgent'].includes(out.priority) ? out.priority : 'medium', sentiment: out ? out.sentiment : null, summary: out ? out.summary : null, updated_at: new Date().toISOString() } });
  return { reply, handoff };
}
module.exports = { inbound, FALL };
